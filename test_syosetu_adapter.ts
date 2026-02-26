import { syosetuAdapter } from './src/services/adapters/syosetuAdapter';

async function test() {
    console.log("Testing Re:Zero (n2267be) - new format");
    const reZero = await syosetuAdapter.getChapterList("n2267be");
    console.log(`Re:Zero has ${reZero.length} chapters.`);
    for (let i = 0; i < 5; i++) {
        console.log(`  [${reZero[i].index}] ${reZero[i].title}`);
    }
    console.log("...");
    for (let i = 23; i < 28; i++) {
        console.log(`  [${reZero[i].index}] ${reZero[i].title}`);
    }

    console.log("\nTesting Slime (n6316bn) - new format with prologue");
    const slime = await syosetuAdapter.getChapterList("n6316bn");
    console.log(`Slime has ${slime.length} chapters.`);
    for (let i = 0; i < 5; i++) {
        console.log(`  [${slime[i].index}] ${slime[i].title}`);
    }
}

test().catch(console.error);
