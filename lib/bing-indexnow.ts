import { safeFetch } from "@/lib/ssrf-guard";
import { logger } from "@/lib/logger";

/**
 * Bing IndexNow + generic IndexNow network submission.
 *
 * IndexNow instantly notifies participating search engines (Bing, Yandex,
 * Naver, Seznam.cz, etc.) that a URL has been added/updated/deleted so it can
 * be crawled faster. ChatGPT search is powered by Bing's index, so this also
 * accelerates AI-engine visibility.
 *
 * Requires a random alphanumeric key. The key must be exposed at a known URL
 * on the origin domain; we expose it at `https://<host>/indexnow.txt`.
 *
 * Spec: https://www.indexnow.org/documentation
 */

export interface IndexNowSubmitOptions {
  host: string;
  key: string;
  urls: string[];
}

export interface IndexNowSubmitResult {
  ok: boolean;
  host: string;
  status: number;
  error?: string;
}

const INDEXNOW_ENDPOINTS = [
  "https://www.bing.com/indexnow",
  "https://yandex.com/indexnow",
  "https://search.seznam.cz/indexnow",
  "https://search.naver.com/indexnow",
];

function getKeyLocation(host: string, key: string): string {
  // Standard IndexNow expects https://host/<key>.txt, but all participating
  // engines also accept an explicit keyLocation query/body parameter. We use
  // the fixed /indexnow.txt path (content = key) and pass keyLocation.
  return `https://${host}/indexnow.txt`;
}

/**
 * Submit a list of URLs to the IndexNow network.
 * Returns per-endpoint results; failures are best-effort and logged.
 */
export async function submitIndexNow(
  options: IndexNowSubmitOptions,
): Promise<IndexNowSubmitResult[]> {
  const { host, key, urls } = options;
  if (!key || urls.length === 0) {
    return [];
  }

  const keyLocation = getKeyLocation(host, key);
  const payload = JSON.stringify({
    host,
    key,
    keyLocation,
    urlList: urls,
  });

  const results = await Promise.all(
    INDEXNOW_ENDPOINTS.map(async (endpoint) => {
      try {
        const res = await safeFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: payload,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          logger.warn("IndexNow submission failed", {
            endpoint,
            host,
            status: res.status,
            body: text.slice(0, 200),
          });
          return { ok: false, host, status: res.status, error: text.slice(0, 200) };
        }

        return { ok: true, host, status: res.status };
      } catch (err) {
        logger.warn("IndexNow submission error", {
          endpoint,
          host,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          ok: false,
          host,
          status: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return results;
}

/** Read the IndexNow key from env (configured once per deployment). */
export function getIndexNowKey(): string | undefined {
  return process.env.BING_INDEXNOW_KEY?.trim();
}

/** Validate that a key is safe: alphanumeric, hyphen, underscore only. */
export function isValidIndexNowKey(key: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(key);
}
