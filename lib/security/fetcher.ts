import { isValidUrl } from './ssrf';

export async function fetchExternalData(url: string) {
  // 39. Add SSRF protections
  if (!isValidUrl(url)) {
    throw new Error(`SSRF Blocked: URL is invalid or targets private IP ranges: ${url}`);
  }

  const response = await fetch(url, { redirect: 'manual' });
  
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (location && !isValidUrl(location)) {
      throw new Error(`SSRF Blocked: Redirect targets private IP ranges: ${location}`);
    }
  }

  // Check oversized responses (e.g. 5MB)
  const size = parseInt(response.headers.get('content-length') || '0', 10);
  if (size > 5 * 1024 * 1024) {
    throw new Error('SSRF Blocked: Response size exceeds 5MB limit');
  }

  return response;
}
