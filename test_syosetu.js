

async function test() {
    const res = await fetch('https://ncode.syosetu.com/n6316bn/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Cookie': 'over18=yes'
        }
    });
    const html = await res.text();
    console.log("HTML length:", html.length);

    // Find all chapters and chapter titles
    const regex = /<div class="(p-eplist__chapter-title|p-eplist__sublist)">([\s\S]*?)<\/div>/g;
    let match;
    let count = 0;
    while ((match = regex.exec(html)) !== null && count < 50) {
        let type = match[1];
        let content = match[2];
        if (type === 'p-eplist__chapter-title') {
            console.log("\n[CHAPTER TITLE] " + content.trim());
        } else {
            const linkMatch = content.match(/<a\s+href="[^"]+"[^>]*>([\s\S]*?)<\/a>/);
            if (linkMatch) {
                console.log("[EPISODE] " + linkMatch[1].trim());
            }
        }
        count++;
    }
}

test().catch(console.error);
