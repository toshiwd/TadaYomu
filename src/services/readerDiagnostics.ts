type Outcome = 'not_attempted' | 'pending' | 'success' | 'failed';

type ReaderDiagnostic = {
  screen: string;
  stage: string;
  url: string | null;
  finalUrl: string | null;
  httpStatus: number | null;
  htmlFetch: Outcome;
  htmlParse: Outcome;
  readerRender: Outcome;
  entry: 'app_start' | 'normal_navigation';
  retryCount: number;
  sharedInFlight: boolean;
};

const appStartedAt = Date.now();
let diagnostic: ReaderDiagnostic = {
  screen: 'startup', stage: 'app_initialization', url: null, finalUrl: null, httpStatus: null,
  htmlFetch: 'not_attempted', htmlParse: 'not_attempted', readerRender: 'not_attempted',
  entry: 'app_start', retryCount: 0, sharedInFlight: false,
};

export function setDiagnosticScreen(screen: string): void {
  if (screen !== diagnostic.screen) {
    diagnostic = {
      screen, stage: screen === 'Reader' ? 'reader_mount' : 'screen_render',
      url: null, finalUrl: null, httpStatus: null,
      htmlFetch: 'not_attempted', htmlParse: 'not_attempted', readerRender: 'not_attempted',
      entry: Date.now() - appStartedAt < 30_000 ? 'app_start' : 'normal_navigation',
      retryCount: 0, sharedInFlight: false,
    };
  }
}

export function beginReaderAttempt(url: string | null, retryCount: number): void {
  diagnostic = {
    screen: 'Reader', stage: 'chapter_lookup', url, finalUrl: null, httpStatus: null,
    htmlFetch: 'not_attempted', htmlParse: 'not_attempted', readerRender: 'not_attempted',
    entry: Date.now() - appStartedAt < 30_000 ? 'app_start' : 'normal_navigation',
    retryCount, sharedInFlight: false,
  };
}

export function setReaderStage(stage: string, changes: Partial<ReaderDiagnostic> = {}): void {
  diagnostic = { ...diagnostic, stage, ...changes };
}

function tracksUrl(url: string): boolean {
  return Boolean(diagnostic.screen === 'Reader' &&
    (diagnostic.url === url ||
      (diagnostic.stage === 'chapter_list_fetch' && diagnostic.url === null) ||
      (diagnostic.url?.includes('/?p=') && url.startsWith(diagnostic.url.split('?')[0] + '?p='))));
}

export function noteReaderHttpStart(url: string): void {
  if (tracksUrl(url)) setReaderStage('html_fetch', { url, finalUrl: null, httpStatus: null, htmlFetch: 'pending' });
}

export function noteReaderSharedRead(url: string): void {
  if (tracksUrl(url)) setReaderStage('shared_inflight_read', { sharedInFlight: true });
}

export function noteReaderHttpResponse(url: string, status: number, finalUrl = url): void {
  if (tracksUrl(url)) setReaderStage('html_response', { httpStatus: status, finalUrl });
}

export function noteReaderHtmlFetched(url: string): void {
  if (tracksUrl(url)) setReaderStage('html_fetched', { htmlFetch: 'success', htmlParse: 'pending' });
}

export function noteReaderHttpFailure(url: string, error: unknown): void {
  if (tracksUrl(url)) {
    logReaderFailure('html_fetch_failed', error, { url });
  } else {
    console.error('[AdapterFetchFailure]', JSON.stringify({ url, ...classifyReaderError(error) }));
  }
}

export function noteReaderHtmlParsed(url: string, success: boolean): void {
  if (tracksUrl(url)) setReaderStage('html_parsed', { htmlParse: success ? 'success' : 'failed' });
}

export function noteReaderHtmlParseFailure(url: string, error: unknown): void {
  if (tracksUrl(url)) {
    noteReaderHtmlParsed(url, false);
    logReaderFailure('html_parse_failed', error, { url });
  } else {
    console.error('[AdapterParseFailure]', JSON.stringify({ url, ...classifyReaderError(error) }));
  }
}

export function classifyReaderError(error: unknown): {
  exceptionType: string; timeout: boolean | null; dns: boolean | null; tls: boolean | null;
  networkError: boolean; networkSubtype: 'timeout' | 'dns' | 'tls' | 'generic' | 'unknown';
  httpStatus: number | null;
} {
  const exceptionType = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const httpStatus = Number(message.match(/\bHTTP\s+([1-5]\d{2})\b/i)?.[1]) || null;
  const knownTimeout = /timeout|timed out|ETIMEDOUT|AbortError/i.test(`${exceptionType} ${message}`);
  const knownDns = /ENOTFOUND|EAI_AGAIN|UnknownHost|DNS/i.test(message);
  const knownTls = /TLS|SSL|CERT|handshake/i.test(message);
  const networkError = knownTimeout || knownDns || knownTls ||
    /Network request failed|network error|fetch failed/i.test(message);
  const subtypeUnknown = networkError && !knownTimeout && !knownDns && !knownTls;
  const timeout = subtypeUnknown ? null : knownTimeout;
  const dns = subtypeUnknown ? null : knownDns;
  const tls = subtypeUnknown ? null : knownTls;
  const networkSubtype = knownTimeout ? 'timeout' : knownDns ? 'dns' : knownTls ? 'tls' :
    networkError ? 'generic' : 'unknown';
  return { exceptionType, timeout, dns, tls, networkError, networkSubtype, httpStatus };
}

export function logReaderFailure(stage: string, error: unknown, details: Record<string, unknown> = {}): void {
  const classified = classifyReaderError(error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorUrl = errorMessage.match(/https?:\/\/[^\s]+/)?.[0];
  setReaderStage(stage, {
    url: errorUrl ?? diagnostic.url,
    httpStatus: classified.httpStatus ?? diagnostic.httpStatus,
    ...(stage === 'reader_render_failed' ? { readerRender: 'failed' as const } : {}),
    ...(stage === 'html_fetch_failed' ? { htmlFetch: 'failed' as const } : {}),
  });
  console.error('[ReaderDiagnostic]', JSON.stringify({
    ...diagnostic, ...classified, httpStatus: diagnostic.httpStatus,
    errorMessage,
    appUptimeMs: Date.now() - appStartedAt, ...details,
  }));
}

export function logReaderWebViewFailure(
  url: string,
  error: unknown,
  webViewHttpStatus: number | null = null,
): void {
  const classified = classifyReaderError(error);
  if (webViewHttpStatus === null) {
    setReaderStage('reader_render_failed', { readerRender: 'failed' });
  }
  console.error('[ReaderWebViewFailure]', JSON.stringify({
    ...getReaderDiagnostic(),
    exceptionType: classified.exceptionType,
    networkSubtype: classified.networkSubtype,
    webViewUrl: url,
    webViewHttpStatus,
    errorMessage: error instanceof Error ? error.message : String(error),
  }));
}

export function getReaderDiagnostic(): ReaderDiagnostic & { appUptimeMs: number } {
  return { ...diagnostic, appUptimeMs: Date.now() - appStartedAt };
}
