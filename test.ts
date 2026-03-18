import { kakuyomuAdapter } from './src/services/adapters/kakuyomuAdapter';

async function test() {
    const info = await kakuyomuAdapter.getNovelInfo('1177354054897486439');
    console.log("Kakuyomu info:");
    console.log(info);
}
test();
