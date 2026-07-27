"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center">
      <ImageIcon className="size-10 text-muted-foreground" aria-hidden="true" />
      {type && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {type}
        </span>
      )}
      {title && (
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{title}</p>
      )}
    </div>
  );

  return (
    <Link
      href={href}
      aria-label={alt}
      className="relative block aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-muted"
    >
      {image ?? fallback}
    </Link>
  );
}
