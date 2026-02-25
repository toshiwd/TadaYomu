async function run() {
    const res = await fetch('https://ncode.syosetu.com/n2267be/');
    const t = await res.text();

    const parts = t.split('<div class="p-eplist__sublist">');
    // First part is everything before the first chapter
    parts.shift();

    for (let i = 0; i < 3; i++) {
        const item = parts[i];
        if (!item) continue;

        // Match link
        const linkMatch = item.match(/href="\/[a-z0-9]+\/(\d+)\/"[^>]*>([\s\S]*?)<\/a>/i);
        // Match date
        const dateMatch = item.match(/<div class="p-eplist__update">\s*([\d/:\s]+)(?:<span\s+title="([^"]+)"[^>]*>)?/i);

        if (linkMatch && dateMatch) {
            console.log("Chap", linkMatch[1], linkMatch[2].trim(), dateMatch[1].trim(), dateMatch[2]);
        }
    }
}
run();
