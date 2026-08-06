import { readFileSync } from 'fs';
import { extractCore } from './src/lib/extract-core.server.js';

async function run() {
  console.log("Starting local extraction test...");
  
  const imgPath = "C:\\Users\\Manav bhardvaj\\invoice.jpg";
  const buffer = readFileSync(imgPath);
  const base64 = buffer.toString('base64');
  const dataUri = `data:image/jpeg;base64,${base64}`;

  const t0 = Date.now();
  try {
    const result = await extractCore([dataUri]);
    console.log(`\n\n--- Extraction completed in ${Date.now() - t0}ms ---`);
    console.log("Provider used:", result.provider_used);
    console.log("Overall confidence:", result.overall_confidence);
  } catch (err) {
    console.error("Extraction failed:", err);
  }
}

run();
