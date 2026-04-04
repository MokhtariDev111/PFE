import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, Image, X, Mic, MicOff, Send, Loader2,
  CheckCircle2, Circle, ChevronDown, Languages, Layers, Palette, Sparkles, Terminal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GenerationStep } from "@/hooks/useAppState";
import { transcribeAudio, fetchThemes } from "@/lib/api";

interface GeneratePanelProps {
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  isGenerating: boolean;
  generationSteps: GenerationStep[];
  onGenerate: (topic: string, prompt: string, options?: {
    theme?: string; language?: string; numSlides?: number; usePdfImages?: boolean;
  }) => void;
  onGenerationComplete?: boolean;
}


const PROMPT_SUGGESTIONS = [
  "Introduction to Neural Networks and Deep Learning",
  "The History and Evolution of the Internet",
  "Fundamentals of Cloud Computing Architecture",
  "Machine Learning Algorithms: Supervised vs Unsupervised",
  "Cybersecurity Threats and Defense Strategies",
  "Agile and Scrum Methodology in Software Development",
];

const LANGUAGE_OPTIONS = [
  { value: "English", label: "🇬🇧 English" },
  { value: "French", label: "🇫🇷 Français" },
];

/** Live terminal log lines */
const TERMINAL_LINES: Record<string, string[]> = {
  ingesting:  ["[sys] Initializing pipeline...", "[ocr] Scanning uploaded documents..."],
  indexing:   ["[vec] Tokenizing text chunks...", "[vec] Building FAISS index..."],
  retrieving: ["[ret] Running semantic search...", "[ret] Top-k chunks retrieved ✓"],
  generating: ["[llm] Generating slides via Ollama...", "[llm] Streaming slide content..."],
  diagrams:   ["[dia] Creating Mermaid diagrams...", "[exp] Exporting to PPTX... ✓"],
};

const STEP_ORDER = ["ingesting", "indexing", "retrieving", "generating", "diagrams"];

function TerminalLog({ steps }: { steps: GenerationStep[] }) {
  const logRef = useRef<HTMLDivElement>(null);
  const [visibleLines, setVisibleLines] = useState<{ text: string; type: string }[]>([]);

  useEffect(() => {
    const newLines: { text: string; type: string }[] = [];

    for (const step of steps) {
      const lines = TERMINAL_LINES[step.id];
      if (!lines) continue;
      if (step.status === "done") {
        lines.forEach(l => newLines.push({ text: l, type: "done" }));
      } else if (step.status === "active") {
        lines.forEach(l => newLines.push({ text: l, type: "active" }));
      }
    }

    setVisibleLines(newLines);
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 50);
  }, [steps]);

  return (
    <div
      ref={logRef}
      className="font-mono text-xs space-y-1 max-h-36 overflow-y-auto pr-1"
      style={{ scrollBehavior: "smooth" }}
    >
      {visibleLines.map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className={line.type === "done" ? "text-emerald-400/70" : "text-primary"}
        >
          <span className="text-muted-foreground/40 mr-2 select-none">›</span>
          {line.text}
          {line.type === "active" && (
            <span className="inline-block w-1.5 h-3 bg-primary ml-1 animate-pulse align-middle rounded-sm" />
          )}
        </motion.div>
      ))}
    </div>
  );
}

export function GeneratePanel({
  uploadedFiles, setUploadedFiles,
  isGenerating, generationSteps, onGenerate,
}: GeneratePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [language, setLanguage] = useState("English");
  const [numSlides, setNumSlides] = useState(5);
  const [theme, setTheme] = useState("Dark Navy");
  const [usePdfImages, setUsePdfImages] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [logView, setLogView] = useState<"steps" | "terminal">("terminal");
  const [themes, setThemes] = useState<string[]>([
    "Dark Navy", "Crimson Pro", "Forest Green", "Midnight Purple", "Corporate White",
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [eta, setEta] = useState(0);

  useEffect(() => {
  // Check localStorage cache first
  const cached = localStorage.getItem('themes_cache');
  if (cached) {
    try {
      const { themes: cachedThemes, timestamp } = JSON.parse(cached);
      const ONE_HOUR = 60 * 60 * 1000;
      if (Date.now() - timestamp < ONE_HOUR && cachedThemes.length > 0) {
        setThemes(cachedThemes);
        return;
      }
    } catch {}
  }
  
  // Fetch from API and cache
  fetchThemes().then(t => {
    if (t.length > 0) {
      setThemes(t);
      localStorage.setItem('themes_cache', JSON.stringify({
        themes: t,
        timestamp: Date.now()
      }));
    }
  }).catch(() => {});
}, []);


  useEffect(() => {
    if (isGenerating) {
      const totalEstimated = 8 + numSlides;
      setEta(totalEstimated);
      const interval = setInterval(() => setEta(prev => prev > 0 ? prev - 1 : 0), 1000);
      return () => clearInterval(interval);
    }
  }, [isGenerating, numSlides]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setUploadedFiles([...uploadedFiles, ...Array.from(e.target.files)]);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    setUploadedFiles([...uploadedFiles, ...Array.from(e.dataTransfer.files)]);
  };
  const removeFile = (index: number) => setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));

  const toggleRecording = async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        try {
          const text = await transcribeAudio(blob);
          if (text) setPrompt(prev => prev ? `${prev} ${text}` : text);
        } catch { console.warn("Transcription failed."); }
      };
      mr.start(); mediaRecorderRef.current = mr; setIsRecording(true);
    } catch { alert("Microphone access denied."); }
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    onGenerate(prompt.split(" ").slice(0, 5).join(" "), prompt, { theme, language, numSlides, usePdfImages });
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return <Image className="w-4 h-4 text-accent" />;
    return <FileText className="w-4 h-4 text-primary" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-3xl mx-auto space-y-4"
    >
      {/* Options */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Presentation Options</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 font-medium">
              <Palette className="w-3.5 h-3.5" /> Theme
            </label>
            <div className="relative">
              <select value={theme} onChange={e => setTheme(e.target.value)}
                className="w-full appearance-none bg-secondary/50 border border-glass-border text-foreground text-sm rounded-xl px-3 py-2.5 pr-9 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all">
                {themes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 font-medium">
              <Languages className="w-3.5 h-3.5" /> Language
            </label>
            <div className="relative">
              <select value={language} onChange={e => setLanguage(e.target.value)}
                className="w-full appearance-none bg-secondary/50 border border-glass-border text-foreground text-sm rounded-xl px-3 py-2.5 pr-9 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all">
                {LANGUAGE_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 font-medium">
              <Layers className="w-3.5 h-3.5" /> Slides
              <span className="ml-auto tag-primary">{numSlides}</span>
            </label>
            <input type="range" min={1} max={15} step={1} value={numSlides}
              onChange={e => setNumSlides(Number(e.target.value))}
              className="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary mt-3" />
            <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-1.5">
              <span>1</span><span>8</span><span>15</span>
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={usePdfImages} onChange={e => setUsePdfImages(e.target.checked)}
                className="rounded border-glass-border bg-secondary/50 text-primary focus:ring-primary/30" />
              <span className="text-xs text-muted-foreground">Use PDF images in slides</span>
            </label>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-lg bg-accent/15 flex items-center justify-center">
            <Upload className="w-3.5 h-3.5 text-accent" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Document Upload</h3>
          <span className="ml-auto tag-muted">PDF · TXT · Images</span>
        </div>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragging ? "border-primary/60 bg-primary/5" : "border-glass-border hover:border-primary/40 hover:bg-secondary/20"
          }`}
        >
          <motion.div animate={{ scale: isDragging ? 1.05 : 1 }} transition={{ type: "spring", stiffness: 300 }}>
            <Upload className={`w-8 h-8 mx-auto mb-2.5 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground/50"}`} />
            <p className="text-sm text-muted-foreground">Drop files here or <span className="text-primary font-medium">browse</span></p>
            <p className="text-xs text-muted-foreground/50 mt-1">OCR applied to images · Max 50MB</p>
          </motion.div>
        </div>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} className="hidden" />
        <AnimatePresence>
          {uploadedFiles.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="mt-3 space-y-2 overflow-hidden">
              {uploadedFiles.map((file, i) => (
                <motion.div key={i} initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 bg-secondary/40 border border-glass-border rounded-xl px-3.5 py-2.5">
                  {getFileIcon(file)}
                  <span className="text-sm text-foreground flex-1 truncate font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-lg">{(file.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-lg hover:bg-destructive/10">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Prompt */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Presentation Topic</h3>
        <div className="relative">
          <Textarea
            placeholder={language === "French" ? "Décrivez le cours que vous souhaitez générer…" : "Describe the lesson you want to generate…"}
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[120px] bg-secondary/30 border-glass-border text-foreground placeholder:text-muted-foreground/50 resize-none pr-14 text-sm rounded-xl focus:ring-2 focus:ring-primary/30 transition-all leading-relaxed"
          />
          <button onClick={toggleRecording}
            className={`absolute right-3 top-3 p-2.5 rounded-xl transition-all ${isRecording
              ? "bg-destructive/15 text-destructive animate-pulse border border-destructive/30"
              : "bg-secondary/80 text-muted-foreground hover:text-primary hover:bg-primary/10 border border-glass-border"}`}>
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>
        {isRecording && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-destructive mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            Recording… click mic again to stop & transcribe.
          </motion.p>
        )}
        <div className="flex items-center justify-between mt-4">
          <p className={`text-xs transition-colors ${prompt.length > 1800 ? "text-destructive" : "text-muted-foreground/50"}`}>
            {prompt.length} / 2000
          </p>
          <Button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
            className="gradient-primary text-white font-semibold px-7 py-2.5 gap-2 border-0 hover:opacity-90 transition-opacity rounded-xl shadow-lg shadow-primary/20">
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isGenerating ? "Generating…" : "Generate Presentation"}
          </Button>
        </div>
      </div>

      {/* Generation Pipeline — steps + terminal */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            className="glass-card p-5 glow-border overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg gradient-primary flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Generation Pipeline</h3>
              </div>
              <div className="flex items-center gap-2">
                {eta > 0 && <span className="tag-primary font-mono">⏳ ~{eta}s</span>}
                {/* Toggle: steps vs terminal */}
                <div className="flex items-center gap-0.5 bg-secondary/60 rounded-lg p-0.5">
                  <button onClick={() => setLogView("steps")}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${logView === "steps" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    Steps
                  </button>
                  <button onClick={() => setLogView("terminal")}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${logView === "terminal" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    <Terminal className="w-3 h-3" /> Log
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {logView === "steps" ? (
                <motion.div key="steps" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  {generationSteps.map((step, i) => (
                    <motion.div key={step.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className="flex items-center gap-3">
                      <div className="shrink-0">
                        {step.status === "done" ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : step.status === "active" ? (
                          <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground/25" />
                        )}
                      </div>
                      <span className={`text-sm transition-colors ${
                        step.status === "active" ? "text-primary font-medium" :
                        step.status === "done" ? "text-emerald-400" : "text-muted-foreground/40"
                      }`}>{step.label}</span>
                      {step.status === "active" && (
                        <motion.div initial={{ width: 0 }} animate={{ width: "100%" }}
                          transition={{ duration: 2.8, ease: "linear" }}
                          className="ml-auto h-0.5 gradient-primary rounded-full max-w-[80px] opacity-50" />
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div key="terminal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="bg-[hsl(224,45%,4%)] rounded-xl p-4 border border-glass-border">
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                    <span className="text-[10px] text-muted-foreground/40 ml-2 font-mono">pipeline.log</span>
                  </div>
                  <TerminalLog steps={generationSteps} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
