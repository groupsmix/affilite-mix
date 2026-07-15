"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { shimmerPlaceholder } from "@/lib/image-placeholder";

interface ContentCardImageProps {
  href: string;
  src: string;
  alt: string;
  priority?: boolean;
}

export function ContentCardImage({ href, src, alt, priority = false }: ContentCardImageProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <Link href={href}>
      {imgError ? (
        <div className="flex h-44 w-full items-center justify-center bg-gray-100 text-gray-400">
          <svg
            className="h-10 w-10"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
            />
          </svg>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          width={400}
          height={176}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          placeholder="blur"
          blurDataURL={shimmerPlaceholder(400, 176)}
          className="h-44 w-full object-cover"
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          onError={() => setImgError(true)}
        />
      )}
    </Link>
  );
}
