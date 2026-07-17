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
  priority?: boolean;
}

export function ContentCardImage({ href, src, alt, priority = false }: ContentCardImageProps) {
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
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
        <ImageIcon className="h-10 w-10" aria-hidden="true" />
      </div>
    );

  return (
    <Link href={href} className="relative block aspect-[16/10] w-full overflow-hidden bg-gray-100">
      {image}
    </Link>
  );
}
