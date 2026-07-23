"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FileText, ImageIcon } from "lucide-react";
import { shimmerPlaceholder } from "@/lib/image-placeholder";

interface ContentCardImageProps {
  href: string;
  src?: string | null;
  alt: string;
  title?: string;
  type?: string;
  priority?: boolean;
}

export function ContentCardImage({
  href,
  src,
  alt,
  title,
  type,
  priority = false,
}: ContentCardImageProps) {
  const [imgError, setImgError] = useState(false);

  const image =
    src && !imgError ? (
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
        placeholder="blur"
        blurDataURL={shimmerPlaceholder(400, 250)}
        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        onError={() => setImgError(true)}
      />
    ) : null;

  const fallback = !image && (
    <div
      className="flex h-full w-full flex-col justify-end bg-slate-800 bg-cover bg-center p-4"
      style={{ backgroundImage: "url(/images/content-fallback-bg.png)" }}
      aria-hidden={!!title}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
      <div className="relative z-10">
        {type && (
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground backdrop-blur-sm">
            <FileText className="size-3" aria-hidden="true" />
            {type}
          </span>
        )}
        {title && (
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white shadow-black drop-shadow-md">
            {title}
          </p>
        )}
        {!title && <ImageIcon className="size-10 text-white/80" aria-hidden="true" />}
      </div>
    </div>
  );

  return (
    <Link
      href={href}
      aria-label={alt}
      className="relative block aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-gray-100"
    >
      {image ?? fallback}
    </Link>
  );
}
