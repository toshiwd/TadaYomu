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

/**
 * Converts an external HTTP(S) link into SiteBrowser route parameters.
 * Exact host matching prevents lookalike domains from being opened in-app.
 */
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
    if (!siteName) {
      return null;
    }

    return {
      siteDomain,
      siteName,
      url: parsedUrl.toString(),
    };
  } catch {
    return null;
  }
}
