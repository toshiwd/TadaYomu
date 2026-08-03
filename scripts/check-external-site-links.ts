import { getExternalSiteBrowserParams } from '../src/services/externalSiteLinks';

let failed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
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

process.exit(failed > 0 ? 1 : 0);
