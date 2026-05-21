import { fetchWithTimeout } from "./fetch-timeout";

export interface FetchWithRetryOptions extends RequestInit {
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (response: Response | Error, attempt: number) => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 10000;

function defaultShouldRetry(responseOrError: Response | Error, attempt: number): boolean {
  if (attempt >= DEFAULT_MAX_ATTEMPTS) return false;
  if (responseOrError instanceof Error) return true;
  return responseOrError.status >= 500 && responseOrError.status < 600;
}

function fullJitter(baseDelay: number, maxDelay: number, attempt: number): number {
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  return Math.floor(Math.random() * exponentialDelay);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    shouldRetry = defaultShouldRetry,
    ...fetchOptions
  } = options;

  let lastError: Error | Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, { ...fetchOptions, timeoutMs });
      if (!shouldRetry(response, attempt)) {
        return response;
      }
      lastError = response;
    } catch (err) {
      lastError = err as Error;
      if (!shouldRetry(err as Error, attempt)) {
        throw err;
      }
    }

    if (attempt < maxAttempts) {
      const delayMs = fullJitter(baseDelayMs, maxDelayMs, attempt);
      await delay(delayMs);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  return lastError as Response;
}
