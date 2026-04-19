"use client";

/**
 * Initializes the Sentry browser SDK by importing the config as a side-effect.
 * Mount once in the root layout. Renders nothing.
 */
import "../sentry.client.config";

export function SentryBrowserInit() {
  return null;
}
