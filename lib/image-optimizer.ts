import { optimizeImage } from "wasm-image-optimization";
import { captureException } from "@/lib/sentry";

export interface ImageVariantSpec {
  name: string;
  width: number;
  /** Max height in pixels. If omitted, height is derived from the aspect ratio. */
  height?: number;
  format: "webp" | "avif";
  quality: number;
  speed?: number;
}

export interface OptimizedVariant {
  name: string;
  width: number;
  height: number;
  format: string;
  contentType: string;
  bytes: Uint8Array;
  size: number;
}

export interface OptimizeVariantsResult {
  originalWidth: number;
  originalHeight: number;
  originalFormat: string;
  originalAnimation: boolean;
  variants: OptimizedVariant[];
  totalBytes: number;
}

export class ImageOptimizerError extends Error {
  code: "too_large" | "too_many_pixels" | "unsupported_format" | "decode_failed" | "encode_failed";

  constructor(
    message: string,
    code:
      | "too_large"
      | "too_many_pixels"
      | "unsupported_format"
      | "decode_failed"
      | "encode_failed",
  ) {
    super(message);
    this.name = "ImageOptimizerError";
    this.code = code;
  }
}

const DEFAULT_VARIANTS: ImageVariantSpec[] = [
  { name: "thumb", width: 400, format: "webp", quality: 80 },
  { name: "small", width: 800, format: "webp", quality: 85 },
  { name: "medium", width: 1200, format: "webp", quality: 85 },
  { name: "master", width: 2048, format: "webp", quality: 85 },
];

const FORMAT_TO_CONTENT_TYPE: Record<string, string> = {
  webp: "image/webp",
  avif: "image/avif",
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  gif: "image/gif",
};

const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_MEGAPIXELS = 32; // 32 MP

/**
 * Pro image-compression pipeline.
 *
 * Reads an uploaded image, validates dimensions/payload, then produces a
 * set of responsive WebP variants (thumb/small/medium/master) plus an
 * optional AVIF master when IMAGE_OPTIMIZER_AVIF is enabled.
 *
 * Built on `wasm-image-optimization` so it runs on Node.js and Cloudflare
 * Workers (OpenNext / `nodejs_compat`).
 */
export async function optimizeImageVariants(
  input: Uint8Array,
  sourceContentType: string,
  opts: {
    variants?: ImageVariantSpec[];
    maxInputBytes?: number;
    maxMegapixels?: number;
    enableAvif?: boolean;
  } = {},
): Promise<OptimizeVariantsResult> {
  const maxInputBytes = opts.maxInputBytes ?? MAX_INPUT_BYTES;
  const maxMegapixels = opts.maxMegapixels ?? MAX_MEGAPIXELS;

  if (input.byteLength > maxInputBytes) {
    throw new ImageOptimizerError(
      `Image is too large (${(input.byteLength / 1024 / 1024).toFixed(1)}MB). Max ${(
        maxInputBytes /
        1024 /
        1024
      ).toFixed(0)}MB.`,
      "too_large",
    );
  }

  // Fast metadata pass: decodes just enough to get original dimensions and
  // format without encoding any pixels.
  let meta: Awaited<ReturnType<typeof optimizeImage>>;
  try {
    meta = await optimizeImage({ image: input, format: "none" });
  } catch (err) {
    captureException(err, { context: "[image-optimizer] metadata pass failed" });
    throw new ImageOptimizerError(
      "Could not read image metadata. The file may be corrupt.",
      "decode_failed",
    );
  }

  const mp = (meta.originalWidth * meta.originalHeight) / 1_000_000;
  if (mp > maxMegapixels) {
    throw new ImageOptimizerError(
      `Image resolution (${meta.originalWidth}x${meta.originalHeight}, ${mp.toFixed(1)}MP) exceeds the ${maxMegapixels}MP limit.`,
      "too_many_pixels",
    );
  }

  // Animated GIFs are kept as-is; re-encoding animations is CPU-heavy and
  // rarely needed for dashboard/blog assets.
  if (
    meta.originalAnimation &&
    (meta.originalFormat === "gif" || sourceContentType === "image/gif")
  ) {
    return {
      originalWidth: meta.originalWidth,
      originalHeight: meta.originalHeight,
      originalFormat: meta.originalFormat,
      originalAnimation: true,
      variants: [
        {
          name: "master",
          width: meta.originalWidth,
          height: meta.originalHeight,
          format: meta.originalFormat,
          contentType: sourceContentType,
          bytes: input,
          size: input.byteLength,
        },
      ],
      totalBytes: input.byteLength,
    };
  }

  const variants = opts.variants ? [...opts.variants] : [...DEFAULT_VARIANTS];
  if (opts.enableAvif) {
    variants.push({ name: "master-avif", width: 2048, format: "avif", quality: 80, speed: 6 });
  }

  const optimized: OptimizedVariant[] = [];
  let totalBytes = 0;

  for (const spec of variants) {
    // If the source is already smaller than the target width, encode at the
    // source width so we never upscale.
    const targetWidth = Math.min(spec.width, meta.originalWidth || 1);
    const targetHeight =
      spec.height && meta.originalHeight ? Math.min(spec.height, meta.originalHeight) : undefined;

    try {
      const result = await optimizeImage({
        image: input,
        width: targetWidth > 0 ? targetWidth : undefined,
        height: targetHeight && targetHeight > 0 ? targetHeight : undefined,
        fit: "contain",
        format: spec.format,
        quality: spec.quality,
        speed: spec.speed,
      });

      const bytes = result.data;
      const contentType = FORMAT_TO_CONTENT_TYPE[result.format] ?? `image/${result.format}`;

      optimized.push({
        name: spec.name,
        width: result.width,
        height: result.height,
        format: result.format,
        contentType,
        bytes,
        size: bytes.byteLength,
      });
      totalBytes += bytes.byteLength;
    } catch (err) {
      captureException(err, { context: `[image-optimizer] failed to encode variant ${spec.name}` });
      throw new ImageOptimizerError(
        `Failed to generate the ${spec.name} ${spec.format} variant.`,
        "encode_failed",
      );
    }
  }

  return {
    originalWidth: meta.originalWidth,
    originalHeight: meta.originalHeight,
    originalFormat: meta.originalFormat,
    originalAnimation: meta.originalAnimation,
    variants: optimized,
    totalBytes,
  };
}
