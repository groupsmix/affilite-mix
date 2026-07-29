"use client";

import Image from "next/image";
import { useState } from "react";

function getInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const chars = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase());
  return chars.join("") || name.charAt(0).toUpperCase();
}

export function InitialAvatar({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-accent,#16A34A)]/10 text-sm font-bold text-[color:var(--color-accent-text,#15803D)] ${className ?? ""}`}
    >
      {getInitials(name)}
    </span>
  );
}

interface ProductLogoProps {
  name: string;
  src?: string | null;
  alt?: string;
  size?: number;
  fill?: boolean;
  sizes?: string;
  className?: string;
  priority?: boolean;
}

export function ProductLogo({
  name,
  src,
  alt,
  size = 40,
  fill = false,
  sizes,
  className,
  priority = false,
}: ProductLogoProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className ?? ""}`}
        style={fill ? undefined : { width: size, height: size }}
      >
        <span className="text-sm font-bold text-[color:var(--color-accent-text,#15803D)]">
          {getInitials(name)}
        </span>
      </span>
    );
  }

  if (fill) {
    return (
      <span className={`relative inline-block ${className ?? ""}`}>
        <Image
          src={src}
          alt={alt ?? name}
          fill
          sizes={sizes ?? "96px"}
          className="object-contain"
          priority={priority}
          onError={() => setError(true)}
        />
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt ?? name}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className ?? ""}`}
      priority={priority}
      onError={() => setError(true)}
    />
  );
}
