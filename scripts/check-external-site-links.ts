import {
  extractHttpUrls,
  getExternalSiteBrowserParams,
  getSharedExternalSiteBrowserParams,
  isTrustedXShortUrl,
} from '../src/services/externalSiteLinks';

let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`PASS: ${label}`);
    return;
  }
  console.error(`FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  failed += 1;
}

const supportedCases = [
  ['https://ncode.syosetu.com/n6316bn/', 'ncode.syosetu.com', '小説家になろう'],
  ['https://syosetu.com/', 'syosetu.com', '小説家になろう'],
  ['https://yomou.syosetu.com/rank/top/', 'yomou.syosetu.com', '小説家になろう'],
  ['https://novel18.syosetu.com/n0381mn/', 'novel18.syosetu.com', 'ノクターンノベルズ'],
  ['https://syosetu.org/novel/409137/', 'syosetu.org', 'ハーメルン'],
] as const;

for (const [url, expectedDomain, expectedName] of supportedCases) {
  const params = getExternalSiteBrowserParams(url);
  check(`${expectedDomain} is supported`, params?.siteDomain, expectedDomain);
  check(`${expectedDomain} site name`, params?.siteName, expectedName);
  check(`${expectedDomain} keeps URL`, params?.url, url);
}

for (const url of [
  'https://example.com/',
  'https://ncode.syosetu.com.example.com/n1234/',
  'tadayomu://open/n1234',
  'https://user:password@ncode.syosetu.com/n1234/',
  'https://ncode.syosetu.com:8443/n1234/',
  'not a URL',
]) {
  check(`${url} is rejected`, getExternalSiteBrowserParams(url), null);
}

async function checkSharedLinks(): Promise<void> {
  check(
    'extracts URL from browser share text',
    extractHttpUrls('作品タイトル https://syosetu.org/novel/417038/'),
    ['https://syosetu.org/novel/417038/'],
  );
  check(
    'trims Japanese punctuation around a shared URL',
    extractHttpUrls('「https://ncode.syosetu.com/n6316bn/」'),
    ['https://ncode.syosetu.com/n6316bn/'],
  );
  check('accepts HTTPS t.co', isTrustedXShortUrl('https://t.co/AbCd1234'), true);
  check('rejects HTTP t.co', isTrustedXShortUrl('http://t.co/AbCd1234'), false);
  check('rejects a t.co lookalike', isTrustedXShortUrl('https://t.co.example.com/AbCd1234'), false);

  let resolverCalls = 0;
  const direct = await getSharedExternalSiteBrowserParams(
    'https://syosetu.org/novel/417038/ https://t.co/ignored',
    async () => {
      resolverCalls += 1;
      return 'https://example.com/';
    },
  );
  check('direct supported URL wins', direct?.url, 'https://syosetu.org/novel/417038/');
  check('direct supported URL avoids network resolution', resolverCalls, 0);

  const redirected = await getSharedExternalSiteBrowserParams(
    'Xから共有 https://t.co/AbCd1234',
    async () => 'https://syosetu.org/novel/417038/',
  );
  check('accepts supported t.co destination', redirected?.url, 'https://syosetu.org/novel/417038/');

  const rejectedRedirect = await getSharedExternalSiteBrowserParams(
    'https://t.co/AbCd1234',
    async () => 'https://example.com/',
  );
  check('rejects unsupported t.co destination', rejectedRedirect, null);

  const untrustedWasNotResolved = await getSharedExternalSiteBrowserParams(
    'https://example.com/redirect',
    async () => 'https://syosetu.org/novel/417038/',
  );
  check('does not resolve non-t.co links', untrustedWasNotResolved, null);
}

void checkSharedLinks().then(() => {
  process.exit(failed > 0 ? 1 : 0);
});
