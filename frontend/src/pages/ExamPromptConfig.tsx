import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Sparkles, Loader2, X, ChevronDown, Download,
  RotateCcw, RefreshCw, Trash2, GripVertical, Play, FileDown,
  Globe, BookOpen, Zap, ChevronUp, Plus, Code2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type SlotType    = "mcq" | "truefalse" | "problem" | "casestudy" | "code";
type SlotStatus  = "idle" | "loading" | "done" | "error";
type Difficulty  = "Easy" | "Medium" | "Hard";
type Language    = "French" | "English";

interface QuestionSlot {
  id: string;
  type: SlotType;
  focus: string;
  instruction: string;
  code: string;
  codeLanguage: string;
  status: SlotStatus;
  result: any | null;
  focusSuggestions: string[];
  loadingFocusSugg: boolean;
  codeSuggestions: string[];
  loadingSugg: boolean;
}

interface GeneratedPDFs {
  exam_pdf: string; key_pdf: string;
  exam_filename: string; key_filename: string;
}

interface ExamMeta {
  topic: string; difficulty: Difficulty; language: Language; total: number;
}

interface ExamHeader {
  teacher: string; subject: string; class_name: string;
  academic_year: string; semester: string; exam_type: string;
  documents: string; date: string; duration: string; bareme: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const API = "http://127.0.0.1:8000";

const DIFFICULTIES  = ["Easy", "Medium", "Hard"] as const;
const LANGUAGES     = ["French", "English"] as const;
const EXAM_TYPES    = ["Devoir", "Examen", "Contrôle", "Devoir surveillé"] as const;
const SEMESTERS     = ["1", "2"] as const;
const DOCUMENTS_OPT = ["Non autorisés", "Autorisés"] as const;
const CODE_LANGS    = ["Python", "JavaScript", "Java", "C", "C++", "SQL", "R",
                       "TypeScript", "Go", "PHP", "Swift", "Kotlin"] as const;

const DIFF_CONFIG = {
  Easy:   { color: "text-green-400", bg: "bg-green-500/15", border: "border-green-500/40", dot: "bg-green-400" },
  Medium: { color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/40", dot: "bg-amber-400" },
  Hard:   { color: "text-red-400",   bg: "bg-red-500/15",   border: "border-red-500/40",   dot: "bg-red-400"   },
};

const SLOT_META: Record<SlotType, { label: string; color: string; bg: string; border: string }> = {
  mcq:       { label: "MCQ",           color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30"   },
  truefalse: { label: "True / False",  color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30"  },
  problem:   { label: "Problem",       color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  casestudy: { label: "Case Study",    color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  code:      { label: "Code Analysis", color: "text-slate-300",  bg: "bg-slate-500/10",  border: "border-slate-400/30"  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function b64ToBlob(b64: string) {
  return new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: "application/pdf" });
}
function triggerDownload(b64: string, filename: string) {
  const url = URL.createObjectURL(b64ToBlob(b64));
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function makeId() { return Math.random().toString(36).slice(2, 10); }

function questionPreview(result: any): string {
  if (!result) return "";
  if (result.question)  return result.question;
  if (result.context)   return result.context;
  if (result.code)      return `Code: ${result.code.slice(0, 80)}…`;
  return "";
}

// ── PDF Preview (full-screen, unchanged) ──────────────────────────────────────
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
      className="fixed inset-0 z-50 bg-background flex">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex gap-2 flex-1">
            {(["exam", "key"] as const).map(t => (
              <motion.button key={t} onClick={() => setTab(t)}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className={`px-5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  tab === t ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/25"
                            : "bg-card border-border text-muted-foreground hover:border-primary/30"}`}>
                {t === "exam" ? "📄 Exam Sheet" : "✅ Answer Key"}
              </motion.button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Ready
          </div>
        </div>
        <div className="flex-1 bg-muted overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.iframe key={tab} src={tab === "exam" ? examUrl : keyUrl}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }} className="w-full h-full"
              title={tab === "exam" ? "Exam Sheet" : "Answer Key"} />
          </AnimatePresence>
        </div>
      </div>

      <div className="w-80 border-l border-border flex flex-col bg-card/50">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" /> EXAM GENERATED
          </div>
          <h2 className="text-lg font-bold tracking-tight leading-snug line-clamp-2">{meta.topic}</h2>
        </div>
        <div className="px-6 py-4 space-y-3 border-b border-border">
          {[
            { icon: <Zap className="w-3.5 h-3.5"/>, label: "Questions", val: meta.total },
            { icon: <BookOpen className="w-3.5 h-3.5"/>, label: "Difficulty", val: meta.difficulty, cls: dc.color },
            { icon: <Globe className="w-3.5 h-3.5"/>, label: "Language", val: meta.language },
            { icon: <FileDown className="w-3.5 h-3.5"/>, label: "Format", val: "TEK-UP PDF" },
          ].map(({ icon, label, val, cls }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">{icon} {label}</span>
              <span className={`font-semibold ${cls ?? ""}`}>{val}</span>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 space-y-2 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Output files</p>
          {[{ icon: "📄", name: pdfs.exam_filename }, { icon: "✅", name: pdfs.key_filename }].map(f => (
            <div key={f.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border text-xs">
              <span>{f.icon}</span><span className="truncate font-medium">{f.name}</span>
            </div>
          ))}
        </div>
        <div className="px-6 py-5 space-y-3 flex-1">
          <motion.button onClick={() => triggerDownload(pdfs.exam_pdf, pdfs.exam_filename)}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="w-full py-3 rounded-xl bg-background border border-border text-sm font-semibold flex items-center justify-center gap-2 hover:border-primary/40 hover:text-primary transition-all">
            <Download className="w-4 h-4" /> Download Exam Sheet
          </motion.button>
          <motion.button onClick={() => triggerDownload(pdfs.key_pdf, pdfs.key_filename)}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:opacity-90 transition-all">
            <Download className="w-4 h-4" /> Download Correction
          </motion.button>
        </div>
        <div className="px-6 pb-6">
          <motion.button onClick={onReset} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
            className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all flex items-center justify-center gap-2">
            <RotateCcw className="w-3.5 h-3.5" /> Build new exam
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Header section (collapsible) ──────────────────────────────────────────────
function HeaderSection({ value, onChange }: { value: ExamHeader; onChange: (v: ExamHeader) => void }) {
  const [open, setOpen] = useState(false);
  const set = (k: keyof ExamHeader) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const inp = "w-full bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all";
  const lbl = "text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block";

  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-all text-sm font-semibold">
        <span className="flex items-center gap-2">
          <FileDown className="w-4 h-4 text-primary" /> Exam Header
          <span className="text-xs font-normal text-muted-foreground">(PDF info)</span>
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="pt-4 space-y-4 px-1">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Enseignant</label>
                  <input value={value.teacher} onChange={set("teacher")} placeholder="Nom du professeur" className={inp} /></div>
                <div><label className={lbl}>Matière</label>
                  <input value={value.subject} onChange={set("subject")} placeholder="Auto-filled" className={inp} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={lbl}>Classe</label>
                  <input value={value.class_name} onChange={set("class_name")} placeholder="2DSEN" className={inp} /></div>
                <div><label className={lbl}>Année Univ.</label>
                  <input value={value.academic_year} onChange={set("academic_year")} placeholder="2024-2025" className={inp} /></div>
                <div><label className={lbl}>Semestre</label>
                  <select value={value.semester} onChange={set("semester")} className={inp}>
                    {SEMESTERS.map(s => <option key={s}>{s}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Type d'épreuve</label>
                  <select value={value.exam_type} onChange={set("exam_type")} className={inp}>
                    {EXAM_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label className={lbl}>Documents</label>
                  <select value={value.documents} onChange={set("documents")} className={inp}>
                    {DOCUMENTS_OPT.map(d => <option key={d}>{d}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={lbl}>Date</label>
                  <input type="date" value={value.date} onChange={set("date")} className={inp} /></div>
                <div><label className={lbl}>Durée</label>
                  <input value={value.duration} onChange={set("duration")} placeholder="1h30mn" className={inp} /></div>
                <div><label className={lbl}>Barème</label>
                  <input value={value.bareme} onChange={set("bareme")} placeholder="7-6-7" className={inp} /></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── SlotCard (left panel) ─────────────────────────────────────────────────────
function SlotCard({
  slot, topic, onUpdate, onGenerate, onRemove,
}: {
  slot: QuestionSlot;
  topic: string;
  onUpdate: (patch: Partial<QuestionSlot>) => void;
  onGenerate: () => void;
  onRemove: () => void;
}) {
  const m   = SLOT_META[slot.type];
  const inp = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/15 transition-all";

  // Auto-fetch focus suggestions for non-code types
  useEffect(() => {
    if (slot.type === "code" || !topic.trim() || slot.focusSuggestions.length > 0 || slot.loadingFocusSugg) return;
    onUpdate({ loadingFocusSugg: true });
    fetch(`${API}/exam/slot-suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, type: slot.type }),
    })
      .then(r => r.json())
      .then(d => onUpdate({ focusSuggestions: d.suggestions ?? [], loadingFocusSugg: false }))
      .catch(() => onUpdate({ loadingFocusSugg: false }));
  }, [topic, slot.type]);

  const fetchCodeSuggestions = useCallback(async () => {
    if (!slot.code.trim() || slot.loadingSugg) return;
    onUpdate({ loadingSugg: true });
    try {
      const res = await fetch(`${API}/exam/code-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: slot.code, code_language: slot.codeLanguage, topic }),
      });
      const d = await res.json();
      onUpdate({ codeSuggestions: d.suggestions ?? [], loadingSugg: false });
    } catch { onUpdate({ loadingSugg: false }); }
  }, [slot.code, slot.codeLanguage, topic]);

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className={`rounded-xl border ${m.border} ${m.bg} p-4 space-y-3`}>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${m.border} ${m.color} ${m.bg}`}>
          {m.label}
        </span>
        <button onClick={onRemove}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Code-specific inputs */}
      {slot.type === "code" ? (
        <>
          <div className="flex gap-2">
            <select value={slot.codeLanguage} onChange={e => onUpdate({ codeLanguage: e.target.value })}
              className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary/60 transition-all">
              {CODE_LANGS.map(l => <option key={l}>{l}</option>)}
            </select>
            <button onClick={fetchCodeSuggestions} disabled={!slot.code.trim() || slot.loadingSugg}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-40 transition-all">
              {slot.loadingSugg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              AI suggestions
            </button>
          </div>
          <textarea value={slot.code}
            onChange={e => onUpdate({ code: e.target.value, codeSuggestions: [] })}
            placeholder="Paste your code here…" rows={6}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/15 transition-all resize-y" />
          {slot.codeSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground font-medium">Click a suggestion:</p>
              {slot.codeSuggestions.map((s, i) => (
                <button key={i} onClick={() => onUpdate({ instruction: s })}
                  className={`w-full text-left px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    slot.instruction === s ? "bg-primary/20 border-primary/40 text-primary" : "bg-primary/5 border-primary/15 text-primary/80 hover:bg-primary/15"
                  }`}>
                  💡 {s}
                </button>
              ))}
            </div>
          )}
          <input value={slot.instruction} onChange={e => onUpdate({ instruction: e.target.value })}
            placeholder="Or type your own question instruction…" className={inp} />
        </>
      ) : (
        <>
          {/* AI focus suggestions */}
          <div>
            <p className="text-[11px] text-muted-foreground font-medium mb-2">
              {slot.loadingFocusSugg
                ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading suggestions…</span>
                : "AI suggestions — click one or type your own:"}
            </p>
            {!slot.loadingFocusSugg && slot.focusSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {slot.focusSuggestions.map((s, i) => (
                  <button key={i} onClick={() => onUpdate({ focus: s })}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                      slot.focus === s
                        ? `${m.bg} ${m.border} ${m.color}`
                        : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <input value={slot.focus} onChange={e => onUpdate({ focus: e.target.value })}
              placeholder="Or type a custom focus…"
              className={inp} />
          </div>
          <input value={slot.instruction} onChange={e => onUpdate({ instruction: e.target.value })}
            placeholder="Extra instruction for the AI… (optional)"
            className={`${inp} text-xs`} />
        </>
      )}

      {/* Generate button */}
      <motion.button onClick={onGenerate}
        disabled={slot.status === "loading" || (slot.type === "code" && !slot.code.trim())}
        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
        className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
          slot.status === "loading" ? "bg-muted text-muted-foreground cursor-not-allowed"
          : slot.status === "done"  ? "bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25"
          : slot.status === "error" ? "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
          : `${m.bg} border ${m.border} ${m.color} hover:opacity-80`
        }`}>
        {slot.status === "loading" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
         : slot.status === "done"  ? <><RefreshCw className="w-3.5 h-3.5" /> Regenerate</>
         : slot.status === "error" ? <><RefreshCw className="w-3.5 h-3.5" /> Retry</>
         : <><Play className="w-3.5 h-3.5" /> Generate</>}
      </motion.button>
    </motion.div>
  );
}

// ── GeneratedCard (right panel, draggable) ────────────────────────────────────
function GeneratedCard({
  slot, index, isDragOver, onRegenerate, onRemove, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  slot: QuestionSlot; index: number; isDragOver: boolean;
  onRegenerate: () => void; onRemove: () => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void; onDragEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const m       = SLOT_META[slot.type];
  const preview = questionPreview(slot.result);

  return (
    <motion.div layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}
      draggable
      onDragStart={onDragStart} onDragOver={onDragOver}
      onDrop={onDrop} onDragEnd={onDragEnd}
      className={`rounded-xl border bg-card transition-all ${
        isDragOver ? "border-primary/60 shadow-lg shadow-primary/10 scale-[1.01]" : "border-border"
      } ${slot.status === "loading" ? "opacity-60" : ""}`}>

      <div className="flex items-start gap-3 p-4">
        {/* Drag handle */}
        <div className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${m.border} ${m.color} ${m.bg}`}>
              {m.label}
            </span>
            <span className="text-xs text-muted-foreground">Exercice {index + 1}</span>
            {slot.status === "loading" && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>

          <p className={`text-sm text-foreground/80 leading-snug ${expanded ? "" : "line-clamp-2"}`}>
            {preview || <span className="italic text-muted-foreground">Generating…</span>}
          </p>

          {preview && preview.length > 100 && (
            <button onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors">
              {expanded ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show more</>}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onRegenerate} disabled={slot.status === "loading"}
            title="Regenerate this question"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-30 transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} title="Remove"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
// ── Live Document Preview (PDF-style) ────────────────────────────────────────

function LiveDocumentPreview({
  doneSlots, header, topic, difficulty, language, readyCount,
  dragOverId, onRegenerate, onRemove, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  doneSlots: QuestionSlot[];
  header: ExamHeader;
  topic: string;
  difficulty: Difficulty;
  language: Language;
  readyCount: number;
  dragOverId: string | null;
  onRegenerate: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
}) {
  if (doneSlots.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
          <Code2 className="w-7 h-7 text-primary/60" />
        </div>
        <h3 className="font-semibold mb-1">No questions yet</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Add question slots on the left, fill in what each should cover, then hit Generate.
        </p>
      </motion.div>
    );
  }

  // Group consecutive MCQ/TF for exercice numbering (mirrors pdf_generator logic)
  let exNum = 1;
  const exercices: { exNum: number; slots: QuestionSlot[] }[] = [];
  let i = 0;
  while (i < doneSlots.length) {
    const s = doneSlots[i];
    if (s.type === "mcq" || s.type === "truefalse") {
      const group = [s];
      let j = i + 1;
      while (j < doneSlots.length && doneSlots[j].type === s.type) {
        group.push(doneSlots[j]); j++;
      }
      exercices.push({ exNum, slots: group });
      i = j;
    } else {
      exercices.push({ exNum, slots: [s] });
      i++;
    }
    exNum++;
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      {/* A4-like document */}
      <div className="max-w-[680px] mx-auto bg-white text-black rounded-lg shadow-2xl overflow-hidden"
           style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: "11px", lineHeight: "1.5" }}>

        {/* Header */}
        <div className="px-8 pt-6 pb-4">
          {/* Logo + school name */}
          <div className="flex items-start gap-4 mb-3">
            <img src="/TEK-UP.png" alt="TEK-UP" className="h-12 w-auto object-contain flex-shrink-0"
                 onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div className="flex-1 border border-black p-2 text-center">
              <p className="font-bold text-[13px] leading-tight">
                Ecole Supérieure Privée Technologies &amp; Ingénierie
              </p>
            </div>
          </div>

          {/* Info grid */}
          <table className="w-full border-collapse text-[10px]" style={{ borderSpacing: 0 }}>
            <tbody>
              <tr>
                <td className="py-0.5 pr-2 font-bold w-36">Type d'épreuve</td>
                <td className="py-0.5">: {header.exam_type || "Devoir"} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>■</strong></td>
              </tr>
              <tr>
                <td className="py-0.5 pr-2 font-bold">Enseignant</td>
                <td className="py-0.5">: {header.teacher || "—"}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-2 font-bold">Matière</td>
                <td className="py-0.5">: {header.subject || topic || "—"}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-2 font-bold">Année Universitaire</td>
                <td className="py-0.5">: {header.academic_year || "2024-2025"} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Semestre</strong> : {header.semester || "1"}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-2 font-bold">Classe</td>
                <td className="py-0.5">: {header.class_name || "—"}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-2 font-bold">Documents</td>
                <td className="py-0.5">: {header.documents || "Non autorisés"}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-2 font-bold">Date</td>
                <td className="py-0.5">: {header.date || "—"} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>Durée</strong> : {header.duration || "—"}</td>
              </tr>
              {header.bareme && (
                <tr>
                  <td className="py-0.5 pr-2 font-bold">Barème</td>
                  <td className="py-0.5">: {header.bareme}</td>
                </tr>
              )}
            </tbody>
          </table>
          <hr className="border-black border-[1.5px] mt-3 mb-4" />
        </div>

        {/* Questions */}
        <div className="px-8 pb-8 space-y-5">
          {exercices.map(({ exNum: en, slots: group }) => (
            <ExerciceBlock
              key={group[0].id}
              exNum={en}
              slots={group}
              dragOverId={dragOverId}
              onRegenerate={onRegenerate}
              onRemove={onRemove}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}

          {/* Placeholder for pending slots */}
          {doneSlots.some(s => s.status === "loading") && (
            <div className="flex items-center gap-2 text-gray-400 text-[10px] py-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Generating question…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExerciceBlock({
  exNum, slots, dragOverId,
  onRegenerate, onRemove, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  exNum: number;
  slots: QuestionSlot[];
  dragOverId: string | null;
  onRegenerate: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
}) {
  const type = slots[0].type;
  const typeLabel: Record<SlotType, string> = {
    mcq: "Questions à Choix Multiple (QCM)",
    truefalse: "Vrai ou Faux",
    problem: "Problème",
    casestudy: "Étude de Cas",
    code: "Analyse de Code",
  };

  return (
    <div>
      <p className="font-bold text-[12px] mb-2 border-b border-gray-200 pb-1">
        Exercice {exNum} — {typeLabel[type]}
      </p>

      {slots.map((slot, qi) => (
        <div
          key={slot.id}
          draggable
          onDragStart={() => onDragStart(slot.id)}
          onDragOver={e => onDragOver(e, slot.id)}
          onDrop={() => onDrop(slot.id)}
          onDragEnd={onDragEnd}
          className={`relative group mb-3 rounded transition-all ${
            dragOverId === slot.id ? "ring-2 ring-blue-400 ring-offset-1" : ""
          } ${slot.status === "loading" ? "opacity-50" : ""}`}
        >
          {/* Hover actions */}
          <div className="absolute -right-1 -top-1 hidden group-hover:flex items-center gap-1 z-10">
            <button onClick={() => onRegenerate(slot.id)}
              className="w-6 h-6 rounded bg-white border border-gray-300 shadow flex items-center justify-center text-gray-500 hover:text-blue-500 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
            <button onClick={() => onRemove(slot.id)}
              className="w-6 h-6 rounded bg-white border border-gray-300 shadow flex items-center justify-center text-gray-500 hover:text-red-500 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
            <div className="w-6 h-6 rounded bg-white border border-gray-300 shadow flex items-center justify-center text-gray-400 cursor-grab">
              <GripVertical className="w-3 h-3" />
            </div>
          </div>

          {slot.status === "loading" && (
            <div className="flex items-center gap-2 text-gray-400 text-[10px] py-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Generating…
            </div>
          )}

          {slot.status === "done" && slot.result && (
            <QuestionPreviewBlock q={slot.result} qIndex={qi} type={type} />
          )}

          {slot.status === "idle" && (
            <div className="text-gray-300 text-[10px] italic py-1">
              {qi + 1}. [Question not generated yet — click Generate]
            </div>
          )}

          {slot.status === "error" && (
            <div className="text-red-400 text-[10px] italic py-1">
              {qi + 1}. [Generation failed — click Retry]
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function QuestionPreviewBlock({ q, qIndex, type }: { q: any; qIndex: number; type: SlotType }) {
  if (type === "mcq") {
    return (
      <div className="mb-2">
        <p className="text-[11px] mb-1"><strong>{qIndex + 1}.</strong> {q.question}</p>
        <div className="pl-4 space-y-0.5">
          {(q.options || []).map((opt: string, oi: number) => (
            <p key={oi} className="text-[10px] text-gray-700">{opt}</p>
          ))}
        </div>
      </div>
    );
  }
  if (type === "truefalse") {
    return (
      <div className="mb-2">
        <p className="text-[11px]"><strong>{qIndex + 1}.</strong> {q.question}</p>
        <p className="text-[10px] text-gray-500 pl-4">□ Vrai &nbsp;&nbsp;&nbsp; □ Faux</p>
      </div>
    );
  }
  if (type === "problem") {
    return (
      <div className="mb-2">
        <p className="text-[11px] leading-relaxed">{q.question}</p>
        <div className="mt-2 space-y-1">
          {[1,2,3,4,5].map(n => (
            <div key={n} className="border-b border-gray-200 h-5" />
          ))}
        </div>
      </div>
    );
  }
  if (type === "casestudy") {
    return (
      <div className="mb-2 space-y-2">
        <p className="text-[11px] leading-relaxed">{q.context}</p>
        {q.table?.headers && (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-gray-100">
                {q.table.headers.map((h: string, i: number) => (
                  <th key={i} className="border border-gray-300 px-2 py-1 text-left font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.table.rows || []).map((row: string[], ri: number) => (
                <tr key={ri}>
                  {row.map((cell: string, ci: number) => (
                    <td key={ci} className="border border-gray-300 px-2 py-1">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(q.subquestions || []).map((sq: any, si: number) => (
          <div key={si}>
            <p className="text-[11px] font-semibold">{sq.id}) {sq.question} {sq.points ? `(${sq.points} pts)` : ""}</p>
            <div className="space-y-1 mt-1">
              {[1,2,3].map(n => <div key={n} className="border-b border-gray-200 h-4" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (type === "code") {
    return (
      <div className="mb-2 space-y-2">
        {q.context && <p className="text-[11px]">{q.context}</p>}
        {q.code && (
          <pre className="bg-gray-50 border border-gray-200 rounded p-2 text-[9px] font-mono overflow-x-auto whitespace-pre-wrap">
            {q.code}
          </pre>
        )}
        {(q.subquestions || []).map((sq: any, si: number) => (
          <div key={si}>
            <p className="text-[11px] font-semibold">{sq.id}) {sq.question} {sq.points ? `(${sq.points} pts)` : ""}</p>
            <div className="space-y-1 mt-1">
              {[1,2,3].map(n => <div key={n} className="border-b border-gray-200 h-4" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default function ExamPromptConfig() {
  const navigate = useNavigate();

  // Config state
  const [topic,      setTopic]      = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [language,   setLanguage]   = useState<Language>("French");
  const [examHeader, setExamHeader] = useState<ExamHeader>({
    teacher: "", subject: "", class_name: "",
    academic_year: "2024-2025", semester: "1",
    exam_type: "Devoir", documents: "Non autorisés",
    date: "", duration: "", bareme: "",
  });

  // Slot state
  const [slots,     setSlots]     = useState<QuestionSlot[]>([]);  // left panel
  const [doneSlots, setDoneSlots] = useState<QuestionSlot[]>([]);  // right panel (ordered)

  // PDF state
  const [pdfs,           setPdfs]           = useState<GeneratedPDFs | null>(null);
  const [examMeta,       setExamMeta]       = useState<ExamMeta | null>(null);
  const [generatingPdf,  setGeneratingPdf]  = useState(false);

  // Drag state
  const [dragId,     setDragId]     = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Auto-fill subject
  useEffect(() => {
    if (!examHeader.subject) setExamHeader(h => ({ ...h, subject: topic }));
  }, [topic]);

  // ── Slot helpers ─────────────────────────────────────────────────────────────
  const addSlot = (type: SlotType) => {
    setSlots(prev => [...prev, {
      id: makeId(), type, focus: "", instruction: "",
      code: "", codeLanguage: "Python",
      status: "idle", result: null,
      focusSuggestions: [], loadingFocusSugg: false,
      codeSuggestions: [], loadingSugg: false,
    }]);
  };

  const updateSlot = (id: string, patch: Partial<QuestionSlot>) =>
    setSlots(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  const removeSlot = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id));
    setDoneSlots(prev => prev.filter(s => s.id !== id));
  };

  const generateSlot = useCallback(async (id: string) => {
    // Fall back to doneSlots so regenerate works even if left-panel slot was removed
    const slot = slots.find(s => s.id === id) ?? doneSlots.find(s => s.id === id);
    if (!slot || !topic.trim()) return;

    updateSlot(id, { status: "loading" });
    setDoneSlots(prev => prev.map(s => s.id === id ? { ...s, status: "loading" } : s));

    try {
      const res = await fetch(`${API}/exam/generate-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: slot.type, topic, focus: slot.focus, difficulty, language,
          code: slot.code, code_language: slot.codeLanguage, instruction: slot.instruction,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();

      updateSlot(id, { status: "done", result });
      setDoneSlots(prev => {
        const idx = prev.findIndex(s => s.id === id);
        if (idx >= 0) {
          const arr = [...prev];
          arr[idx] = { ...arr[idx], status: "done", result };
          return arr;
        }
        return [...prev, { ...slot, status: "done", result }];
      });
    } catch {
      updateSlot(id, { status: "error" });
      setDoneSlots(prev => prev.map(s => s.id === id ? { ...s, status: "error" } : s));
    }
  }, [slots, doneSlots, topic, difficulty, language]);

  // ── Drag-and-drop (right panel) ───────────────────────────────────────────────
  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver  = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); };
  const handleDrop      = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setDoneSlots(prev => {
      const arr      = [...prev];
      const fromIdx  = arr.findIndex(s => s.id === dragId);
      const toIdx    = arr.findIndex(s => s.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [item]   = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
    setDragId(null); setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  // ── Generate PDF ──────────────────────────────────────────────────────────────
  const handleGeneratePdf = async () => {
    const readySlots = doneSlots.filter(s => s.status === "done" && s.result);
    if (!readySlots.length || !topic.trim()) return;
    setGeneratingPdf(true);
    try {
      const res = await fetch(`${API}/exam/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ordered_questions: readySlots.map(s => s.result),
          topic, difficulty, language,
          header: { ...examHeader, subject: examHeader.subject || topic },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setExamMeta({ topic, difficulty, language, total: readySlots.length });
      setPdfs(data);
    } catch (e: any) {
      alert(`Failed to generate PDF: ${e.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const dc          = DIFF_CONFIG[difficulty];
  const readyCount  = doneSlots.filter(s => s.status === "done").length;
  const canGenPdf   = readyCount > 0 && !!topic.trim() && !generatingPdf;

  // ── PDF full-screen early return ──────────────────────────────────────────────
  if (pdfs && examMeta) {
    return (
      <PDFPreview pdfs={pdfs} meta={examMeta}
        onReset={() => { setPdfs(null); setExamMeta(null); }} />
    );
  }

  const ADD_TYPES: { type: SlotType; emoji: string }[] = [
    { type: "mcq",       emoji: "🔵" },
    { type: "truefalse", emoji: "🟢" },
    { type: "problem",   emoji: "🟠" },
    { type: "casestudy", emoji: "🟣" },
    { type: "code",      emoji: "⚫" },
  ];

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── LEFT: Config + Slot Builder ────────────────────────────────────── */}
      <div className="w-[460px] flex-shrink-0 border-r border-border overflow-y-auto h-screen">
        <div className="px-7 pt-10 pb-24 space-y-6">

          {/* Back */}
          <motion.button initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            whileHover={{ x: -3 }} transition={{ type: "spring", stiffness: 300 }}
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </motion.button>

          {/* Title */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" /> EXAM BUILDER
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Build your exam</h1>
            <p className="text-muted-foreground text-sm">Add questions slot by slot — control every detail.</p>
          </motion.div>

          {/* Topic */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <label className="block text-sm font-semibold mb-2">Topic <span className="text-red-400">*</span></label>
            <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Machine Learning, SQL, Linear Algebra…"
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all" />
          </motion.div>

          {/* Difficulty */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <label className="block text-sm font-semibold mb-3">Difficulty</label>
            <div className="flex gap-3">
              {DIFFICULTIES.map(d => {
                const cfg = DIFF_CONFIG[d];
                return (
                  <motion.button key={d} onClick={() => setDifficulty(d)}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      difficulty === d ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm` : "bg-card border-border text-muted-foreground hover:border-primary/30"
                    }`}>{d}</motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* Language */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
            <label className="block text-sm font-semibold mb-3">Language</label>
            <div className="flex gap-3">
              {LANGUAGES.map(l => (
                <motion.button key={l} onClick={() => setLanguage(l)}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                  className={`px-6 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    language === l ? "bg-primary/15 text-primary border-primary/40 shadow-sm" : "bg-card border-border text-muted-foreground hover:border-primary/30"
                  }`}>{l}</motion.button>
              ))}
            </div>
          </motion.div>

          {/* Exam Header */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            <HeaderSection value={examHeader} onChange={setExamHeader} />
          </motion.div>

          {/* ── Add Question Slots ─────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold">Questions</label>
              {slots.length > 0 && (
                <span className="text-xs text-muted-foreground">{slots.length} slot{slots.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {/* Add buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {ADD_TYPES.map(({ type, emoji }) => (
                <motion.button key={type} onClick={() => addSlot(type)}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  disabled={!topic.trim()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-40 ${SLOT_META[type].color} ${SLOT_META[type].bg} ${SLOT_META[type].border} hover:opacity-80`}>
                  <Plus className="w-3 h-3" /> {emoji} {SLOT_META[type].label}
                </motion.button>
              ))}
            </div>

            {!topic.trim() && (
              <p className="text-xs text-muted-foreground text-center py-3">Enter a topic first to add questions</p>
            )}

            {/* Slot cards */}
            <div className="space-y-3">
              <AnimatePresence>
                {slots.map(slot => (
                  <SlotCard key={slot.id} slot={slot} topic={topic}
                    onUpdate={patch => updateSlot(slot.id, patch)}
                    onGenerate={() => generateSlot(slot.id)}
                    onRemove={() => removeSlot(slot.id)} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

        </div>
      </div>

      {/* ── RIGHT: Live Document Preview ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-100">

        {/* Right header */}
        <div className="px-6 pt-4 pb-3 border-b border-border bg-background flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold">Live Preview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {doneSlots.length === 0 ? "Your exam will appear here as you generate questions" : `${readyCount} question${readyCount !== 1 ? "s" : ""} · drag to reorder`}
            </p>
          </div>
          {topic.trim() && (
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2.5 py-1 rounded-full border font-semibold ${dc.bg} ${dc.color} ${dc.border}`}>
                {difficulty}
              </span>
              <span className="px-2.5 py-1 rounded-full border border-border bg-card text-muted-foreground">
                {language}
              </span>
            </div>
          )}
        </div>

        {/* Document preview */}
        <div className="flex-1 overflow-hidden">
          <LiveDocumentPreview
            doneSlots={doneSlots}
            header={examHeader}
            topic={topic}
            difficulty={difficulty}
            language={language}
            readyCount={readyCount}
            dragOverId={dragOverId}
            onRegenerate={id => generateSlot(id)}
            onRemove={id => setDoneSlots(prev => prev.filter(s => s.id !== id))}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        </div>

        {/* Generate PDF button */}
        <div className="px-6 py-5 border-t border-border flex-shrink-0">
          {readyCount > 0 && (
            <p className="text-xs text-muted-foreground text-center mb-3">
              {readyCount} question{readyCount !== 1 ? "s" : ""} in order · PDF will match this sequence
            </p>
          )}
          <motion.button onClick={handleGeneratePdf} disabled={!canGenPdf}
            whileHover={canGenPdf ? { scale: 1.02 } : {}}
            whileTap={canGenPdf ? { scale: 0.98 } : {}}
            className={`w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
              canGenPdf
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}>
            {generatingPdf ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate TEK-UP PDF</>
            )}
          </motion.button>
          {!topic.trim() && (
            <p className="text-center text-xs text-muted-foreground mt-2">Enter a topic to continue</p>
          )}
          {topic.trim() && readyCount === 0 && (
            <p className="text-center text-xs text-muted-foreground mt-2">Generate at least one question to create the PDF</p>
          )}
        </div>

      </div>
    </div>
  );
}
