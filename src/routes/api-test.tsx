import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Code2,
  FileJson,
  FileText,
  Key,
  Loader2,
  Play,
  Send,
  Sparkles,
  Terminal,
  Upload,
  X,
  Zap,
  AlertTriangle,
  Clock,
  Shield,
  Eye,
  EyeOff,
  Copy,
  Check,
  Globe,
  Server,
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/api-test")({
  head: () => ({
    meta: [
      { title: "API Playground — DocExtract AI" },
      {
        name: "description",
        content:
          "Test the DocExtract AI extraction API live. Upload an invoice, get structured JSON back in seconds.",
      },
    ],
  }),
  component: ApiPlayground,
});

const ENDPOINT = "https://docwise-ai-eight.vercel.app/api/v1/extract";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function resizeImage(file: File, maxWidth = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    // Return original if it's not an image (e.g. PDF)
    if (!file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxWidth) {
          const ratio = Math.min(maxWidth / width, maxWidth / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(e.target?.result as string);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-[oklch(0.75_0.18_50)]"; // number — warm amber
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "text-[oklch(0.78_0.14_250)]"; // key — soft blue
        } else {
          cls = "text-[oklch(0.75_0.16_150)]"; // string — teal green
        }
      } else if (/true|false/.test(match)) {
        cls = "text-[oklch(0.72_0.18_310)]"; // bool — purple
      } else if (/null/.test(match)) {
        cls = "text-[oklch(0.55_0.08_280)]"; // null — muted
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

/* ─── Copy Button ─────────────────────────────────────────────────────────── */

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

/* ─── Status Badge ────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: number }) {
  const color =
    status >= 200 && status < 300
      ? "bg-success/10 text-success border-success/20"
      : status >= 400 && status < 500
        ? "bg-warning/10 text-warning border-warning/20"
        : "bg-destructive/10 text-destructive border-destructive/20";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${color}`}>
      {status}
    </span>
  );
}

/* ─── cURL Generator ──────────────────────────────────────────────────────── */

function buildCurl(apiKey: string, fileName: string) {
  return `curl -X POST "${ENDPOINT}" \\
  -H "Authorization: Bearer ${apiKey || "<your_api_key>"}" \\
  -H "Content-Type: multipart/form-data" \\
  -F "images=@${fileName || "invoice.pdf"}"`;
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

function ApiPlayground() {
  // State
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string>("");
  const [status, setStatus] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<"response" | "curl" | "docs">("response");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // Read file
  const readFile = useCallback(async (f: File) => {
    setFile(f);
    setDataUrl("");
    setPreview("");
    
    try {
      const result = await resizeImage(f);
      setDataUrl(result);
      if (f.type.startsWith("image/")) setPreview(result);
    } catch (err) {
      console.error("Failed to read/resize image", err);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) readFile(f);
    },
    [readFile]
  );

  // Submit
  const onSubmit = async () => {
    if (!dataUrl || !apiKey) return;
    setLoading(true);
    setResponse("");
    setStatus(0);
    setElapsed(0);
    setActiveTab("response");
    const start = Date.now();

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ images: [dataUrl] }),
      });
      const ms = Date.now() - start;
      setElapsed(ms);
      setStatus(res.status);
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (err) {
      setElapsed(Date.now() - start);
      setStatus(0);
      setResponse(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Auto-scroll response
  useEffect(() => {
    if (response && responseRef.current) {
      responseRef.current.scrollTop = 0;
    }
  }, [response]);

  const confidence =
    response && status === 200
      ? (() => {
          try {
            const j = JSON.parse(response);
            return j.overall_confidence;
          } catch {
            return null;
          }
        })()
      : null;

  const provider =
    response && status === 200
      ? (() => {
          try {
            const j = JSON.parse(response);
            return j.provider_used;
          } catch {
            return null;
          }
        })()
      : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero gradient bg */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div className="absolute inset-0 grid-bg opacity-40" aria-hidden />
        <div className="relative">
          <SiteNav />

          {/* Header */}
          <section className="mx-auto max-w-6xl px-6 pb-8 pt-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Live API · Production endpoint
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="text-4xl font-bold tracking-tight md:text-5xl"
            >
              API <span className="text-gradient">Playground</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mx-auto mt-3 max-w-xl text-balance text-muted-foreground"
            >
              Test the extraction API live. Upload a document, get structured JSON back — right here.
            </motion.p>
          </section>
        </div>
      </div>

      {/* Main playground */}
      <div className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="glass relative overflow-hidden rounded-2xl border border-border shadow-elevated"
        >
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-success/10 px-2 py-0.5 font-mono text-xs font-bold text-success">
                POST
              </span>
              <span className="font-mono text-xs text-muted-foreground hidden sm:inline">
                /api/v1/extract
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface/80 pl-2.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Bearer token"
                  className="w-36 border-0 bg-transparent px-1.5 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground/60 sm:w-52"
                  id="api-key-input"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="px-2 py-1.5 text-muted-foreground transition hover:text-foreground"
                  title={showKey ? "Hide" : "Show"}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <button
                onClick={onSubmit}
                disabled={loading || !dataUrl || !apiKey}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow transition hover:opacity-95 disabled:opacity-40 disabled:shadow-none"
                id="send-request-btn"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {loading ? "Extracting…" : "Send Request"}
              </button>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid md:grid-cols-2">
            {/* Left — upload / input */}
            <div className="border-b border-border md:border-b-0 md:border-r">
              {/* Endpoint info */}
              <div className="border-b border-border bg-surface/40 px-5 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="font-mono break-all">{ENDPOINT}</span>
                </div>
              </div>

              {/* File upload zone */}
              <div className="p-5">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all ${
                    dragOver
                      ? "border-primary bg-primary/5 shadow-glow"
                      : file
                        ? "border-success/40 bg-success/5"
                        : "border-border bg-surface/40 hover:border-primary/40 hover:bg-primary/5"
                  } p-8 text-center`}
                  id="file-dropzone"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) readFile(f);
                    }}
                    className="hidden"
                  />

                  <AnimatePresence mode="wait">
                    {file ? (
                      <motion.div
                        key="file"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="space-y-3"
                      >
                        {preview ? (
                          <img
                            src={preview}
                            alt="Preview"
                            className="mx-auto max-h-40 rounded-lg border border-border shadow-card"
                          />
                        ) : (
                          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-success/10">
                            <FileText className="h-8 w-8 text-success" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatBytes(file.size)} · {dataUrl ? "Ready" : "Reading…"}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFile(null);
                            setDataUrl("");
                            setPreview("");
                          }}
                          className="mx-auto inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                          <X className="h-3 w-3" /> Replace file
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="space-y-3"
                      >
                        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
                          <Upload className="h-7 w-7 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            Drop a document here, or <span className="text-primary">browse</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            JPG, PNG, WebP, GIF, or PDF · up to 4 MB
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Quick reference */}
                <div className="mt-5 space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Quick Reference
                  </h3>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2">
                      <Shield className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <div>
                        <span className="font-medium text-foreground">Auth:</span> Bearer token in
                        Authorization header
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2">
                      <FileJson className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <div>
                        <span className="font-medium text-foreground">Body:</span>{" "}
                        <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">
                          {"{ images: [base64] }"}
                        </code>{" "}
                        or multipart
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2">
                      <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      <div>
                        <span className="font-medium text-foreground">Latency:</span> 2–8s typical,
                        up to 30s for multi-page
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — response */}
            <div className="flex flex-col">
              {/* Tabs */}
              <div className="flex items-center gap-0.5 border-b border-border bg-surface/40 px-3">
                {(
                  [
                    { id: "response", icon: Code2, label: "Response" },
                    { id: "curl", icon: Terminal, label: "cURL" },
                    { id: "docs", icon: FileText, label: "Status Codes" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                      activeTab === tab.id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    id={`tab-${tab.id}`}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}

                {status > 0 && (
                  <div className="ml-auto flex items-center gap-2">
                    <StatusBadge status={status} />
                    <span className="font-mono text-[10px] text-muted-foreground">{elapsed}ms</span>
                  </div>
                )}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  {activeTab === "response" && (
                    <motion.div
                      key="response"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      {loading ? (
                        <div className="flex h-80 flex-col items-center justify-center gap-4">
                          <div className="relative">
                            <div className="h-16 w-16 rounded-full border-2 border-primary/20" />
                            <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-2 border-transparent border-t-primary" />
                            <Zap className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-primary" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium">Extracting data…</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              AI is reading your document
                            </p>
                          </div>
                        </div>
                      ) : response ? (
                        <div className="relative h-full">
                          {/* Meta bar */}
                          {status === 200 && (
                            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface/60 px-4 py-2">
                              {confidence != null && (
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                  <CheckCircle2
                                    className={`h-3.5 w-3.5 ${
                                      confidence >= 0.9
                                        ? "text-success"
                                        : confidence >= 0.7
                                          ? "text-warning"
                                          : "text-destructive"
                                    }`}
                                  />
                                  <span className="font-mono font-semibold">
                                    {(confidence * 100).toFixed(1)}%
                                  </span>
                                  <span className="text-muted-foreground">confidence</span>
                                </span>
                              )}
                              {provider && (
                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Server className="h-3 w-3" />
                                  {provider}
                                </span>
                              )}
                              <div className="ml-auto">
                                <CopyButton text={response} label="Copy JSON" />
                              </div>
                            </div>
                          )}
                          {status > 0 && status !== 200 && (
                            <div className="flex items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                              <span className="text-xs font-medium text-destructive">
                                Request failed with status {status}
                              </span>
                              <div className="ml-auto">
                                <CopyButton text={response} label="Copy" />
                              </div>
                            </div>
                          )}
                          <div
                            ref={responseRef}
                            className="overflow-auto bg-[oklch(0.14_0.015_270)] p-4 font-mono text-[12px] leading-relaxed"
                            style={{ maxHeight: "460px" }}
                          >
                            <pre
                              dangerouslySetInnerHTML={{
                                __html: syntaxHighlight(response),
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-80 flex-col items-center justify-center gap-3 text-center">
                          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-elevated">
                            <Play className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Upload a file and hit <span className="font-medium text-foreground">Send Request</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Response will appear here with syntax highlighting
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === "curl" && (
                    <motion.div
                      key="curl"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-5"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-primary" />
                          cURL Command
                        </h3>
                        <CopyButton text={buildCurl(apiKey, file?.name ?? "")} />
                      </div>
                      <pre className="overflow-auto rounded-xl bg-[oklch(0.14_0.015_270)] p-4 font-mono text-[12px] leading-relaxed text-[oklch(0.85_0.06_150)]">
                        {buildCurl(apiKey, file?.name ?? "")}
                      </pre>

                      <div className="mt-6 space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Code2 className="h-4 w-4 text-primary" />
                          JSON Body (alternative)
                        </h3>
                        <pre className="overflow-auto rounded-xl bg-[oklch(0.14_0.015_270)] p-4 font-mono text-[12px] leading-relaxed text-[oklch(0.85_0.06_150)]">
{`curl -X POST "${ENDPOINT}" \\
  -H "Authorization: Bearer ${apiKey || "<your_api_key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "images": ["data:image/jpeg;base64,/9j/4AAQ..."],
    "hint": "optional context"
  }'`}
                        </pre>
                      </div>

                      <div className="mt-6 space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <FileJson className="h-4 w-4 text-primary" />
                          JavaScript / Fetch
                        </h3>
                        <pre className="overflow-auto rounded-xl bg-[oklch(0.14_0.015_270)] p-4 font-mono text-[12px] leading-relaxed text-[oklch(0.85_0.06_150)]">
{`const res = await fetch("${ENDPOINT}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey || "<your_api_key>"}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    images: [base64DataUri],
  }),
});

const data = await res.json();
console.log(data.data); // extracted fields`}
                        </pre>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "docs" && (
                    <motion.div
                      key="docs"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-5"
                    >
                      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        Status Codes
                      </h3>
                      <div className="space-y-2">
                        {[
                          { code: 200, label: "Success", desc: "Extraction completed. Response contains structured data.", color: "success" },
                          { code: 400, label: "Bad Request", desc: "Invalid body, unsupported file type, or too many files.", color: "warning" },
                          { code: 401, label: "Unauthorized", desc: "Missing or invalid Bearer API key.", color: "destructive" },
                          { code: 403, label: "Forbidden", desc: "Tenant account is disabled.", color: "destructive" },
                          { code: 415, label: "Unsupported Media", desc: "Content-Type must be JSON or multipart/form-data.", color: "warning" },
                          { code: 429, label: "Rate Limited", desc: "Monthly extraction limit exceeded.", color: "warning" },
                          { code: 502, label: "Bad Gateway", desc: "Upstream LLM provider failure after retries.", color: "destructive" },
                        ].map((s) => (
                          <div
                            key={s.code}
                            className="flex items-start gap-3 rounded-lg border border-border bg-surface/60 px-3.5 py-2.5"
                          >
                            <StatusBadge status={s.code} />
                            <div>
                              <span className="text-xs font-semibold">{s.label}</span>
                              <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <h3 className="text-sm font-semibold mt-6 mb-3 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Response Shape
                      </h3>
                      <pre className="overflow-auto rounded-xl bg-[oklch(0.14_0.015_270)] p-4 font-mono text-[11px] leading-relaxed text-[oklch(0.85_0.06_150)]">
{`{
  "ok": true,
  "extraction_id": "uuid",
  "created_at": "ISO-8601",
  "document_type": "gst_invoice",
  "overall_confidence": 0.94,
  "provider_used": "gemini",
  "meets_confidence_threshold": true,
  "billed_pages": 1,
  "data": {
    "documents": [{
      "document_type": "...",
      "invoice_number": "...",
      "seller": { ... },
      "buyer": { ... },
      "line_items": [ ... ],
      "taxes": { ... },
      "grand_total": 99710.00,
      "per_field_confidence": { ... },
      "warnings": []
    }]
  }
}`}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between border-t border-border bg-surface/40 px-5 py-2.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success" />
                All systems operational
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">
                Powered by <span className="font-mono">gemini-3.5-flash-lite</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/upload"
                className="inline-flex items-center gap-1 text-primary transition hover:underline"
              >
                Try the full UI <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Endpoint cards */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              method: "POST",
              path: "/api/v1/extract",
              desc: "Extract structured data from document images or PDFs",
              active: true,
            },
            {
              method: "GET",
              path: "/api/v1/usage/current",
              desc: "Get current billing month usage and costs",
              active: true,
            },
            {
              method: "GET",
              path: "/api/v1/invoices",
              desc: "List billing invoices for the authenticated tenant",
              active: true,
            },
          ].map((ep) => (
            <motion.div
              key={ep.path}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group rounded-xl border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    ep.method === "POST"
                      ? "bg-primary/10 text-primary"
                      : "bg-success/10 text-success"
                  }`}
                >
                  {ep.method}
                </span>
                <span className="font-mono text-xs text-foreground">{ep.path}</span>
              </div>
              <p className="text-xs text-muted-foreground">{ep.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
