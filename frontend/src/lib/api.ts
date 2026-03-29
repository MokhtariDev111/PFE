/**
 * api.ts — API service for EduGenius AI (V3 Unified)
 * ==================================================
 * Communicates with the FastAPI backend for RAG and HTML presentation.
 * PowerPoint support has been removed in favor of interactive HTML.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 
  `${window.location.protocol}//${window.location.hostname}:8000`;

export interface SlideData {
  id: number;
  title: string;
  bullets: { text: string; source_id?: string }[];
  speakerNotes: string;
  diagram?: string | null;
  slideType?: string;
  qualityScore?: number;
  qualityFeedback?: string;
}

export interface GenerateResponse {
  slides: SlideData[];
  session_id: string;
  topic: string;
  num_slides: number;
  html_url: string;
}

export interface HistoryRecord {
  id: string;
  prompt: string;
  topic: string;
  num_slides: number;
  theme: string;
  model: string;
  created_at: string;
  html_url: string;
  slides?: SlideData[];
}

export interface GenerateOptions {
  prompt: string;
  theme?: string;
  numSlides?: number;
  model?: string;
  topK?: number;
  language?: string;
  files?: File[];
  usePdfImages?: boolean;
}

// ---------------------------------------------------------------------------
// SSE Streaming
// ---------------------------------------------------------------------------
export interface StreamSlideEvent {
  id: number;
  title: string;
  bullets: { text: string; source_id?: string }[];
  speakerNotes: string;
  diagram?: string | null;
  slideType?: string;
  image_id?: string | null;
}

export interface StreamDoneEvent {
  session_id: string;
  topic: string;
  num_slides: number;
  html_url: string;
}

export interface StreamStatusEvent {
  step: string;
  message: string;
}

export interface StreamDiagramEvent {
  slide_index: number;
  diagram: string;
}

export async function generatePresentationStream(
  opts: GenerateOptions,
  onStatus: (e: StreamStatusEvent) => void,
  onSlide: (e: StreamSlideEvent) => void,
  onDiagram: (e: StreamDiagramEvent) => void,
  onDone: (e: StreamDoneEvent) => void,
  onError: (msg: string) => void,
): Promise<void> {
  const form = new FormData();
  form.append("prompt", opts.prompt);
  form.append("theme", opts.theme ?? "Dark Navy");
  form.append("num_slides", String(opts.numSlides ?? 5));
  form.append("model", opts.model ?? "mistral");
  form.append("top_k", String(opts.topK ?? 4));
  form.append("language", opts.language ?? "English");
  form.append("use_pdf_images", String(opts.usePdfImages !== false));

  if (opts.files && opts.files.length > 0) {
    for (const file of opts.files) {
      form.append("files", file);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/generate-stream`, { method: "POST", body: form });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown fetch error";
    onError(`Failed to reach backend: ${msg}`);
    return;
  }

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    onError(err.detail ?? "Stream request failed");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        if (line.startsWith("data: "))  data  = line.slice(6).trim();
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "status")  onStatus(parsed);
        if (event === "slide")   onSlide(parsed);
        if (event === "diagram") onDiagram(parsed);
        if (event === "done")    onDone(parsed);
        if (event === "error")   onError(parsed.detail ?? "Unknown error");
      } catch { }
    }
  }
}

// ---------------------------------------------------------------------------
// GET /history
// ---------------------------------------------------------------------------
export async function fetchHistory(): Promise<HistoryRecord[]> {
  const res = await fetch(`${BASE_URL}/history`);
  if (!res.ok) throw new Error("Failed to fetch history");
  const json = await res.json();
  return Array.isArray(json) ? json : (json.history ?? []);
}

// ---------------------------------------------------------------------------
// DELETE /history
// ---------------------------------------------------------------------------
export async function clearAllHistory(): Promise<void> {
  await fetch(`${BASE_URL}/history`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// GET /themes — list of available presentation themes
// ---------------------------------------------------------------------------
export async function fetchThemes(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE_URL}/themes`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json.themes ?? []);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// POST /transcribe — audio transcription (optional, requires Whisper backend)
// ---------------------------------------------------------------------------
export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.webm");
  try {
    const res = await fetch(`${BASE_URL}/transcribe`, { method: "POST", body: form });
    if (!res.ok) return "";
    const json = await res.json();
    return json.text ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
