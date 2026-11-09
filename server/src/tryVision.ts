// Tries the AI vision provider on photos and times each answer against BR-12 (10 s, NFR-02). Run from the repo root:
//   npm run try-vision -w server -- path/to/photo1.jpg path/to/photo2.jpg
// Uses AI_VISION_MODE, GROQ_API_KEY and GROQ_VISION_MODEL from server/.env. Prints the drafts; stores nothing.
import { readFileSync } from 'node:fs';
import { getVision } from './adapters/ai-vision/vision.js';

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log('Give one or more .jpg or .png photo paths.');
    return;
  }
  console.log(`AI_VISION_MODE=${process.env.AI_VISION_MODE ?? ''}`);
  let inTime = 0;
  for (const file of files) {
    const type = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const started = Date.now();
    try {
      const draft = await getVision().classify({ data: readFileSync(file), type });
      const seconds = (Date.now() - started) / 1000;
      if (seconds <= 10) inTime += 1;
      console.log(`\n${file}: ${seconds.toFixed(1)} s`);
      console.log(JSON.stringify(draft, null, 2));
    } catch (error) {
      console.log(
        `\n${file}: failed after ${((Date.now() - started) / 1000).toFixed(1)} s: ${String(error)}`,
      );
    }
  }
  console.log(`\n${String(inTime)} of ${String(files.length)} within 10 seconds (NFR-02 needs 18 of 20).`);
}

void main();
