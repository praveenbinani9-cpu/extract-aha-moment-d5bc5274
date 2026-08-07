import { readFileSync, existsSync } from 'fs';
import { extractCore } from './src/lib/extract-core.server';

async function run() {
  console.log("Starting local extraction engine validation...");

  const imgPath = "invoice.jpg";
  let dataUri = "";
  if (existsSync(imgPath)) {
    const buffer = readFileSync(imgPath);
    const base64 = buffer.toString('base64');
    dataUri = `data:image/jpeg;base64,${base64}`;
  } else {
    // Minimal 1x1 JPEG data URI for smoke testing the extraction pipeline
    dataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
  }

  const t0 = Date.now();
  try {
    const result = await extractCore([dataUri]);
    console.log(`\n--- Extraction completed in ${Date.now() - t0}ms ---`);
    console.log("Provider used:", result.provider_used);
    console.log("Overall confidence:", result.overall_confidence);
    console.log("Meets confidence threshold:", result.meets_confidence_threshold);
  } catch (err) {
    console.log("Extraction engine call caught expected provider/network error:", err instanceof Error ? err.message : String(err));
  }
}

run();
