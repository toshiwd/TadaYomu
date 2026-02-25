const fs = require('fs');

async function testSyosetu() {
    const res = await fetch('https://ncode.syosetu.com/n0001a/');
    const html = await res.text();
    const idx = html.indexOf('p-eplist');
    if (idx !== -1) {
        console.log("Syosetu uses p-eplist now too! Example:");
        console.log(html.substring(idx - 100, idx + 800));
    } else {
        const idxOld = html.indexOf('novel_sublist2');
        console.log("Syosetu uses old novel_sublist2 format. Example:");
        console.log(html.substring(idxOld - 100, idxOld + 800));
    }
}
testSyosetu();
