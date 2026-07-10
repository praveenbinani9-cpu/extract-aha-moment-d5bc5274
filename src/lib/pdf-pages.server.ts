// Server-only helper to count PDF pages using pdfjs-dist's Node-safe legacy build.
// Never throws — returns null on any failure so callers can fall back to 1 page.

export async function countPdfPages(dataUri: string): Promise<number | null> {
  try {
    // Strip data URI prefix if present
    const commaIdx = dataUri.indexOf(",");
    const b64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;

    // Decode base64 → Uint8Array (Buffer works on Node/Worker with nodejs_compat)
    const bytes =
      typeof Buffer !== "undefined"
        ? new Uint8Array(Buffer.from(b64, "base64"))
        : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // Dynamic import so this module never ships to a client bundle.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Disable the worker — we run in a serverless/Node context with no DOM.
    // pdfjs v6 accepts an empty string to run everything on the main thread.
    try {
      (pdfjs as unknown as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions!.workerSrc = "";
    } catch {
      /* ignore */
    }

    const loadingTask = (pdfjs as unknown as {
      getDocument: (opts: { data: Uint8Array; disableWorker?: boolean; isEvalSupported?: boolean; useSystemFonts?: boolean }) => { promise: Promise<{ numPages: number; destroy: () => Promise<void> }> };
    }).getDocument({
      data: bytes,
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: false,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
    return typeof numPages === "number" && numPages > 0 ? numPages : null;
  } catch (err) {
    console.error("countPdfPages failed", err);
    return null;
  }
}

export function isPdfDataUri(dataUri: string): boolean {
  return dataUri.startsWith("data:application/pdf");
}
