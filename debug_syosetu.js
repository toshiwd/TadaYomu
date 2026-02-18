const https = require('https');

const url = 'https://ncode.syosetu.com/n6316bn/1/';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36';

console.log(`Fetching ${url}...`);

https.get(url, {
    headers: {
        'User-Agent': USER_AGENT,
        'Cookie': 'over18=yes', // Just in case
    }
}, (res) => {
    let html = '';
    res.on('data', (chunk) => { html += chunk; });
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Total length: ${html.length}`);

        // Try strategies
        // Strategy 1: Current site format — <div class="js-novel-text p-novel__text">
        const mobileBodyMatch = html.match(/<div\s+[^>]*class="[^"]*(?:js-novel-text|p-novel__text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        // Strategy 2: Old PC format — <div id="novel_honbun">
        const pcBodyMatch = html.match(/<div\s+[^>]*id="novel_honbun"[^>]*>([\s\S]*?)<\/div>/i);
        // Strategy 3: Greedy fallback
        const fallbackMatch = html.match(/<p\s+id="L1">[\s\S]*<\/p>/i);

        if (mobileBodyMatch) {
            console.log("Strategy 1 (Mobile) matched!");
            console.log("Snippet:", mobileBodyMatch[1].substring(0, 100));
        } else {
            console.log("Strategy 1 (Mobile) FAILED");
        }

        if (pcBodyMatch) {
            console.log("Strategy 2 (PC) matched!");
            console.log("Snippet:", pcBodyMatch[1].substring(0, 100));
        } else {
            console.log("Strategy 2 (PC) FAILED");
        }

        if (fallbackMatch) {
            console.log("Strategy 3 (Fallback) matched!");
        } else {
            console.log("Strategy 3 (Fallback) FAILED");
        }

        // Dump a bit of HTML to see what's wrong if all fail
        if (!mobileBodyMatch && !pcBodyMatch && !fallbackMatch) {
            console.log("--- HTML START (first 2000 chars) ---");
            console.log(html.substring(0, 2000));
            console.log("--- HTML END ---");
        }
    });
}).on('error', (e) => {
    console.error(e);
});
