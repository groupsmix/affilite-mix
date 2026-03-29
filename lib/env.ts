/**
 * Shared environment variable helpers.
 */

/**
 * Read an environment variable, throwing in production if it is missing.
 * In development, returns the provided fallback instead.
 */
export function requireEnvInProduction(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} environment variable is required in production`);
  }
  return fallback;
}
