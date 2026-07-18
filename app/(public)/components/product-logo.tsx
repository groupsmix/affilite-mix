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
  className?: string;
  priority?: boolean;
}

export function ProductLogo({
  name,
  src,
  alt,
  size = 40,
  className,
  priority = false,
}: ProductLogoProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return <InitialAvatar name={name} size={size} className={className} />;
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
