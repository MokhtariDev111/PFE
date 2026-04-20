import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";

const API = "http://127.0.0.1:8000";

// ── Types ────────────────────────────────────────────────────────────────────
interface MCQQuestion   { id: number; type: "mcq";       question: string; options: string[]; correct: number; explanation: string }
interface TFQuestion    { id: number; type: "truefalse";  question: string; correct: boolean; explanation: string }
interface ProblemQ      { id: number; type: "problem";    question: string; model_answer: string; key_points: string[] }
interface SubQuestion   { id: string; question: string; model_answer: string; points: number }
interface CaseStudyQ    { id: number; type: "casestudy"; context: string; table: { headers: string[]; rows: string[][] }; subquestions: SubQuestion[] }
type Question = MCQQuestion | TFQuestion | ProblemQ | CaseStudyQ;

interface Exam { id: string; title: string; topic: string; difficulty: string; language: string; time_limit: string; questions: Question[] }

// ── Timer hook ───────────────────────────────────────────────────────────────
function useTimer(timeLimitStr: string, onExpire: () => void) {
  const seconds = (() => {
    const m = timeLimitStr.match(/(\d+)/);
    return m ? parseInt(m[1]) * 60 : 0;
  })();

  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (seconds === 0) return;
    const id = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(id); onExpire(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const pct = seconds > 0 ? (remaining / seconds) * 100 : 100;
  const urgent = seconds > 0 && remaining < 120;
  return { display: seconds > 0 ? fmt(remaining) : "∞", pct, urgent };
}

// ── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full bg-border rounded-full h-1.5 mb-6">
      <motion.div
        className="h-1.5 rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${(current / total) * 100}%` }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}

// ── MCQ ──────────────────────────────────────────────────────────────────────
function MCQCard({ q, onAnswer }: { q: MCQQuestion; onAnswer: (i: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const pick = (i: number) => { if (selected !== null) return; setSelected(i); setTimeout(() => onAnswer(i), 600); };

  return (
    <div className="space-y-3">
      <p className="text-base font-medium leading-relaxed mb-5">{q.question}</p>
      {q.options.map((opt, i) => (
        <button
          key={i} onClick={() => pick(i)}
          className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
            selected === null
              ? "border-border hover:border-primary/40 hover:bg-primary/5 bg-card"
              : selected === i
                ? i === q.correct ? "border-green-500 bg-green-500/10 text-green-400" : "border-red-500 bg-red-500/10 text-red-400"
                : i === q.correct && selected !== null ? "border-green-500/50 bg-green-500/5 text-green-400" : "border-border bg-card opacity-50"
          }`}
        >
          {opt}
        </button>
      ))}
      {selected !== null && (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className={`text-xs mt-3 px-4 py-2 rounded-lg ${selected === q.correct ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
          {q.explanation}
        </motion.p>
      )}
    </div>
  );
}

// ── True/False ───────────────────────────────────────────────────────────────
function TFCard({ q, onAnswer }: { q: TFQuestion; onAnswer: (v: boolean) => void }) {
  const [selected, setSelected] = useState<boolean | null>(null);
  const pick = (v: boolean) => { if (selected !== null) return; setSelected(v); setTimeout(() => onAnswer(v), 600); };

  return (
    <div>
      <p className="text-base font-medium leading-relaxed mb-6">{q.question}</p>
      <div className="flex gap-4">
        {([true, false] as const).map(v => (
          <button key={String(v)} onClick={() => pick(v)}
            className={`flex-1 py-4 rounded-xl border text-sm font-bold transition-all ${
              selected === null
                ? "border-border hover:border-primary/40 bg-card"
                : selected === v
                  ? v === q.correct ? "border-green-500 bg-green-500/10 text-green-400" : "border-red-500 bg-red-500/10 text-red-400"
                  : v === q.correct ? "border-green-500/50 bg-green-500/5 text-green-400" : "border-border opacity-50"
            }`}
          >
            {v ? "✓ True" : "✗ False"}
          </button>
        ))}
      </div>
      {selected !== null && (
        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className={`text-xs mt-3 px-4 py-2 rounded-lg ${selected === q.correct ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
          {q.explanation}
        </motion.p>
      )}
    </div>
  );
}

// ── Problem Solving ───────────────────────────────────────────────────────────
function ProblemCard({ q, onAnswer }: { q: ProblemQ; onAnswer: (a: string) => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <div>
      <p className="text-base font-medium leading-relaxed mb-4">{q.question}</p>
      <textarea
        value={answer} onChange={e => setAnswer(e.target.value)}
        rows={6}
        placeholder="Write your answer here…"
        className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none transition-colors"
      />
      <button
        onClick={() => answer.trim() && onAnswer(answer.trim())}
        disabled={!answer.trim()}
        className="mt-3 w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all flex items-center justify-center gap-2"
      >
        Submit Answer <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Case Study ────────────────────────────────────────────────────────────────
function CaseStudyCard({ q, onAnswer }: { q: CaseStudyQ; onAnswer: (answers: string[]) => void }) {
  const [answers, setAnswers] = useState<string[]>(q.subquestions.map(() => ""));
  const [subIdx, setSubIdx] = useState(0);

  const next = () => {
    if (subIdx < q.subquestions.length - 1) setSubIdx(i => i + 1);
    else onAnswer(answers);
  };

  return (
    <div className="space-y-4">
      {/* Context */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-sm leading-relaxed">
        <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wide">Context</p>
        <p className="text-foreground/90">{q.context}</p>
      </div>

      {/* Table */}
      {q.table?.headers?.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-primary/10">
              <tr>{q.table.headers.map((h, i) => <th key={i} className="px-4 py-2.5 text-left font-semibold text-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.table.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-secondary/30 transition-colors">
                  {row.map((cell, ci) => <td key={ci} className="px-4 py-2.5 text-muted-foreground">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Current sub-question */}
      <div className="border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-primary uppercase">
            Question {q.subquestions[subIdx].id}
          </span>
          <span className="text-xs text-muted-foreground">{q.subquestions[subIdx].points} pts</span>
        </div>
        <p className="text-sm font-medium mb-3">{q.subquestions[subIdx].question}</p>
        <textarea
          value={answers[subIdx]}
          onChange={e => setAnswers(prev => { const a = [...prev]; a[subIdx] = e.target.value; return a; })}
          rows={4}
          placeholder="Write your answer…"
          className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none transition-colors"
        />
        <button
          onClick={next}
          disabled={!answers[subIdx].trim()}
          className="mt-3 w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-all flex items-center justify-center gap-2"
        >
          {subIdx < q.subquestions.length - 1 ? <>Next Sub-question <ChevronRight className="w-4 h-4" /></> : <>Submit Case Study <CheckCircle2 className="w-4 h-4" /></>}
        </button>
        <div className="flex gap-1 mt-3 justify-center">
          {q.subquestions.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full flex-1 transition-colors ${i <= subIdx ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExamTakePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { exam, timeLimit, topic } = (location.state ?? {}) as { exam: Exam; timeLimit: string; topic: string };

  const [qIndex,   setQIndex]   = useState(0);
  const [answers,  setAnswers]  = useState<any[]>([]);
  const [grading,  setGrading]  = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleExpire = useCallback(() => { if (!submitted) submitAll(); }, [submitted]);
  const timer = useTimer(timeLimit ?? "No Limit", handleExpire);

  if (!exam) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No exam data found.</p>
          <button onClick={() => navigate("/exam/prompt")} className="text-primary underline text-sm">
            Go back and generate an exam
          </button>
        </div>
      </div>
    );
  }

  const questions = exam.questions ?? [];
  const current   = questions[qIndex];

  const recordAnswer = (answer: any) => {
    const updated = [...answers, { questionId: current.id, type: current.type, answer }];
    setAnswers(updated);
    if (qIndex + 1 < questions.length) {
      setTimeout(() => setQIndex(i => i + 1), current.type === "mcq" || current.type === "truefalse" ? 800 : 0);
    } else {
      submitAll(updated);
    }
  };

  const submitAll = async (finalAnswers = answers) => {
    if (submitted || grading) return;
    setSubmitted(true);
    setGrading(true);

    // Grade free-text answers via backend
    const gradedAnswers = await Promise.all(
      finalAnswers.map(async (ans) => {
        const q = questions.find(q => q.id === ans.questionId);
        if (!q) return ans;

        if (q.type === "problem") {
          try {
            const res = await fetch(`${API}/exam/grade`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question: q, student_answer: ans.answer, language: exam.language }),
            });
            const grade = await res.json();
            return { ...ans, grade };
          } catch { return ans; }
        }

        if (q.type === "casestudy") {
          const subGrades = await Promise.all(
            (q as CaseStudyQ).subquestions.map(async (subq, i) => {
              try {
                const res = await fetch(`${API}/exam/grade`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    question: { ...q, current_subquestion: subq },
                    student_answer: ans.answer[i] ?? "",
                    language: exam.language,
                  }),
                });
                return await res.json();
              } catch { return { score: 0, max_score: subq.points, feedback: "Grading unavailable" }; }
            })
          );
          return { ...ans, subGrades };
        }

        return ans;
      })
    );

    setGrading(false);
    navigate("/exam/results", { state: { exam, answers: gradedAnswers } });
  };

  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />

      {/* Grading overlay */}
      <AnimatePresence>
        {grading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-lg font-semibold">Grading your answers…</p>
              <p className="text-sm text-muted-foreground">This takes 10–20 seconds</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-8 pb-20">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold truncate max-w-xs">{exam.title}</h2>
            <p className="text-xs text-muted-foreground">{exam.difficulty} · {questions.length} questions</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-mono font-bold ${
            timer.urgent ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-border bg-card text-foreground"
          }`}>
            <Clock className="w-4 h-4" />
            {timer.display}
          </div>
        </div>

        <ProgressBar current={qIndex} total={questions.length} />

        {/* Question counter */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-muted-foreground font-medium">
            Question {qIndex + 1} of {questions.length}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            current.type === "mcq"        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
            : current.type === "truefalse"? "bg-green-500/10 text-green-400 border-green-500/20"
            : current.type === "problem"  ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
            :                               "bg-purple-500/10 text-purple-400 border-purple-500/20"
          }`}>
            {current.type === "mcq" ? "MCQ" : current.type === "truefalse" ? "True / False" : current.type === "problem" ? "Problem Solving" : "Case Study"}
          </span>
        </div>

        {/* Question card */}
        <AnimatePresence mode="wait">
          <motion.div key={qIndex}
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            {current.type === "mcq"        && <MCQCard       q={current as MCQQuestion}  onAnswer={recordAnswer} />}
            {current.type === "truefalse"  && <TFCard        q={current as TFQuestion}   onAnswer={recordAnswer} />}
            {current.type === "problem"    && <ProblemCard   q={current as ProblemQ}     onAnswer={recordAnswer} />}
            {current.type === "casestudy" && <CaseStudyCard q={current as CaseStudyQ}   onAnswer={recordAnswer} />}
          </motion.div>
        </AnimatePresence>

        {/* Dot navigation */}
        <div className="flex gap-1.5 justify-center mt-6">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
              i < qIndex ? "w-4 bg-primary" : i === qIndex ? "w-6 bg-primary" : "w-1.5 bg-border"
            }`} />
          ))}
        </div>

      </div>
    </div>
  );
}
