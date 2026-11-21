export const DEFAULT_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

/**
 * Named application User-Agent required by GDACS (whose F5 bot defense serves an HTML
 * JS challenge to browser UAs) and polite public APIs (USGS, NASA EONET, World Bank).
 */
export const NAMED_APP_UA = 'WorldMonitor-VN/1.0 (+https://localhost:8787; open-source-tactical-monitor)';

export interface HttpFetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  userAgent?: string;
  headers?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTextWithTimeout(url: string, options: HttpFetchOptions = {}): Promise<{
  text: string;
  contentType: string;
  status: number;
}> {
  const {
    timeoutMs = 12_000,
    retries = 1,
    retryDelayMs = 450,
    userAgent = NAMED_APP_UA,
    headers = {},
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 && retryDelayMs > 0) {
      await sleep(retryDelayMs * attempt);
    }
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const snippet = (await response.text().catch(() => '')).slice(0, 180).replace(/\s+/g, ' ').trim();
        const err = new Error(`HTTP ${response.status} from ${new URL(url).hostname}${snippet ? `: ${snippet}` : ''}`);
        // Do not retry 4xx client/rate-limit responses
        if (response.status >= 400 && response.status < 500) {
          Object.assign(err, { noRetry: true });
        }
        throw err;
      }

      const contentType = response.headers.get('content-type') ?? '';
      const text = await response.text();
      return { text, contentType, status: response.status };
    } catch (error) {
      lastError = error;
      if ((error as { noRetry?: boolean })?.noRetry) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJsonWithTimeout<T>(url: string, options: HttpFetchOptions = {}): Promise<T> {
  const { text, contentType } = await fetchTextWithTimeout(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`Empty JSON response from ${new URL(url).hostname}`);
  }

  // Guard against HTML bot-challenge pages or plain-text rate limit messages served with 200 OK
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error(`Received HTML challenge instead of JSON from ${new URL(url).hostname} (${contentType})`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Invalid JSON from ${new URL(url).hostname}: ${trimmed.slice(0, 140).replace(/\s+/g, ' ')}`,
    );
  }
}
