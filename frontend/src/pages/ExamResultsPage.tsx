import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, MinusCircle, RotateCcw, Home, TrendingUp } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface Question { id: number; type: string; question?: string; options?: string[]; correct?: any; explanation?: string; key_points?: string[]; model_answer?: string; context?: string; table?: any; subquestions?: any[] }
interface Answer   { questionId: number; type: string; answer: any; grade?: any; subGrades?: any[] }
interface Exam     { title: string; topic: string; difficulty: string; language: string; questions: Question[] }

// ── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ pct }: { pct: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const color = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#ffffff10" strokeWidth="10" />
        <motion.circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-3xl font-bold" style={{ color }}>
          {Math.round(pct)}%
        </motion.span>
        <span className="text-xs text-muted-foreground">score</span>
      </div>
    </div>
  );
}

// ── MCQ result ───────────────────────────────────────────────────────────────
function MCQResult({ q, ans }: { q: Question; ans: Answer }) {
  const correct = ans.answer === q.correct;
  return (
    <div className={`rounded-xl border p-4 ${correct ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
      <div className="flex items-start gap-3">
        {correct ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium mb-2">{q.question}</p>
          <p className="text-xs text-muted-foreground mb-1">
            Your answer: <span className={correct ? "text-green-400" : "text-red-400"}>{q.options?.[ans.answer] ?? "—"}</span>
          </p>
          {!correct && <p className="text-xs text-green-400 mb-1">Correct: {q.options?.[q.correct as number]}</p>}
          {q.explanation && <p className="text-xs text-muted-foreground italic mt-1">{q.explanation}</p>}
        </div>
      </div>
    </div>
  );
}

// ── True/False result ─────────────────────────────────────────────────────────
function TFResult({ q, ans }: { q: Question; ans: Answer }) {
  const correct = ans.answer === q.correct;
  return (
    <div className={`rounded-xl border p-4 ${correct ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
      <div className="flex items-start gap-3">
        {correct ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
        <div>
          <p className="text-sm font-medium mb-1">{q.question}</p>
          <p className="text-xs text-muted-foreground">
            Your answer: <span className={correct ? "text-green-400" : "text-red-400"}>{ans.answer ? "True" : "False"}</span>
            {!correct && <span className="text-green-400 ml-2">· Correct: {q.correct ? "True" : "False"}</span>}
          </p>
          {q.explanation && <p className="text-xs text-muted-foreground italic mt-1">{q.explanation}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Problem result ────────────────────────────────────────────────────────────
function ProblemResult({ q, ans }: { q: Question; ans: Answer }) {
  const grade  = ans.grade;
  const score  = grade?.score ?? 0;
  const max    = grade?.max_score ?? 10;
  const pct    = Math.round((score / max) * 100);
  const color  = pct >= 70 ? "text-green-400" : pct >= 40 ? "text-amber-400" : "text-red-400";
  const border = pct >= 70 ? "border-green-500/20 bg-green-500/5" : pct >= 40 ? "border-amber-500/20 bg-amber-500/5" : "border-red-500/20 bg-red-500/5";

  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="flex items-start gap-3">
        <MinusCircle className={`w-5 h-5 shrink-0 mt-0.5 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{q.question}</p>
            <span className={`text-sm font-bold shrink-0 ml-2 ${color}`}>{score}/{max}</span>
          </div>
          <div className="bg-card/60 rounded-lg p-3 mb-3 border border-border/50">
            <p className="text-xs text-muted-foreground font-medium mb-1">Your answer:</p>
            <p className="text-xs text-foreground/80 leading-relaxed">{ans.answer}</p>
          </div>
          {grade?.feedback && (
            <p className="text-xs text-muted-foreground italic mb-2">{grade.feedback}</p>
          )}
          {grade?.missing_points?.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-red-400 mb-1">Missing points:</p>
              {grade.missing_points.map((p: string, i: number) => (
                <p key={i} className="text-xs text-muted-foreground">· {p}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Case Study result ─────────────────────────────────────────────────────────
function CaseStudyResult({ q, ans }: { q: Question; ans: Answer }) {
  const subGrades = ans.subGrades ?? [];
  const totalScore = subGrades.reduce((s: number, g: any) => s + (g?.score ?? 0), 0);
  const totalMax   = (q.subquestions ?? []).reduce((s: number, sq: any) => s + (sq.points ?? 0), 0);

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-purple-400">Case Study</p>
        <span className="text-sm font-bold text-purple-400">{totalScore}/{totalMax}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{q.context}</p>
      <div className="space-y-3">
        {(q.subquestions ?? []).map((subq: any, i: number) => {
          const grade = subGrades[i];
          const sc = grade?.score ?? 0;
          const mx = subq.points ?? 0;
          const ok = sc / mx >= 0.6;
          return (
            <div key={i} className={`rounded-lg border p-3 ${ok ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground">{subq.id} — {subq.question}</span>
                <span className={`text-xs font-bold ${ok ? "text-green-400" : "text-red-400"}`}>{sc}/{mx}</span>
              </div>
              {grade?.feedback && <p className="text-xs text-muted-foreground italic">{grade.feedback}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExamResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { exam, answers } = (location.state ?? {}) as { exam: Exam; answers: Answer[] };

  if (!exam || !answers) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No results found.</p>
          <button onClick={() => navigate("/exam/prompt")} className="text-primary underline text-sm">Take an exam</button>
        </div>
      </div>
    );
  }

  // ── Compute overall score ────────────────────────────────────────────────
  let earned = 0, total = 0;
  for (const ans of answers) {
    const q = exam.questions.find(q => q.id === ans.questionId);
    if (!q) continue;
    if (q.type === "mcq") {
      total += 1; if (ans.answer === q.correct) earned += 1;
    } else if (q.type === "truefalse") {
      total += 1; if (ans.answer === q.correct) earned += 1;
    } else if (q.type === "problem") {
      const max = ans.grade?.max_score ?? 10;
      total += max; earned += ans.grade?.score ?? 0;
    } else if (q.type === "casestudy") {
      const subGrades = ans.subGrades ?? [];
      for (let i = 0; i < (q.subquestions?.length ?? 0); i++) {
        const pts = q.subquestions![i].points ?? 0;
        total += pts; earned += subGrades[i]?.score ?? 0;
      }
    }
  }
  const pct = total > 0 ? (earned / total) * 100 : 0;
  const grade = pct >= 85 ? "Excellent" : pct >= 70 ? "Good" : pct >= 50 ? "Average" : "Needs Improvement";
  const gradeColor = pct >= 85 ? "text-green-400" : pct >= 70 ? "text-blue-400" : pct >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />

      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-10 pb-24">

        {/* Score header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <ScoreRing pct={pct} />
          <h1 className="text-2xl font-bold mt-4 mb-1">{exam.title}</h1>
          <p className={`text-lg font-semibold ${gradeColor}`}>{grade}</p>
          <p className="text-sm text-muted-foreground mt-1">{earned.toFixed(1)} / {total} points · {exam.difficulty}</p>

          {/* Stats row */}
          <div className="flex justify-center gap-6 mt-5">
            {[
              { label: "MCQ", val: answers.filter(a => a.type === "mcq" && a.answer === exam.questions.find(q => q.id === a.questionId)?.correct).length + "/" + answers.filter(a => a.type === "mcq").length },
              { label: "True/False", val: answers.filter(a => a.type === "truefalse" && a.answer === exam.questions.find(q => q.id === a.questionId)?.correct).length + "/" + answers.filter(a => a.type === "truefalse").length },
              { label: "Open", val: answers.filter(a => a.type === "problem" || a.type === "casestudy").length },
            ].filter(s => !s.val.toString().startsWith("0/0") && s.val !== 0).map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-lg font-bold">{s.val}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Detailed review */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Detailed Review</h2>
          </div>
          <div className="space-y-3">
            {answers.map((ans, i) => {
              const q = exam.questions.find(q => q.id === ans.questionId);
              if (!q) return null;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
                  {q.type === "mcq"        && <MCQResult       q={q} ans={ans} />}
                  {q.type === "truefalse"  && <TFResult        q={q} ans={ans} />}
                  {q.type === "problem"    && <ProblemResult   q={q} ans={ans} />}
                  {q.type === "casestudy" && <CaseStudyResult q={q} ans={ans} />}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={() => navigate("/exam/prompt")}
            className="flex-1 py-3 rounded-xl border border-border bg-card text-sm font-medium hover:border-primary/30 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> New Exam
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" /> Dashboard
          </button>
        </div>

      </div>
    </div>
  );
}
