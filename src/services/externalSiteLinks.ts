export type ExternalSiteBrowserParams = {
  siteDomain: string;
  siteName: string;
  url: string;
};

const SUPPORTED_EXTERNAL_SITE_NAMES: Readonly<Record<string, string>> = {
  'ncode.syosetu.com': '小説家になろう',
  'syosetu.com': '小説家になろう',
  'www.syosetu.com': '小説家になろう',
  'yomou.syosetu.com': '小説家になろう',
  'novel18.syosetu.com': 'ノクターンノベルズ',
  'syosetu.org': 'ハーメルン',
};

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'「」『』【】]+/giu;
const TRAILING_TEXT_PUNCTUATION = /[.,!?;:。、！？」』】）)]+$/u;
const TCO_HOST = 't.co';
const REDIRECT_TIMEOUT_MS = 8_000;

export type RedirectResolver = (shortUrl: string) => Promise<string | null>;

/** Convert a supported external HTTP(S) link into SiteBrowser route params. */
export function getExternalSiteBrowserParams(
  rawUrl: string,
): ExternalSiteBrowserParams | null {
  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
    if (parsedUrl.username || parsedUrl.password || parsedUrl.port) {
      return null;
    }

    const siteDomain = parsedUrl.hostname.toLowerCase();
    const siteName = SUPPORTED_EXTERNAL_SITE_NAMES[siteDomain];
    if (!siteName) return null;

    return { siteDomain, siteName, url: parsedUrl.toString() };
  } catch {
    return null;
  }
}

/** Extract unique HTTP(S) links from text shared by browsers and social apps. */
export function extractHttpUrls(sharedText: string): string[] {
  const matches = sharedText.match(HTTP_URL_PATTERN) ?? [];
  const urls: string[] = [];

  for (const match of matches) {
    const candidate = match.replace(TRAILING_TEXT_PUNCTUATION, '');
    try {
      const parsedUrl = new URL(candidate);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') continue;
      const normalized = parsedUrl.toString();
      if (!urls.includes(normalized)) urls.push(normalized);
    } catch {
      // Ignore malformed URL-like text and continue scanning the share payload.
    }
  }

  return urls;
}

/** Only X's HTTPS short links are eligible for network redirect resolution. */
export function isTrustedXShortUrl(rawUrl: string): boolean {
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.protocol === 'https:'
      && parsedUrl.hostname.toLowerCase() === TCO_HOST
      && !parsedUrl.username
      && !parsedUrl.password
      && !parsedUrl.port;
  } catch {
    return false;
  }
}

/** Follow an X short URL without downloading the destination page body. */
export async function resolveXShortUrl(shortUrl: string): Promise<string | null> {
  if (!isTrustedXShortUrl(shortUrl)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REDIRECT_TIMEOUT_MS);
  try {
    const response = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    return response.url && !isTrustedXShortUrl(response.url) ? response.url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve a shared text payload to an allowed SiteBrowser destination. */
export async function getSharedExternalSiteBrowserParams(
  sharedText: string,
  resolveRedirect: RedirectResolver = resolveXShortUrl,
): Promise<ExternalSiteBrowserParams | null> {
  const urls = extractHttpUrls(sharedText);

  for (const url of urls) {
    const directParams = getExternalSiteBrowserParams(url);
    if (directParams) return directParams;
  }

  for (const url of urls) {
    if (!isTrustedXShortUrl(url)) continue;
    const destination = await resolveRedirect(url);
    if (!destination) continue;
    const redirectedParams = getExternalSiteBrowserParams(destination);
    if (redirectedParams) return redirectedParams;
  }

  return null;
}
