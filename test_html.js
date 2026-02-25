const fs = require('fs');

async function run() {
    const res = await fetch('https://novel18.syosetu.com/n5598ku/', { headers: { 'Cookie': 'over18=yes' } });
    const html = await res.text();

    // find where chapters are listed
    const idx = html.indexOf('愛人編'); // From screenshots, first part is "愛人編", first chapter is "不毛な会話"
    if (idx === -1) {
        console.log("Not found!");
        return;
    }
    console.log(html.substring(idx - 200, idx + 1000));
}
run();
