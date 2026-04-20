import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Sparkles, Loader2, Plus, Minus, ChevronRight, X, BookOpen, Clock, Globe, Zap } from "lucide-react";
import Spline from "@splinetool/react-spline";

const API = "http://127.0.0.1:8000";

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const TIME_LIMITS  = ["No Limit", "15 min", "30 min", "45 min", "60 min"] as const;
const LANGUAGES    = ["English", "French"] as const;

type Difficulty = typeof DIFFICULTIES[number];
type TimeLimit  = typeof TIME_LIMITS[number];
type Language   = typeof LANGUAGES[number];

interface QuestionMix { mcq: number; truefalse: number; problem: number; casestudy: number }

const QUESTION_TYPES: { key: keyof QuestionMix; label: string; desc: string; color: string }[] = [
  { key: "mcq",       label: "MCQ",            desc: "Multiple choice, 4 options",            color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  { key: "truefalse", label: "True / False",   desc: "Quick concept check",                   color: "text-green-400 border-green-500/30 bg-green-500/10" },
  { key: "problem",   label: "Problem Solving", desc: "Short open-answer question",           color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
  { key: "casestudy", label: "Case Study",     desc: "Scenario + data table + sub-questions", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
];

const GEN_MESSAGES = [
  "Crafting your questions…",
  "Adding explanations…",
  "Balancing difficulty…",
  "Finalizing your exam…",
];

const DIFF_CONFIG = {
  Easy:   { color: "text-green-400", bg: "bg-green-500/15", border: "border-green-500/40", dot: "bg-green-400" },
  Medium: { color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/40", dot: "bg-amber-400" },
  Hard:   { color: "text-red-400",   bg: "bg-red-500/15",   border: "border-red-500/40",   dot: "bg-red-400"   },
};

// ── Progress Steps ────────────────────────────────────────────────────────────
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
                done    ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/40" :
                current ? "border-primary text-primary scale-110 shadow-sm shadow-primary/20" :
                          "border-border text-muted-foreground"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-[10px] font-medium transition-colors duration-300 ${
                done || current ? "text-primary" : "text-muted-foreground"
              }`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 mx-2 mb-4 h-[2px] bg-border rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
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

export default function ExamPromptConfig() {
  const navigate = useNavigate();

  const [topic,      setTopic]      = useState("");
  const [focusTags,  setFocusTags]  = useState<string[]>([]);
  const [focusInput, setFocusInput] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [mix,        setMix]        = useState<QuestionMix>({ mcq: 3, truefalse: 0, problem: 1, casestudy: 1 });
  const [timeLimit,  setTimeLimit]  = useState<TimeLimit>("30 min");
  const [language,   setLanguage]   = useState<Language>("English");
  const [generating, setGenerating] = useState(false);
  const [genMsgIdx,  setGenMsgIdx]  = useState(0);

  const topicInputRef = useRef<HTMLInputElement>(null);
  const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusInputRef    = useRef<HTMLInputElement>(null);

  const [focusSuggestions, setFocusSuggestions] = useState<string[]>([]);
  const [loadingFocusSugg, setLoadingFocusSugg] = useState(false);

  // cycling loading text during generation
  useEffect(() => {
    if (!generating) { setGenMsgIdx(0); return; }
    const id = setInterval(() => setGenMsgIdx(i => (i + 1) % GEN_MESSAGES.length), 3500);
    return () => clearInterval(id);
  }, [generating]);

  // fetch focus suggestions (debounced)
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

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    const focusStr = focusTags.length > 0 ? focusTags.join(", ") : focusInput.trim();
    try {
      const res = await fetch(`${API}/exam/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, focus: focusStr, difficulty, mix, time_limit: timeLimit, language }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      navigate("/exam/take", { state: { exam: data, timeLimit, topic } });
    } catch (e: any) {
      alert(`Failed to generate exam: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const dc = DIFF_CONFIG[difficulty];

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── LEFT: Form ──────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 xl:w-[52%] relative z-10">
        <div className="px-8 pt-10 pb-24 max-w-xl mx-auto">

          {/* Back */}
          <motion.button
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            whileHover={{ x: -3 }} transition={{ type: "spring", stiffness: 300 }}
            onClick={() => navigate("/exam")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </motion.button>

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" /> GENERATE FROM PROMPT
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Configure your exam</h1>
            <p className="text-muted-foreground text-sm">Fill in the details and AI will build a complete exam for you.</p>
          </motion.div>

          {/* Progress Steps */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <ProgressSteps step={progressStep} />
          </motion.div>

          {/* Live Summary Card */}
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
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                    {topic}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className={`flex items-center gap-1.5 font-medium ${dc.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dc.dot}`} />
                    {difficulty}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Zap className="w-3 h-3" />
                    <AnimatePresence mode="wait">
                      <motion.span key={totalQuestions}
                        initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 5, opacity: 0 }}
                        transition={{ duration: 0.12 }} className="inline-block tabular-nums"
                      >
                        {totalQuestions}
                      </motion.span>
                    </AnimatePresence>
                    &nbsp;question{totalQuestions !== 1 ? "s" : ""}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" /> {timeLimit}
                  </span>
                  <span className="text-border/60">·</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Globe className="w-3 h-3" /> {language}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-8">

            {/* ── Topic ───────────────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <label className="block text-sm font-semibold mb-2">
                Topic <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  ref={topicInputRef}
                  type="text"
                  value={topic}
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

            {/* ── Specific Focus ──────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold">
                  Specific Focus
                  <span className="text-muted-foreground font-normal ml-1 text-xs">(optional)</span>
                </label>
                {focusTags.length > 0 && (
                  <button onClick={() => setFocusTags([])} className="text-xs text-muted-foreground hover:text-red-400 transition-colors">
                    Clear all
                  </button>
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
                      <button onClick={() => removeFocusTag(tag)} className="hover:text-red-400 transition-colors ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
                <input
                  ref={focusInputRef}
                  type="text"
                  value={focusInput}
                  onChange={e => setFocusInput(e.target.value)}
                  onKeyDown={handleFocusKeyDown}
                  placeholder={focusTags.length === 0 ? "Type a focus or pick from suggestions below…" : "Add more…"}
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
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading subtopics for "{topic}"…
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
                                  selected
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
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

            {/* ── Difficulty ──────────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <label className="block text-sm font-semibold mb-3">Difficulty</label>
              <div className="flex gap-3">
                {DIFFICULTIES.map(d => {
                  const cfg = DIFF_CONFIG[d];
                  return (
                    <motion.button key={d} onClick={() => setDifficulty(d)}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        difficulty === d
                          ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm`
                          : "bg-card border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {d}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            {/* ── Question Mix ────────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold">Question Mix</label>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all duration-300 ${
                  totalQuestions > 0
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  <AnimatePresence mode="wait">
                    <motion.span key={totalQuestions}
                      initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
                      transition={{ duration: 0.14 }} className="inline-block tabular-nums"
                    >
                      {totalQuestions}
                    </motion.span>
                  </AnimatePresence>
                  {" "}question{totalQuestions !== 1 ? "s" : ""} total
                </span>
              </div>
              <div className="space-y-3">
                {QUESTION_TYPES.map(({ key, label, desc, color }) => (
                  <motion.div key={key}
                    whileHover={{ x: 3 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
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
                      >
                        <Minus className="w-3 h-3" />
                      </motion.button>
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={mix[key]}
                          initial={{ y: -8, opacity: 0, scale: 0.7 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: 8, opacity: 0, scale: 0.7 }}
                          transition={{ duration: 0.14 }}
                          className="w-5 text-center text-sm font-bold inline-block tabular-nums"
                        >
                          {mix[key]}
                        </motion.span>
                      </AnimatePresence>
                      <motion.button onClick={() => adjustMix(key, 1)} disabled={mix[key] === 10}
                        whileTap={{ scale: 0.8 }}
                        className="w-7 h-7 rounded-lg border border-current/30 flex items-center justify-center hover:bg-white/10 disabled:opacity-30 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* ── Time Limit ──────────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <label className="block text-sm font-semibold mb-3">Time Limit</label>
              <div className="flex flex-wrap gap-2">
                {TIME_LIMITS.map(t => (
                  <motion.button key={t} onClick={() => setTimeLimit(t)}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      timeLimit === t
                        ? "bg-primary/15 text-primary border-primary/40 shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {t}
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* ── Language ────────────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <label className="block text-sm font-semibold mb-3">Language</label>
              <div className="flex gap-3">
                {LANGUAGES.map(l => (
                  <motion.button key={l} onClick={() => setLanguage(l)}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                    className={`px-6 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      language === l
                        ? "bg-primary/15 text-primary border-primary/40 shadow-sm"
                        : "bg-card border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {l}
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* ── Generate Button ─────────────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
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
                      >
                        {GEN_MESSAGES[genMsgIdx]}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                ) : (
                  <>Generate Exam <ChevronRight className="w-4 h-4" /></>
                )}
              </motion.button>

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
      </div>

      {/* ── RIGHT: Spline 3D ─────────────────────────────────────────────────── */}
      <div className="hidden lg:block lg:w-1/2 xl:w-[48%] sticky top-0 h-screen overflow-hidden bg-background">
        <Spline scene="https://prod.spline.design/AeeKEcMpGDFQpKYe/scene.splinecode" />
      </div>

    </div>
  );
}
