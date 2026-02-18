const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
                'Cookie': 'over18=yes'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        }).on('error', reject);
    });
}

async function test(novelCode) {
    console.log(`\n=== Testing ${novelCode} ===`);
    const html = await fetchUrl(`https://ncode.syosetu.com/${novelCode}/1/`);
    console.log('HTML length:', html.length);

    // PC regex
    const pcMatch = html.match(/<div\s+[^>]*id="novel_honbun"[^>]*>([\s\S]*?)<\/div>/i);
    console.log('PC match (novel_honbun):', !!pcMatch);

    // Mobile regex (current code)
    const mobileMatch = html.match(/<div\s+[^>]*class="[^"]*(?:js-novel-text|p-novel__text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    console.log('Mobile match:', !!mobileMatch, mobileMatch ? mobileMatch[1].length : 'N/A');

    if (mobileMatch && mobileMatch[1].length > 0) {
        console.log('Preview:', mobileMatch[1].substring(0, 150));
    }

    // Check subtitle
    const subtitle = html.match(/<[^>]+class="[^"]*p-novel__subtitle[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
    console.log('Subtitle match:', !!subtitle);
    if (subtitle) console.log('  Subtitle:', subtitle[1].substring(0, 80).replace(/<[^>]+>/g, ''));
}

async function main() {
    await test('n3340jo');  // User's novel (112 chapters)
    await test('n9669bk');  // Test novel
}

main().catch(console.error);
