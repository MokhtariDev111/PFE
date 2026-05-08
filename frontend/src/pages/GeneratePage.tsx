import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Upload, Zap, Eye, X, Check, ArrowRight, Settings, GripVertical, Lock, Paperclip } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BookLoader from "@/components/BookLoader";

const BG_PHOTOS = [
  "/dom-fou-YRMWVcdyhmI-unsplash.jpg",
  "/ken-theimer-PoE6Q48B-5k-unsplash.jpg",
  "/spencer-russell-7f55okwq6iE-unsplash.jpg",
  "/ruijia-wang-BS9w1QCkJys-unsplash.jpg",
];

interface Slide {
  index: number;
  title: string;
  bullets: (string | { text: string; source_id?: string })[];
  slideType: string;
}

interface GenerationStatus { step: string; message: string; }

export default function GeneratePage() {
  const { toast } = useToast();

  // Input state
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [theme, setTheme] = useState("Dark Navy");
  const [maxSlides, setMaxSlides] = useState(20);
  const [language, setLanguage] = useState("English");
  const [themes, setThemes] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Generation state
  const [phase, setPhase] = useState<"input" | "video" | "generating" | "preview">("input");
  const [backendDone, setBackendDone] = useState(false);
  const [videoDone, setVideoDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [orderedSlides, setOrderedSlides] = useState<Slide[]>([]);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [isReordering, setIsReordering] = useState(false);
  const [currentStep, setCurrentStep] = useState("default");

  // Background cycling
  const [bgIndex, setBgIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setBgIndex(i => (i + 1) % BG_PHOTOS.length), 5000);
    return () => clearInterval(t);
  }, []);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);

  useEffect(() => { setOrderedSlides(slides); }, [slides]);

  // Transition to preview only when BOTH backend and video are done
  useEffect(() => {
    if (backendDone && videoDone) {
      setPhase("preview");
    }
  }, [backendDone, videoDone]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/themes")
      .then(r => r.json()).then(setThemes)
      .catch(() => setThemes(["Dark Navy", "Modern", "Minimalist"]));
  }, []);

  const isLocked = (s: Slide) =>
    s.slideType === "title" || s.slideType === "intro" || s.slideType === "summary";

  const handleDragStart = (i: number) => { dragIdx.current = i; };
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === i || isLocked(orderedSlides[i])) return;
    const next = [...orderedSlides];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    dragIdx.current = i;
    setOrderedSlides(next);
  };

  const handleConfirmOrder = useCallback(async () => {
    if (!sessionId) return;
    setIsReordering(true);
    const order = orderedSlides.map(s => slides.indexOf(s)).filter(i => i !== -1);
    try {
      const res = await fetch(`http://127.0.0.1:8000/reorder/${sessionId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Reorder failed");
      window.open(`http://127.0.0.1:8000/view/${sessionId}`, "_blank");
    } catch {
      toast({ title: "Error", description: "Could not apply changes", variant: "destructive" });
    } finally { setIsReordering(false); }
  }, [sessionId, orderedSlides, slides, toast]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ title: "Error", description: "Please enter a topic", variant: "destructive" });
      return;
    }
    setPhase("video");
    setBackendDone(false);
    setVideoDone(false);
    setIsLoading(true);
    setSlides([]); setOrderedSlides([]); setProgress(0); setSessionId("");

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("theme", theme);
    formData.append("max_slides", maxSlides.toString());
    formData.append("language", language);
    files.forEach(f => formData.append("files", f));

    try {
      const response = await fetch("http://127.0.0.1:8000/generate-stream", { method: "POST", body: formData });
      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = message.split("\n");
          let eventType = "message", dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr += line.slice(6);
          }
          if (dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (eventType === "status") {
                setGenerationStatus(data);
                setCurrentStep(data.step || "default");
                const sp: Record<string, number> = { ingesting:15, indexing:30, retrieving:50, generating:70, rendering:95 };
                setProgress(sp[data.step] || 0);
              } else if (eventType === "slide") {
                setSlides(prev => [...prev, data]);
              } else if (eventType === "done") {
                setSessionId(data.session_id);
                setProgress(100);
                setBackendDone(true);
                toast({ title: "Success! 🎉", description: `Presentation ready with ${data.num_slides} slides` });
              } else if (eventType === "error") {
                toast({ title: "Generation Error", description: data.detail || "Unknown error", variant: "destructive" });
                setPhase("input");
              }
            } catch {}
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Generation failed", variant: "destructive" });
      setPhase("input");
      setBackendDone(false);
      setVideoDone(false);
    } finally { setIsLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
  };

  // ── VIDEO PHASE ────────────────────────────────────────────────────────────
  if (phase === "video") {
    return (
      <motion.div
        className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <video
          ref={videoRef}
          src="/raganimation.mp4"
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          onEnded={() => {
            if (backendDone) {
              // Both done — go to preview
              setVideoDone(true);
            } else {
              // Backend still running — loop
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play();
              }
            }
          }}
        />

        {/* Skip button — only shown when backend is done */}
        <AnimatePresence>
          {backendDone && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={() => { setVideoDone(true); setPhase("preview"); }}
              className="absolute bottom-10 right-10 flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/20 backdrop-blur border border-white/30 text-white text-sm font-medium hover:bg-white/30 transition-all"
            >
              Skip <ArrowRight className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Progress indicator — bottom left */}
        <div className="absolute bottom-8 left-10 flex flex-col gap-2 w-64">
          {/* Status message */}
          <p className="text-white/50 text-xs">
            {backendDone ? "Ready — finishing animation…" : generationStatus?.message || "Generating…"}
          </p>

          {/* Progress bar + percentage */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-[3px] rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-white/70"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <span className="text-white/70 text-xs font-semibold tabular-nums w-9 text-right">
              {progress}%
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── INPUT PHASE ────────────────────────────────────────────────────────────
  if (phase === "input") {    return (
      <div className="relative h-[calc(100vh-56px)] overflow-hidden">
        {/* Cycling background photos */}
        {BG_PHOTOS.map((src, i) => (
          <motion.div
            key={src}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${src})` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: i === bgIndex ? 1 : 0 }}
            transition={{ duration: 1.2 }}
          />
        ))}
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/55" />

        {/* Centered content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-3 tracking-tight">
              From Book to Presentation
            </h1>
            <p className="text-white/60 text-center mb-8 text-base">
              Upload your course material and enter a topic to generate a presentation
            </p>

            {/* Single-row input bar */}
            <div className="flex items-center gap-0 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-visible shadow-2xl relative">
              {/* Topic input */}
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Machine Learning, Ancient Rome, Climate Change…"
                className="flex-1 bg-transparent text-white placeholder:text-white/40 text-base px-5 py-4 focus:outline-none min-w-0"
                autoFocus
              />

              {/* Divider */}
              <div className="w-px h-8 bg-white/20 shrink-0" />

              {/* PDF upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-4 text-white/60 hover:text-white transition-colors shrink-0 text-sm"
                title="Upload PDF"
              >
                <Paperclip className="w-4 h-4" />
                {files.length > 0 ? (
                  <span className="text-emerald-400 text-xs font-medium">{files.length} file{files.length > 1 ? "s" : ""}</span>
                ) : (
                  <span className="hidden sm:inline text-xs">Add Course Material</span>
                )}
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" className="hidden"
                onChange={e => { if (e.target.files) setFiles(Array.from(e.target.files)); }} />

              {/* Divider */}
              <div className="w-px h-8 bg-white/20 shrink-0" />

              {/* Settings gear */}
              <button
                onClick={() => setSettingsOpen(o => !o)}
                className={`px-4 py-4 transition-colors shrink-0 ${settingsOpen ? "text-primary" : "text-white/60 hover:text-white"}`}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="flex items-center gap-2 px-5 py-4 bg-primary text-white font-semibold text-sm rounded-r-2xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
              >
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">Generate</span>
              </button>

              {/* Settings dropdown */}
              <AnimatePresence>
                {settingsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute top-full right-0 mt-2 w-72 bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-5 space-y-5 z-50"
                  >
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Theme</label>
                      <Select value={theme} onValueChange={setTheme}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{themes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                        Max slides: <span className="text-primary">{maxSlides}</span>
                      </label>
                      <Slider value={[maxSlides]} onValueChange={v => setMaxSlides(v[0])} min={5} max={40} step={1} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Language</label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="English">🇬🇧 English</SelectItem>
                          <SelectItem value="French">🇫🇷 French</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Selected files */}
            {files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="truncate max-w-[160px]">{f.name}</span>
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-400 transition-colors ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-white/30 text-xs text-center mt-4">Press Enter to generate</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── PREVIEW PHASE (full-screen) ────────────────────────────────────────────
  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-background flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div>
          <h1 className="text-xl font-bold gradient-text leading-none">Presentation Ready</h1>
          <p className="text-muted-foreground text-xs mt-1 truncate max-w-sm">{prompt}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Settings chips */}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border">{theme}</span>
            <span className="px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border">{language}</span>
            <span className="px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border">{orderedSlides.length} slides</span>
            {files.length > 0 && <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">{files.length} file{files.length > 1 ? "s" : ""}</span>}
          </div>
          <Button variant="outline" size="sm" onClick={() => { setPhase("input"); setSlides([]); setOrderedSlides([]); }}>
            ← New
          </Button>
        </div>
      </div>

      {/* ── Slide list (scrollable) ── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <p className="text-muted-foreground text-sm mb-4">
          {orderedSlides.length > 0 ? `${orderedSlides.length} slides · drag to reorder` : "No slides"}
        </p>

        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3">
          {orderedSlides.map((slide, i) => {
            const locked = isLocked(slide);
            return (
              <motion.div
                key={`${slide.title}-${i}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                draggable={!locked}
                onDragStart={() => !locked && handleDragStart(i)}
                onDragOver={e => !locked && handleDragOver(e, i)}
                className={`break-inside-avoid mb-3 flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  locked
                    ? "bg-muted/40 border-border/30 opacity-70 cursor-not-allowed"
                    : "bg-card border-border hover:border-primary/40 cursor-grab active:cursor-grabbing hover:shadow-md"
                }`}
              >
                <div className="flex-shrink-0 text-muted-foreground">
                  {locked ? <Lock className="w-4 h-4" /> : <GripVertical className="w-4 h-4" />}
                </div>
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{slide.title || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{slide.slideType}</p>
                </div>
                {locked && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">LOCKED</span>}
                {!locked && (
                  <button onClick={() => setOrderedSlides(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="shrink-0 px-8 py-4 border-t border-border/50 bg-background/80 backdrop-blur-xl">
        <Button
          className="launch-button w-full h-12 text-base"
          size="lg"
          onClick={handleConfirmOrder}
          disabled={isReordering || !sessionId}
        >
          <Eye className="w-5 h-5" />
          {isReordering ? "Rendering..." : "Confirm Order & View"}
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </motion.div>
  );
}
