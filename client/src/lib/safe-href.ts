/**
 * Feed/API URLs are untrusted: a `javascript:` or `data:` href would run script on click.
 * Returns the URL only for http(s) or relative links, otherwise undefined (anchor stays inert).
 * The URL parser strips leading whitespace and tab/newline tricks, so those cannot sneak past.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url, 'https://invalid.example');
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}
