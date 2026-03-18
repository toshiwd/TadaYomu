const https = require('https');
https.get('https://ncode.syosetu.com/n2267be/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
        const r = /<div class="p-eplist__update">\s*([\d/:\s]+)(?:<span\s+title="([^"]+)"[^>]*>)?/i;
        const match = data.match(r);
        console.log(match ? match.slice(0, 3) : "no match");
        // print some context if no match
        if (!match) {
            const idx = data.indexOf('p-eplist__update');
            console.log(data.substring(Math.max(0, idx - 50), idx + 200));
        }
    });
});
