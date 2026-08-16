// Server-only image compression before LLM calls.
// Prefers Web APIs (createImageBitmap + OffscreenCanvas) when available
// (Cloudflare Workers). Node runtimes — local `vite dev` and the Vercel
// deployment this app actually targets (see vite.config.ts) — don't implement
// those, so we fall back to `sharp` there instead of silently no-op'ing.

import { isPdfDataUri } from "./pdf-pages.server";

export type CompressResult = {
  dataUri: string;
  compressed: boolean;
  beforeBytes: number;
  afterBytes: number;
};

const SKIP_MIMES = new Set(["application/pdf", "image/gif"]);
const SMALL_JPEG_BYTES = 500 * 1024;

function base64ByteLength(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function parseDataUri(dataUri: string): { mime: string; b64: string } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1]!, b64: match[2]! };
}

function compressEnabled(): boolean {
  const v = process.env.IMAGE_COMPRESS_ENABLED;
  return v === undefined || v === "" || v.toLowerCase() === "true" || v === "1";
}

function maxDim(): number {
  const n = parseInt(process.env.IMAGE_MAX_DIM ?? "1600", 10);
  return Number.isFinite(n) && n > 0 ? n : 1600;
}

function jpegQuality(): number {
  const n = parseFloat(process.env.IMAGE_JPEG_QUALITY ?? "0.8");
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.8;
}

export async function compressImageDataUri(
  dataUri: string,
  opts?: { maxDim?: number; quality?: number },
): Promise<CompressResult> {
  const beforeBytes = dataUri.length;

  if (!compressEnabled()) {
    return { dataUri, compressed: false, beforeBytes, afterBytes: beforeBytes };
  }

  if (isPdfDataUri(dataUri)) {
    return { dataUri, compressed: false, beforeBytes, afterBytes: beforeBytes };
  }

  const parsed = parseDataUri(dataUri);
  if (!parsed) {
    return { dataUri, compressed: false, beforeBytes, afterBytes: beforeBytes };
  }

  const { mime, b64 } = parsed;
  if (SKIP_MIMES.has(mime)) {
    return { dataUri, compressed: false, beforeBytes, afterBytes: beforeBytes };
  }

  const limit = opts?.maxDim ?? maxDim();
  const quality = opts?.quality ?? jpegQuality();
  const rawBytes = base64ByteLength(b64);
  const hasWebImageApis =
    typeof createImageBitmap !== "undefined" && typeof OffscreenCanvas !== "undefined";

  try {
    const bytes = decodeBase64(b64);

    if (hasWebImageApis) {
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
      const bitmap = await createImageBitmap(blob);

      const needsResize = bitmap.width > limit || bitmap.height > limit;
      const isSmallJpeg = mime === "image/jpeg" && !needsResize && rawBytes < SMALL_JPEG_BYTES;

      if (isSmallJpeg) {
        bitmap.close();
        return { dataUri, compressed: false, beforeBytes, afterBytes: beforeBytes };
      }

      let width = bitmap.width;
      let height = bitmap.height;
      if (needsResize) {
        const ratio = Math.min(limit / width, limit / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return { dataUri, compressed: false, beforeBytes, afterBytes: beforeBytes };
      }

      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const jpegBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      const outBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      const outB64 = encodeBase64(outBytes);

      return {
        dataUri: `data:image/jpeg;base64,${outB64}`,
        compressed: true,
        beforeBytes: rawBytes,
        afterBytes: outBytes.byteLength,
      };
    }

    // Node runtime (local `vite dev`, Vercel) — no createImageBitmap/OffscreenCanvas.
    const sharp = (await import("sharp")).default;
    const image = sharp(Buffer.from(bytes));
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const needsResize = width > limit || height > limit;
    const isSmallJpeg = mime === "image/jpeg" && !needsResize && rawBytes < SMALL_JPEG_BYTES;

    if (isSmallJpeg) {
      return { dataUri, compressed: false, beforeBytes, afterBytes: beforeBytes };
    }

    const pipeline = needsResize
      ? image.resize({ width: limit, height: limit, fit: "inside", withoutEnlargement: true })
      : image;
    const outBuffer = await pipeline.jpeg({ quality: Math.round(quality * 100) }).toBuffer();

    return {
      dataUri: `data:image/jpeg;base64,${outBuffer.toString("base64")}`,
      compressed: true,
      beforeBytes: rawBytes,
      afterBytes: outBuffer.byteLength,
    };
  } catch (err) {
    console.warn("[compress] failed, using original", {
      error: err instanceof Error ? err.message : String(err),
      mime,
    });
    return { dataUri, compressed: false, beforeBytes, afterBytes: beforeBytes };
  }
}

export type CompressBatchStats = {
  images: string[];
  compressedCount: number;
  skippedCount: number;
  beforeBytes: number;
  afterBytes: number;
};

async function pMap<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  const runners = Array.from({ length: width }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function compressImages(images: string[]): Promise<CompressBatchStats> {
  const limit = Math.max(1, parseInt(process.env.EXTRACT_CONCURRENCY ?? "5", 10) || 5);
  const results = await pMap(images, limit, (img) => compressImageDataUri(img));

  let compressedCount = 0;
  let skippedCount = 0;
  let beforeBytes = 0;
  let afterBytes = 0;
  const out: string[] = [];

  for (const r of results) {
    out.push(r.dataUri);
    beforeBytes += r.beforeBytes;
    afterBytes += r.afterBytes;
    if (r.compressed) compressedCount++;
    else skippedCount++;
  }

  return { images: out, compressedCount, skippedCount, beforeBytes, afterBytes };
}
