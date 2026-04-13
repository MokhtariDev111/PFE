import { useState, Suspense, lazy } from "react";
const Spline = lazy(() => import('@splinetool/react-spline'));
import { motion, AnimatePresence } from "framer-motion";
import FloatingLines from "@/components/reactbits/FloatingLines";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import {
  Brain, Zap, ArrowRight, Check, ChevronDown, ChevronUp,
  RotateCcw, Download, Loader2, Image as ImageIcon,
} from "lucide-react";

const API = "http://127.0.0.1:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category { name: string; concepts: string[] }
interface ConceptTree { topic: string; categories: Category[] }

interface Question {
  type: "text" | "image";
  question: string;
  format: "mcq" | "true_false" | "short_answer";
  concept: string;
  options?: string[];
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  image_prompt?: string;
  image_url?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIFF_COLOR: Record<string, string> = {
  easy:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  medium: "bg-amber-500/15   text-amber-400   border-amber-500/25",
  hard:   "bg-red-500/15     text-red-400     border-red-500/25",
};

const FMT_LABEL: Record<string, string> = {
  mcq: "MCQ", true_false: "True / False", short_answer: "Short Answer",
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
      ${done   ? "bg-primary border-primary text-primary-foreground"
      : active ? "border-primary text-primary bg-primary/10"
               : "border-border text-muted-foreground"}`}>
      {done ? <Check className="w-4 h-4" /> : n}
    </div>
  );
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({ q, index }: { q: Question; index: number }) {
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card className="glass-card overflow-hidden">
        {/* difficulty accent bar */}
        <div className={`h-1 w-full ${
          q.difficulty === "easy" ? "bg-emerald-500" :
          q.difficulty === "medium" ? "bg-amber-500" : "bg-red-500"
        }`} />

        <CardContent className="pt-5 pb-4 space-y-4">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Q{index + 1}</span>
            <Badge variant="outline" className={`text-[10px] ${DIFF_COLOR[q.difficulty]}`}>
              {q.difficulty}
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
              {FMT_LABEL[q.format] ?? q.format}
            </Badge>
            <span className="text-[10px] text-muted-foreground ml-auto">{q.concept}</span>
          </div>

          {/* Question text */}
          <p className="font-medium leading-relaxed">{q.question}</p>

          {/* Image */}
          {q.type === "image" && q.image_url && (
            <div className="rounded-xl overflow-hidden border border-border">
              <img src={q.image_url} alt="diagram" className="w-full object-contain max-h-64" />
            </div>
          )}
          {q.type === "image" && !q.image_url && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/40 text-muted-foreground text-sm">
              <ImageIcon className="w-4 h-4 shrink-0" />
              <span className="italic truncate">{q.image_prompt?.slice(0, 80)}…</span>
            </div>
          )}

          {/* Options */}
          {q.options && q.options.length > 0 && (
            <div className="space-y-2">
              {q.options.map((opt) => {
                const isSelected = selected === opt;
                const isAns = opt === q.answer;
                let cls = "border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary/30";
                if (revealed) {
                  cls = isAns
                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                    : isSelected
                    ? "border-red-500/60 bg-red-500/10 text-red-400"
                    : "border-border bg-secondary/20 opacity-50";
                } else if (isSelected) {
                  cls = "border-primary/60 bg-primary/10";
                }
                return (
                  <button
                    key={opt}
                    onClick={() => !revealed && setSelected(opt)}
                    className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${cls}`}
                  >
                    {revealed && isAns && <Check className="inline w-3.5 h-3.5 mr-2 text-emerald-400" />}
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* Reveal toggle */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              size="sm"
              variant={revealed ? "secondary" : "outline"}
              onClick={() => setRevealed(!revealed)}
              className="text-xs gap-1.5"
            >
              {revealed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {revealed ? "Hide answer" : "Show answer"}
            </Button>
          </div>

          {/* Answer + explanation */}
          <AnimatePresence>
            {revealed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2 space-y-2 border-t border-border/50">
                  {q.format === "short_answer" && (
                    <p className="text-sm">
                      <span className="text-emerald-400 font-semibold">Answer: </span>
                      {q.answer}
                    </p>
                  )}
                  {q.explanation && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      <span className="text-primary font-semibold">💡 </span>
                      {q.explanation}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QuizPage() {
  const { toast } = useToast();

  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("English");
  const [totalQ, setTotalQ] = useState(8);
  const [imageQ, setImageQ] = useState(0);

  const [conceptTree, setConceptTree] = useState<ConceptTree | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [questions, setQuestions] = useState<Question[]>([]);

  const [loadingConcepts, setLoadingConcepts] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);

  const step = questions.length > 0 ? 3 : conceptTree ? 2 : 1;

  const fetchConcepts = async () => {
    if (!topic.trim()) {
      toast({ title: "Enter a topic first", variant: "destructive" });
      return;
    }
    setLoadingConcepts(true);
    setConceptTree(null);
    setSelected(new Set());
    setQuestions([]);
    try {
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("language", language);
      const res = await fetch(`${API}/quiz/concepts`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data: ConceptTree = await res.json();
      setConceptTree(data);
      setSelected(new Set(data.categories.flatMap(c => c.concepts)));
    } catch (e: any) {
      toast({ title: "Failed to extract concepts", description: e.message, variant: "destructive" });
    } finally {
      setLoadingConcepts(false);
    }
  };

  const generateQuiz = async (seed?: number) => {
    if (selected.size === 0) {
      toast({ title: "Select at least one concept", variant: "destructive" });
      return;
    }
    setLoadingQuiz(true);
    setQuestions([]);
    try {
      const fd = new FormData();
      fd.append("topic", topic);
      fd.append("language", language);
      fd.append("selected_concepts", JSON.stringify([...selected]));
      fd.append("total_questions", String(totalQ));
      fd.append("image_questions_count", String(imageQ));
      fd.append("seed", String(seed ?? Date.now()));
      const res = await fetch(`${API}/quiz/generate`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setQuestions(data.questions ?? []);
      toast({ title: `Quiz ready — ${data.questions?.length ?? 0} questions` });
    } catch (e: any) {
      toast({ title: "Quiz generation failed", description: e.message, variant: "destructive" });
    } finally {
      setLoadingQuiz(false);
    }
  };

  const [customConcept, setCustomConcept] = useState("");

  const addCustomConcept = () => {
    const c = customConcept.trim();
    if (!c) return;
    // Add to selected and inject into a "Custom" category in the tree
    setConceptTree(prev => {
      if (!prev) return prev;
      const existing = prev.categories.find(cat => cat.name === "Custom");
      if (existing) {
        if (existing.concepts.includes(c)) return prev;
        return { ...prev, categories: prev.categories.map(cat =>
          cat.name === "Custom" ? { ...cat, concepts: [...cat.concepts, c] } : cat
        )};
      }
      return { ...prev, categories: [...prev.categories, { name: "Custom", concepts: [c] }] };
    });
    setSelected(prev => new Set([...prev, c]));
    setCustomConcept("");
  };

  const reset = () => {
    setTopic(""); setConceptTree(null);
    setSelected(new Set()); setQuestions([]);
  };

  const toggleConcept = (c: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  const toggleCategory = (cat: Category) => {
    const allSelected = cat.concepts.every(c => selected.has(c));
    setSelected(prev => {
      const next = new Set(prev);
      cat.concepts.forEach(c => allSelected ? next.delete(c) : next.add(c));
      return next;
    });
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(questions, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quiz_${topic.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
  };

  return (
    <div className="h-screen bg-background relative overflow-hidden flex">

      {/* ── Layer 1: FloatingLines shader (fills the black void) ── */}
      <div className="fixed inset-0 z-0">
        <FloatingLines
          linesGradient={['#5227FF', '#a855f7', '#FF9FFC', '#3b82f6', '#5227FF']}
          enabledWaves={['top', 'middle', 'bottom']}
          lineCount={[6, 8, 6]}
          lineDistance={[5, 4, 5]}
          animationSpeed={0.8}
          interactive={true}
          bendRadius={4}
          bendStrength={-0.4}
          parallax={true}
          parallaxStrength={0.15}
          mixBlendMode="normal"
        />
      </div>

      {/* ── Layer 2: Spline robot — shifted right and scaled up ── */}
      <div className="fixed z-[1]" style={{
        top: "-2%", left: "20%", width: "105%", height: "110%",
      }}>
        <Suspense fallback={null}>
          <Spline
            scene="https://prod.spline.design/Qy8xVaaZ6Cf4EBS5/scene.splinecode"
            style={{ width: "100%", height: "100%" }}
          />
        </Suspense>
        {/* Cover the "Built with Spline" watermark (bottom-right corner) */}
        <div className="absolute bottom-0 right-0 w-44 h-10 bg-background z-10" />
      </div>

      {/* ── Layer 3: subtle vignette so UI stays readable ── */}
      <div className="fixed inset-0 z-[2] pointer-events-none bg-background/20" />

      {/* ══════════════════════════════════════════
          STEP 1 — Left sidebar + bottom topic bar
      ══════════════════════════════════════════ */}
      <AnimatePresence>
        {step === 1 && (
          <>
            {/* Left sidebar — parameters */}
            <motion.aside
              key="sidebar"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.4 }}
              className="relative z-[10] w-72 h-screen flex flex-col gap-6 px-5 py-8 bg-card/60 backdrop-blur-xl border-r border-border/40"
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold w-fit">
                <Brain className="w-3.5 h-3.5" /> QUIZ GENERATOR
              </div>

              <div>
                <h1 className="text-2xl font-bold gradient-text leading-tight">Create a Quiz</h1>
                <p className="text-xs text-muted-foreground mt-1">Configure then enter your topic below</p>
              </div>

              <div className="h-px bg-border/50" />

              {/* Language */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="bg-secondary/40 border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="English">🇬🇧 English</SelectItem>
                    <SelectItem value="French">🇫🇷 French</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Total questions */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Total questions — <span className="text-primary font-bold text-sm">{totalQ}</span>
                </label>
                <Slider
                  value={[totalQ]}
                  onValueChange={v => { setTotalQ(v[0]); if (imageQ > v[0]) setImageQ(0); }}
                  min={3} max={20} step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>3</span><span>20</span>
                </div>
              </div>

              {/* Image questions */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Image questions — <span className="text-primary font-bold text-sm">{imageQ}</span>
                </label>
                <Slider
                  value={[imageQ]}
                  onValueChange={v => setImageQ(v[0])}
                  min={0} max={Math.min(totalQ, 5)} step={1}
                />
                <p className="text-[10px] text-muted-foreground">AI generates diagrams for these</p>
              </div>

              {/* Step dots at bottom */}
              <div className="mt-auto flex items-center gap-3">
                {["Configure", "Concepts", "Quiz"].map((label, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <StepDot n={i + 1} active={step === i + 1} done={step > i + 1} />
                    {i < 2 && <div className="w-4 h-px bg-border" />}
                  </div>
                ))}
              </div>
            </motion.aside>

            {/* Bottom center — topic input (bigger, truly centered) */}
            <motion.div
              key="topic-bar"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="fixed bottom-12 left-0 right-0 z-[10] flex flex-col items-center px-6"
            >
              <div className="w-full max-w-4xl flex items-center gap-4 px-7 py-4 rounded-2xl bg-card/75 backdrop-blur-2xl border border-primary/40 shadow-2xl shadow-black/40"
                style={{ boxShadow: "0 0 0 1px hsl(var(--primary)/0.3), 0 0 24px 4px hsl(var(--primary)/0.2), 0 8px 32px rgba(0,0,0,0.4)" }}
              >
                <Brain className="w-6 h-6 text-primary shrink-0" />
                <input
                  className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-base focus:outline-none"
                  placeholder="Enter a topic — e.g. Machine Learning, SQL, Neural Networks…"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && fetchConcepts()}
                  autoFocus
                />
                <Button
                  onClick={fetchConcepts}
                  disabled={loadingConcepts || !topic.trim()}
                  className="launch-button shrink-0 px-6"
                  size="default"
                >
                  {loadingConcepts
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><ArrowRight className="w-4 h-4 mr-1" /> Start</>}
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground/50 mt-2">Press Enter or click Start</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          STEP 2 & 3 — scrollable content panel
      ══════════════════════════════════════════ */}
      <AnimatePresence>
        {step > 1 && (
          <motion.div
            key="content"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
            className="relative z-[10] w-full max-w-2xl h-screen overflow-y-auto px-6 py-8 bg-background/70 backdrop-blur-xl border-r border-border/40"
          >

            {/* Step indicators */}
            <div className="flex items-center gap-3 mb-8">
              {["Configure", "Select Concepts", "Quiz"].map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <StepDot n={i + 1} active={step === i + 1} done={step > i + 1} />
                  <span className={`text-sm hidden sm:block ${step === i + 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                  {i < 2 && <div className="w-6 h-px bg-border mx-1" />}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">

              {/* ── STEP 2 ── */}
              {step === 2 && conceptTree && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">{conceptTree.topic}</h2>
                      <p className="text-sm text-muted-foreground">
                        {selected.size} / {conceptTree.categories.flatMap(c => c.concepts).length} concepts selected
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelected(new Set(conceptTree.categories.flatMap(c => c.concepts)))}>All</Button>
                      <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>None</Button>
                    </div>
                  </div>

                  {conceptTree.categories.map((cat, ci) => {
                    const allSel = cat.concepts.every(c => selected.has(c));
                    const someSel = cat.concepts.some(c => selected.has(c));
                    return (
                      <Card key={ci} className="glass-card">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{cat.name}</CardTitle>
                            <button
                              onClick={() => toggleCategory(cat)}
                              className={`text-xs px-3 py-1 rounded-full border transition-all ${
                                allSel ? "bg-primary/15 text-primary border-primary/30"
                                : someSel ? "bg-primary/8 text-primary/70 border-primary/20"
                                : "bg-secondary text-muted-foreground border-border"
                              }`}
                            >
                              {allSel ? "Deselect all" : "Select all"}
                            </button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {cat.concepts.map(concept => (
                              <button
                                key={concept}
                                onClick={() => toggleConcept(concept)}
                                className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                                  selected.has(concept)
                                    ? "bg-primary/15 text-primary border-primary/40 font-medium"
                                    : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/30"
                                }`}
                              >
                                {selected.has(concept) && <Check className="inline w-3 h-3 mr-1" />}
                                {concept}
                              </button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* Custom concept input */}
                  <div className="flex gap-2 pt-1">
                    <input
                      className="flex-1 px-4 py-2 rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
                      placeholder="Add your own concept…"
                      value={customConcept}
                      onChange={e => setCustomConcept(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addCustomConcept()}
                    />
                    <Button size="sm" variant="outline" onClick={addCustomConcept} disabled={!customConcept.trim()} className="gap-1.5 shrink-0">
                      <Check className="w-3.5 h-3.5" /> Add
                    </Button>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={reset} className="gap-2">
                      <RotateCcw className="w-4 h-4" /> Start over
                    </Button>
                    <Button onClick={() => generateQuiz()} disabled={loadingQuiz || selected.size === 0} className="launch-button flex-1" size="lg">
                      {loadingQuiz
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating {totalQ} questions…</>
                        : <><Zap className="w-4 h-4" /> Generate Quiz ({totalQ} questions)</>}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3 ── */}
              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-xl font-bold">{topic}</h2>
                      <p className="text-sm text-muted-foreground">{questions.length} questions · {language}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={downloadJSON} className="gap-1.5">
                        <Download className="w-3.5 h-3.5" /> Export JSON
                      </Button>
                      <Button size="sm" variant="outline" onClick={reset} className="gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" /> New quiz
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    {(["easy", "medium", "hard"] as const).map(d => {
                      const count = questions.filter(q => q.difficulty === d).length;
                      if (!count) return null;
                      return (
                        <span key={d} className={`tag border ${DIFF_COLOR[d]}`}>
                          {count} {d}
                        </span>
                      );
                    })}
                  </div>

                  <div className="space-y-4">
                    {questions.map((q, i) => <QuestionCard key={i} q={q} index={i} />)}
                  </div>

                  <Button onClick={() => generateQuiz(Date.now())} disabled={loadingQuiz} variant="outline" className="w-full gap-2">
                    {loadingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Regenerate quiz
                  </Button>
                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
