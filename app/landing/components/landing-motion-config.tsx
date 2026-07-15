"use client";

import { MotionConfig } from "framer-motion";

/**
 * Wraps landing pages in a MotionConfig that honours the user's
 * `prefers-reduced-motion` setting. This disables transform/opacity
 * animations for motion-sensitive users across all landing sections
 * without editing each `motion.*` call site.
 */
export function LandingMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
