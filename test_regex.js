const fs = require('fs');

async function test() {
    console.log("Fetching...");
    const res = await fetch('https://novel18.syosetu.com/n5598ku/', { headers: { 'Cookie': 'over18=yes' } });
    const html = await res.text();
    console.log("HTML length:", html.length);

    // The regex from nocturneAdapter.ts
    const rowRegex = /<dt\s+class=\"novel_sublist2\">\s*([\d\/:\s]+)(?:<span\s+title=\"([^\"]+)\"[^>]*>)?[\s\S]*?<\/dt>\s*<dd\s+class=\"subtitle\">\s*<a\s+href=\"\/[a-z0-9]+\/(\d+)\/\"[^>]*>([\s\S]*?)<\/a>\s*<\/dd>/gi;

    let match;
    let count = 0;
    while ((match = rowRegex.exec(html)) !== null) {
        count++;
        if (count > 2 && count < 98) continue; // just print first/last few
        console.log(`Chap ${match[3]}: Date=${match[1].trim()}`);
    }
    console.log("Total matched:", count);
}

test();
