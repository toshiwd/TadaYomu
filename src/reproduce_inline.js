
// Basic reproduction script for Syosetu parser
// This replicates the logic from src/services/adapters/syosetuAdapter.ts

const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
                'Cookie': 'over18=yes'
            }
        };

        https.get(url, options, (res) => {
            let data = '';

            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`Status Code: ${res.statusCode}`));
                return;
            }

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

function htmlToNovelFormat(html) {
    let text = html;
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');
    text = text.replace(/<ruby>(.*?)<rp>.*?<\/rp><rt>(.*?)<\/rt><rp>.*?<\/rp><\/ruby>/gi, '|$1《$2》');
    text = text.replace(/<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gi, '|$1《$2》');
    text = text.replace(/<[^>]+>/g, '');
    text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
    return text.trim();
}

async function run() {
    // URL for "公爵令嬢はメイドの忠告をきかない" Chapter 1
    const url = 'https://ncode.syosetu.com/n6195lp/1/';
    console.log(`Fetching: ${url}`);


    // Test Regex Robustness
    console.log('--- Regex Robustness Test ---');
    const testHtml = '<div id="test" class="p-novel__text">Body</div>';
    const mobileRegex = /<div\s+[^>]*class="[^"]*(?:js-novel-text|p-novel__text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
    const match = testHtml.match(mobileRegex);
    if (match) {
        console.log('Regex matched nested attribute!');
    } else {
        console.log('FAIL: Regex did NOT match nested attribute!');
    }

    try {
        const html = await fetchUrl(url);
        console.log(`Fetched HTML length: ${html.length}`);

        // Logic from syosetuAdapter.ts
        let bodyHtml = '';
        const pcBodyMatch = html.match(/<div\s+[^>]*id="novel_honbun"[^>]*>([\s\S]*?)<\/div>/i);
        const mobileBodyMatch = html.match(/<div\s+[^>]*class="[^"]*(?:js-novel-text|p-novel__text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

        if (pcBodyMatch) {
            console.log('Found PC body match!');
            bodyHtml = pcBodyMatch[1];
        } else if (mobileBodyMatch) {
            console.log('Found Mobile body match!');
            bodyHtml = mobileBodyMatch[1];
        } else {
            console.error('FAIL: No body content found with current regex!');

            // Print some context to see what the HTML actually looks like around where body should be
            // Look for "novel_honbun" or similar keywords
            const debugMatch = html.match(/.{100}(novel_honbun|p-novel__text|js-novel-text).{100}/);
            if (debugMatch) {
                console.log('Context around match:', debugMatch[0]);
            } else {
                console.log('No known keywords found in HTML.');
            }
        }

        if (bodyHtml) {
            const rubyText = htmlToNovelFormat(bodyHtml);
            console.log(`Converted Text length: ${rubyText.length}`);
            console.log('Preview:', rubyText.substring(0, 100));
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

run();
