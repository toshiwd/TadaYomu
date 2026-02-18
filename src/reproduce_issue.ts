
import { syosetuAdapter } from './services/adapters/syosetuAdapter';

async function testFetch() {
    const novelId = 'n6195lp'; // Lowercase ID for "公爵令嬢はメイドの忠告をきかない"
    const chapterUrl = `https://ncode.syosetu.com/${novelId}/1/`;

    console.log(`Testing fetch for ${chapterUrl}`);

    try {
        const content = await syosetuAdapter.getChapterContent(novelId, chapterUrl);
        console.log('--- Result ---');
        console.log('Title:', content.title);
        console.log('Body Text Length:', content.bodyText.length);
        console.log('Body Html Length:', content.bodyHtml.length);
        console.log('Preview Body Text:', content.bodyText.substring(0, 100));

        if (content.bodyText.length === 0) {
            console.error('FAIL: Body text is empty!');
        } else {
            console.log('SUCCESS: Body text found.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

testFetch();
