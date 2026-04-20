import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Sparkles, Loader2, Plus, Minus,
  X, BookOpen, Globe, Zap, FileDown, ChevronDown, Download, RotateCcw,
} from "lucide-react";
import Spline from "@splinetool/react-spline";

// ── PDF preview panel ─────────────────────────────────────────────────────────
interface GeneratedPDFs {
  exam_pdf: string; key_pdf: string;
  exam_filename: string; key_filename: string;
}

function b64ToBlob(b64: string) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: "application/pdf" });
}

function triggerDownload(b64: string, filename: string) {
  const url = URL.createObjectURL(b64ToBlob(b64));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

interface ExamMeta {
  topic: string; difficulty: Difficulty; language: Language; total: number;
}

function PDFPreview({ pdfs, meta, onReset }: { pdfs: GeneratedPDFs; meta: ExamMeta; onReset: () => void }) {
  const [tab, setTab]         = useState<"exam" | "key">("exam");
  const [examUrl, setExamUrl] = useState("");
  const [keyUrl,  setKeyUrl]  = useState("");

  useEffect(() => {
    const eu = URL.createObjectURL(b64ToBlob(pdfs.exam_pdf));
    const ku = URL.createObjectURL(b64ToBlob(pdfs.key_pdf));
    setExamUrl(eu); setKeyUrl(ku);
    return () => { URL.revokeObjectURL(eu); URL.revokeObjectURL(ku); };
  }, [pdfs]);

  const dc = DIFF_CONFIG[meta.difficulty];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
      className="fixed inset-0 z-50 bg-background flex"
    >
      {/* ── Left: PDF viewer ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex gap-2 flex-1">
            {(["exam", "key"] as const).map(t => (
              <motion.button key={t} onClick={() => setTab(t)}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className={`px-5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  tab === t
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/25"
                    : "bg-card border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {t === "exam" ? "📄 Exam Sheet" : "✅ Answer Key"}
              </motion.button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Ready
          </div>
        </div>

        {/* PDF iframe */}
        <div className="flex-1 bg-muted overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.iframe
              key={tab}
              src={tab === "exam" ? examUrl : keyUrl}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full"
              title={tab === "exam" ? "Exam Sheet" : "Answer Key"}
            />
          </AnimatePresence>
        </div>
      </div>

      {/* ── Right: Controls panel ─────────────────────────────────────────── */}
      <div className="w-80 border-l border-border flex flex-col bg-card/50">

        {/* Heading */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" /> EXAM GENERATED
          </div>
          <h2 className="text-lg font-bold tracking-tight leading-snug line-clamp-2">{meta.topic}</h2>
        </div>

        {/* Meta */}
        <div className="px-6 py-4 space-y-3 border-b border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2"><Zap className="w-3.5 h-3.5" /> Questions</span>
            <span className="font-semibold">{meta.total}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> Difficulty</span>
            <span className={`font-semibold ${dc.color}`}>{meta.difficulty}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> Language</span>
            <span className="font-semibold">{meta.language}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2"><FileDown className="w-3.5 h-3.5" /> Format</span>
            <span className="font-semibold">TEK-UP PDF</span>
          </div>
        </div>

        {/* File names */}
        <div className="px-6 py-4 space-y-2 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Output files</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border text-xs">
            <span className="text-blue-400">📄</span>
            <span className="truncate text-foreground font-medium">{pdfs.exam_filename}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border text-xs">
            <span className="text-green-400">✅</span>
            <span className="truncate text-foreground font-medium">{pdfs.key_filename}</span>
          </div>
        </div>

        {/* Download buttons */}
        <div className="px-6 py-5 space-y-3 flex-1">
          <motion.button
            onClick={() => triggerDownload(pdfs.exam_pdf, pdfs.exam_filename)}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="w-full py-3 rounded-xl bg-background border border-border text-sm font-semibold flex items-center justify-center gap-2 hover:border-primary/40 hover:text-primary transition-all"
          >
            <Download className="w-4 h-4" /> Download Exam Sheet
          </motion.button>
          <motion.button
            onClick={() => triggerDownload(pdfs.key_pdf, pdfs.key_filename)}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:opacity-90 transition-all"
          >
            <Download className="w-4 h-4" /> Download Correction
          </motion.button>
        </div>

        {/* Generate new */}
        <div className="px-6 pb-6">
          <motion.button
            onClick={onReset}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
            className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Generate new exam
          </motion.button>
        </div>

      </div>
    </motion.div>
  );
}

const API = "http://127.0.0.1:8000";

const DIFFICULTIES  = ["Easy", "Medium", "Hard"] as const;
const TIME_LIMITS   = ["No Limit", "15 min", "30 min", "45 min", "60 min"] as const;
const LANGUAGES     = ["French", "English"] as const;
const EXAM_TYPES    = ["Devoir", "Examen", "Contrôle", "Devoir surveillé"] as const;
const SEMESTERS     = ["1", "2"] as const;
const DOCUMENTS_OPT = ["Non autorisés", "Autorisés"] as const;

type Difficulty = typeof DIFFICULTIES[number];
type Language   = typeof LANGUAGES[number];

interface QuestionMix { mcq: number; truefalse: number; problem: number; casestudy: number }

const QUESTION_TYPES: { key: keyof QuestionMix; label: string; desc: string; color: string }[] = [
  { key: "mcq",       label: "MCQ",            desc: "Multiple choice, 4 options",            color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  { key: "truefalse", label: "True / False",   desc: "Quick concept check",                   color: "text-green-400 border-green-500/30 bg-green-500/10" },
  { key: "problem",   label: "Problem Solving", desc: "Open-answer question",                  color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  { key: "casestudy", label: "Case Study",     desc: "Scenario + data table + sub-questions", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
];

const GEN_MESSAGES = [
  "Planning question concepts…",
  "Writing exam questions…",
  "Reviewing quality…",
  "Generating PDF…",
];

const DIFF_CONFIG = {
  Easy:   { color: "text-green-400", bg: "bg-green-500/15", border: "border-green-500/40", dot: "bg-green-400" },
  Medium: { color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/40", dot: "bg-amber-400" },
  Hard:   { color: "text-red-400",   bg: "bg-red-500/15",   border: "border-red-500/40",   dot: "bg-red-400"   },
};

// ── Progress Steps ─────────────────────────────────────────────────────────────
function ProgressSteps({ step }: { step: number }) {
  const steps = ["Topic", "Questions", "Ready"];
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const done    = i < step;
        const current = i === step;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold transition-all duration-300 ${
                done    ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/40"
                : current ? "border-primary text-primary scale-110 shadow-sm shadow-primary/20"
                :           "border-border text-muted-foreground"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-[10px] font-medium transition-colors duration-300 ${done || current ? "text-primary" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 mx-2 mb-4 h-[2px] bg-border rounded-full overflow-hidden">
                <motion.div className="h-full bg-primary rounded-full"
                  animate={{ width: done ? "100%" : "0%" }}
                  transition={{ duration: 0.45, ease: "easeInOut" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Exam header section (collapsible) ─────────────────────────────────────────
interface ExamHeader {
  teacher: string; subject: string; class_name: string;
  academic_year: string; semester: string; exam_type: string;
  documents: string; date: string; duration: string; bareme: string;
}

function HeaderSection({ value, onChange }: {
  value: ExamHeader;
  onChange: (v: ExamHeader) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (k: keyof ExamHeader) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });

  const inputCls = "w-full bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all";
  const labelCls = "text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-all text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <FileDown className="w-4 h-4 text-primary" />
          Exam Header Info
          <span className="text-xs font-normal text-muted-foreground">(for the PDF)</span>
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-4 space-y-4 px-1">

              {/* Row 1: Teacher + Subject */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Enseignant</label>
                  <input value={value.teacher} onChange={set("teacher")} placeholder="Nom du professeur" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Matière</label>
                  <input value={value.subject} onChange={set("subject")} placeholder="Auto-filled from topic" className={inputCls} />
                </div>
              </div>

              {/* Row 2: Class + Academic Year + Semester */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Classe</label>
                  <input value={value.class_name} onChange={set("class_name")} placeholder="ex: 2DSEN" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Année Universitaire</label>
                  <input value={value.academic_year} onChange={set("academic_year")} placeholder="2024-2025" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Semestre</label>
                  <select value={value.semester} onChange={set("semester")} className={inputCls}>
                    {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 3: Exam type + Documents */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Type d'épreuve</label>
                  <select value={value.exam_type} onChange={set("exam_type")} className={inputCls}>
                    {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Documents</label>
                  <select value={value.documents} onChange={set("documents")} className={inputCls}>
                    {DOCUMENTS_OPT.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 4: Date + Duration + Barème */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={value.date} onChange={set("date")} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Durée</label>
                  <input value={value.duration} onChange={set("duration")} placeholder="ex: 1h30mn" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Barème</label>
                  <input value={value.bareme} onChange={set("bareme")} placeholder="ex: 7-6-7" className={inputCls} />
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExamPromptConfig() {
  const navigate = useNavigate();

  const [topic,      setTopic]      = useState("");
  const [focusTags,  setFocusTags]  = useState<string[]>([]);
  const [focusInput, setFocusInput] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [mix,        setMix]        = useState<QuestionMix>({ mcq: 3, truefalse: 0, problem: 1, casestudy: 1 });
  const [language,   setLanguage]   = useState<Language>("French");
  const [generating, setGenerating] = useState(false);
  const [genMsgIdx,  setGenMsgIdx]  = useState(0);
  const [pdfs,       setPdfs]       = useState<GeneratedPDFs | null>(null);
  const [examMeta,   setExamMeta]   = useState<ExamMeta | null>(null);

  const [examHeader, setExamHeader] = useState<ExamHeader>({
    teacher: "", subject: "", class_name: "",
    academic_year: "2024-2025", semester: "1",
    exam_type: "Devoir", documents: "Non autorisés",
    date: "", duration: "", bareme: "",
  });

  const topicInputRef   = useRef<HTMLInputElement>(null);
  const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusInputRef    = useRef<HTMLInputElement>(null);

  const [focusSuggestions, setFocusSuggestions] = useState<string[]>([]);
  const [loadingFocusSugg, setLoadingFocusSugg] = useState(false);

  // Cycling loading text
  useEffect(() => {
    if (!generating) { setGenMsgIdx(0); return; }
    const id = setInterval(() => setGenMsgIdx(i => (i + 1) % GEN_MESSAGES.length), 4000);
    return () => clearInterval(id);
  }, [generating]);

  // Focus suggestions
  useEffect(() => {
    if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
    if (topic.trim().length < 3) { setFocusSuggestions([]); return; }
    focusDebounceRef.current = setTimeout(async () => {
      setLoadingFocusSugg(true);
      try {
        const res = await fetch(`${API}/exam/focus-suggestions?topic=${encodeURIComponent(topic)}&q=${encodeURIComponent(focusInput)}`);
        if (res.ok) { const d = await res.json(); setFocusSuggestions(d.suggestions ?? []); }
      } catch { setFocusSuggestions([]); }
      finally { setLoadingFocusSugg(false); }
    }, 600);
  }, [topic, focusInput]);

  // Auto-fill subject from topic
  useEffect(() => {
    if (!examHeader.subject) setExamHeader(h => ({ ...h, subject: topic }));
  }, [topic]);

  const totalQuestions = Object.values(mix).reduce((a, b) => a + b, 0);
  const canGenerate    = topic.trim().length > 0 && totalQuestions > 0;
  const progressStep   = !topic.trim() ? 0 : totalQuestions === 0 ? 1 : 2;

  const addFocusTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean || focusTags.includes(clean)) return;
    setFocusTags(prev => [...prev, clean]);
    setFocusInput("");
  };
  const removeFocusTag = (tag: string) => setFocusTags(prev => prev.filter(t => t !== tag));

  const handleFocusKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && focusInput.trim()) {
      e.preventDefault();
      addFocusTag(focusInput.trim().replace(/,$/, ""));
    } else if (e.key === "Backspace" && !focusInput && focusTags.length > 0) {
      setFocusTags(prev => prev.slice(0, -1));
    }
  };

  const adjustMix = (key: keyof QuestionMix, delta: number) =>
    setMix(prev => ({ ...prev, [key]: Math.max(0, Math.min(10, prev[key] + delta)) }));

  const downloadB64 = (b64: string, filename: string) => {
    const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: "application/pdf" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    const focusStr = focusTags.length > 0 ? focusTags.join(", ") : focusInput.trim();
    const header   = { ...examHeader, subject: examHeader.subject || topic };
    try {
      const res = await fetch(`${API}/exam/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, focus: focusStr, difficulty, mix, language, header }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setExamMeta({ topic, difficulty, language, total: totalQuestions });
      setPdfs(data);
    } catch (e: any) {
      alert(`Failed to generate exam: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const dc = DIFF_CONFIG[difficulty];

  if (pdfs && examMeta) {
    return <PDFPreview pdfs={pdfs} meta={examMeta} onReset={() => { setPdfs(null); setExamMeta(null); }} />;
  }

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── LEFT: Form or Preview ─────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 xl:w-[52%] relative z-10 overflow-y-auto h-screen">

        <div className="px-8 pt-10 pb-24 max-w-xl mx-auto">

          {/* Back */}
          <motion.button
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            whileHover={{ x: -3 }} transition={{ type: "spring", stiffness: 300 }}
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </motion.button>

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" /> EXAM GENERATOR
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Configure your exam</h1>
            <p className="text-muted-foreground text-sm">AI generates a print-ready PDF in TEK-UP official format.</p>
          </motion.div>

          {/* Progress */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <ProgressSteps step={progressStep} />
          </motion.div>

          {/* Live Summary */}
          <AnimatePresence>
            {topic.trim() && (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={{ duration: 0.25 }}
                className="mb-6 overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 rounded-xl bg-card border border-border text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />{topic}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className={`flex items-center gap-1.5 font-medium ${dc.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dc.dot}`} />{difficulty}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Zap className="w-3 h-3" />
                    <AnimatePresence mode="wait">
                      <motion.span key={totalQuestions}
                        initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 5, opacity: 0 }}
                        transition={{ duration: 0.12 }} className="inline-block tabular-nums"
                      >{totalQuestions}</motion.span>
                    </AnimatePresence>
                    &nbsp;question{totalQuestions !== 1 ? "s" : ""}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Globe className="w-3 h-3" />{language}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <FileDown className="w-3 h-3" /> PDF output
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-8">

            {/* ── Topic ─────────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <label className="block text-sm font-semibold mb-2">Topic <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  ref={topicInputRef} type="text" value={topic}
                  onChange={e => { setTopic(e.target.value); setFocusTags([]); setFocusSuggestions([]); }}
                  placeholder="e.g. SQL, Machine Learning, Linear Algebra…"
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all pr-10"
                />
                <AnimatePresence>
                  {topic.trim() && (
                    <motion.div
                      initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center"
                    >
                      <span className="text-primary text-[10px] font-bold">✓</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* ── Focus ─────────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold">Specific Focus <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
                {focusTags.length > 0 && (
                  <button onClick={() => setFocusTags([])} className="text-xs text-muted-foreground hover:text-red-400 transition-colors">Clear all</button>
                )}
              </div>
              <div
                onClick={() => focusInputRef.current?.focus()}
                className="min-h-[48px] w-full bg-card border border-border rounded-xl px-3 py-2 flex flex-wrap gap-2 items-center cursor-text focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-all"
              >
                <AnimatePresence>
                  {focusTags.map(tag => (
                    <motion.span key={tag}
                      initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.75 }}
                      transition={{ type: "spring", stiffness: 350, damping: 20 }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/15 text-primary border border-primary/25"
                    >
                      {tag}
                      <button onClick={() => removeFocusTag(tag)} className="hover:text-red-400 transition-colors ml-0.5"><X className="w-3 h-3" /></button>
                    </motion.span>
                  ))}
                </AnimatePresence>
                <input
                  ref={focusInputRef} type="text" value={focusInput}
                  onChange={e => setFocusInput(e.target.value)}
                  onKeyDown={handleFocusKeyDown}
                  placeholder={focusTags.length === 0 ? "Type or pick from suggestions…" : "Add more…"}
                  disabled={topic.trim().length < 2}
                  className="flex-1 min-w-[140px] bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50 disabled:opacity-40"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> or <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">,</kbd> to add a custom tag
              </p>
              <AnimatePresence>
                {topic.trim().length >= 2 && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3">
                    {loadingFocusSugg ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading subtopics…
                      </div>
                    ) : focusSuggestions.length > 0 ? (
                      <>
                        <p className="text-[11px] text-muted-foreground mb-2 font-medium">
                          Related topics for <span className="text-primary font-semibold">"{topic}"</span> — click to add
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {focusSuggestions.map((s, i) => {
                            const selected = focusTags.includes(s);
                            return (
                              <motion.button key={s}
                                initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.04 }}
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={() => selected ? removeFocusTag(s) : addFocusTag(s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  selected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                                }`}
                              >
                                {selected && <span className="mr-1">✓</span>}{s}
                              </motion.button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── Difficulty ─────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <label className="block text-sm font-semibold mb-3">Difficulty</label>
              <div className="flex gap-3">
                {DIFFICULTIES.map(d => {
                  const cfg = DIFF_CONFIG[d];
                  return (
                    <motion.button key={d} onClick={() => setDifficulty(d)}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        difficulty === d ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm` : "bg-card border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >{d}</motion.button>
                  );
                })}
              </div>
            </motion.div>

            {/* ── Question Mix ────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold">Question Mix</label>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all duration-300 ${
                  totalQuestions > 0 ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border"
                }`}>
                  <AnimatePresence mode="wait">
                    <motion.span key={totalQuestions}
                      initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
                      transition={{ duration: 0.14 }} className="inline-block tabular-nums"
                    >{totalQuestions}</motion.span>
                  </AnimatePresence>
                  {" "}question{totalQuestions !== 1 ? "s" : ""} total
                </span>
              </div>
              <div className="space-y-3">
                {QUESTION_TYPES.map(({ key, label, desc, color }) => (
                  <motion.div key={key} whileHover={{ x: 3 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border ${color}`}
                  >
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs opacity-70">{desc}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <motion.button onClick={() => adjustMix(key, -1)} disabled={mix[key] === 0}
                        whileTap={{ scale: 0.8 }}
                        className="w-7 h-7 rounded-lg border border-current/30 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-all"
                      ><Minus className="w-3 h-3" /></motion.button>
                      <AnimatePresence mode="wait">
                        <motion.span key={mix[key]}
                          initial={{ y: -8, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 8, opacity: 0, scale: 0.7 }}
                          transition={{ duration: 0.14 }} className="w-5 text-center text-sm font-bold inline-block tabular-nums"
                        >{mix[key]}</motion.span>
                      </AnimatePresence>
                      <motion.button onClick={() => adjustMix(key, 1)} disabled={mix[key] === 10}
                        whileTap={{ scale: 0.8 }}
                        className="w-7 h-7 rounded-lg border border-current/30 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-all"
                      ><Plus className="w-3 h-3" /></motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* ── Language ────────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <label className="block text-sm font-semibold mb-3">Language</label>
              <div className="flex gap-3">
                {LANGUAGES.map(l => (
                  <motion.button key={l} onClick={() => setLanguage(l)}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                    className={`px-6 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      language === l ? "bg-primary/15 text-primary border-primary/40 shadow-sm" : "bg-card border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >{l}</motion.button>
                ))}
              </div>
            </motion.div>

            {/* ── Exam Header Info (collapsible) ───────────────────────── */}
            <HeaderSection value={examHeader} onChange={setExamHeader} />

            {/* ── Generate Button ─────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
              <motion.button
                onClick={handleGenerate}
                disabled={!canGenerate || generating}
                whileHover={canGenerate && !generating ? { scale: 1.02 } : {}}
                whileTap={canGenerate && !generating ? { scale: 0.98 } : {}}
                className={`w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                  canGenerate && !generating
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    <AnimatePresence mode="wait">
                      <motion.span key={genMsgIdx}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                      >{GEN_MESSAGES[genMsgIdx]}</motion.span>
                    </AnimatePresence>
                  </span>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Generate Exam</>
                )}
              </motion.button>

              {generating && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-center text-xs text-muted-foreground mt-2"
                >
                  Generating exam + answer key PDF…
                </motion.p>
              )}

              <AnimatePresence>
                {!canGenerate && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="text-center text-xs text-muted-foreground mt-2"
                  >
                    {!topic.trim() ? "Enter a topic to continue" : "Add at least 1 question to continue"}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

          </div>
        </div>
      </div>{/* end left column */}

      {/* ── RIGHT: Spline 3D ──────────────────────────────────────────────── */}
      <div className="hidden lg:block lg:w-1/2 xl:w-[48%] sticky top-0 h-screen overflow-hidden bg-background">
        <Spline scene="https://prod.spline.design/AeeKEcMpGDFQpKYe/scene.splinecode" />
      </div>

    </div>
  );
}
