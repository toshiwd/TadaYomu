async function test() {
    const res = await fetch('https://ncode.syosetu.com/n2267be/');
    const t = await res.text();
    const r = /<a[\s\S]*?href=\"\/[a-z0-9]+\/(\d+)\/\"[^>]*class=\"p-eplist__subtitle\"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div\s+class=\"p-eplist__update\">\s*([\d\/:\s]+)(?:<span\s+title=\"([^\"]+)\"[^>]*>)?/gi;
    let m, cnt = 0;
    while ((m = r.exec(t)) != null) {
        if (cnt++ < 3) console.log(m[1], m[2].trim(), m[3].trim(), m[4]);
    }
}
test();
