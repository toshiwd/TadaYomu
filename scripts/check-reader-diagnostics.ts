import assert from 'node:assert/strict';
import {
  beginReaderAttempt, classifyReaderError, getReaderDiagnostic,
  noteReaderHttpStart, noteReaderHttpResponse, noteReaderHtmlFetched,
  noteReaderHtmlParsed, noteReaderHttpFailure, noteReaderSharedRead,
  logReaderWebViewFailure, setReaderStage,
} from '../src/services/readerDiagnostics';
import { syosetuAdapter } from '../src/services/adapters/syosetuAdapter';
import { runChapterReadSingleFlight } from '../src/services/readerPrefetch';

const url = 'https://ncode.syosetu.com/n1234/1/';
beginReaderAttempt(url, 2);
noteReaderHttpStart(url);
noteReaderHttpResponse(url, 200);
noteReaderHtmlFetched(url);
noteReaderHtmlParsed(url, true);
setReaderStage('reader_rendered', { readerRender: 'success' });
assert.deepEqual(
  (({ url, httpStatus, htmlFetch, htmlParse, readerRender, retryCount }) =>
    ({ url, httpStatus, htmlFetch, htmlParse, readerRender, retryCount }))(getReaderDiagnostic()),
  { url, httpStatus: 200, htmlFetch: 'success', htmlParse: 'success',
    readerRender: 'success', retryCount: 2 },
);

beginReaderAttempt(url, 0);
noteReaderSharedRead(url);
assert.equal(getReaderDiagnostic().sharedInFlight, true);
setReaderStage('chapter_text_ready', { readerRender: 'pending' });
assert.equal(getReaderDiagnostic().htmlFetch, 'not_attempted', 'local text must not imply HTTP success');

assert.equal(classifyReaderError(new Error('HTTP 503: chapter')).httpStatus, 503);
assert.equal(classifyReaderError(new Error('HTTP 403: chapter')).httpStatus, 403);
assert.equal(classifyReaderError(new Error('Network request failed')).networkSubtype, 'generic');
assert.equal(classifyReaderError(new Error('Network request failed')).dns, null);
assert.equal(classifyReaderError(new Error('UnknownHostException')).networkSubtype, 'dns');
assert.equal(classifyReaderError(new Error('SSL handshake failed')).networkSubtype, 'tls');
assert.equal(classifyReaderError(new Error('request timed out')).networkSubtype, 'timeout');

beginReaderAttempt(url, 1);
noteReaderHttpStart(url);
noteReaderHttpResponse(url, 503);
const failures: string[] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => { failures.push(String(args[1])); };
try {
  noteReaderHttpFailure(url, new Error(`HTTP 503: ${url}`));
} finally {
  console.error = originalError;
}
const failure = JSON.parse(failures[0]);
assert.equal(failure.url, url);
assert.equal(failure.httpStatus, 503);
assert.equal(failure.htmlFetch, 'failed');
assert.equal(failure.retryCount, 1);

beginReaderAttempt(url, 0);
noteReaderHttpStart(url);
noteReaderHttpResponse(url, 200);
const originalWebViewError = console.error;
console.error = () => {};
try {
  logReaderWebViewFailure('https://fonts.googleapis.com/css', new Error('HTTP 403'), 403);
} finally {
  console.error = originalWebViewError;
}
assert.equal(getReaderDiagnostic().httpStatus, 200,
  'a WebView resource error must not replace the chapter HTTP status');
console.log('PASS: reader failure stages and network classification');

async function checkAdapterStages() {
  beginReaderAttempt(url, 0);
  const firstRead = runChapterReadSingleFlight('diagnostic-test', async () => 'text');
  const sharedRead = runChapterReadSingleFlight('diagnostic-test', async () => 'duplicate',
    () => noteReaderSharedRead(url));
  assert.equal(sharedRead, firstRead);
  assert.equal(getReaderDiagnostic().sharedInFlight, true);
  await firstRead;

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  try {
    globalThis.fetch = async () => {
      fetchCount++;
      return fetchCount === 1
        ? new Response('<p id="L1">本文です。</p>', { status: 200 })
        : new Response('temporary failure', { status: 503 });
    };
    beginReaderAttempt(url, 0);
    await syosetuAdapter.getChapterContent('n1234', url);
    assert.equal(getReaderDiagnostic().htmlFetch, 'success');
    assert.equal(getReaderDiagnostic().htmlParse, 'success');

    beginReaderAttempt(url, 0);
    const savedError = console.error;
    console.error = () => {};
    try {
      await assert.rejects(syosetuAdapter.getChapterContent('n1234', url), /HTTP 503/);
    } finally {
      console.error = savedError;
    }
    assert.equal(getReaderDiagnostic().httpStatus, 503);
    assert.equal(getReaderDiagnostic().htmlFetch, 'failed');
    assert.equal(fetchCount, 2, 'an HTTP failure must not be silently retried');
    console.log('PASS: adapter distinguishes successful HTML parsing from HTTP 503');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void checkAdapterStages().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
