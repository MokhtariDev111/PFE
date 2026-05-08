import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Trophy, Check, Loader2, ArrowRight } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";

const API = "http://127.0.0.1:8000";

interface PublicQuestion {
  question: string;
  format: "mcq" | "true_false" | "short_answer";
  concept: string;
  options?: string[];
  difficulty: "easy" | "medium" | "hard";
}

interface LeaderboardEntry {
  user_id: string;
  name: string;
  score: number | null;
  submitted: boolean;
}

interface SubmitResult {
  score: number;
  total: number;
  correct: number;
}

type Phase = "join" | "quiz" | "submitted";

const DIFF_BAR: Record<string, string> = {
  easy:   "bg-emerald-500",
  medium: "bg-amber-500",
  hard:   "bg-red-500",
};

const DIFF_TAG: Record<string, string> = {
  easy:   "text-emerald-400 border-emerald-500/25",
  medium: "text-amber-400   border-amber-500/25",
  hard:   "text-red-400     border-red-500/25",
};

// ── Question answer card ──────────────────────────────────────────────────────

function QuestionAnswerCard({ q, index, answer, onAnswer }: {
  q: PublicQuestion;
  index: number;
  answer?: string;
  onAnswer: (val: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-2xl border border-border/60 bg-card overflow-hidden"
    >
      <div className={`h-1 w-full ${DIFF_BAR[q.difficulty] ?? "bg-primary"}`} />
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-muted-foreground">Q{index + 1}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${DIFF_TAG[q.difficulty]}`}>
            {q.difficulty}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">{q.concept}</span>
        </div>
        <p className="font-medium leading-relaxed">{q.question}</p>

        {/* MCQ / True-False */}
        {q.options && q.options.length > 0 && (
          <div className="space-y-2">
            {q.options.map(opt => (
              <button
                key={opt}
                onClick={() => onAnswer(opt)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                  answer === opt
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary/30"
                }`}
              >
                {answer === opt && <Check className="inline w-3.5 h-3.5 mr-2 mb-0.5" />}
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Short answer */}
        {q.format === "short_answer" && (
          <input
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-secondary/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Type your answer…"
            value={answer ?? ""}
            onChange={e => onAnswer(e.target.value)}
          />
        )}
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuizSession() {
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("join");
  const [roomInput, setRoomInput] = useState("");
  const [joining, setJoining] = useState(false);

  const [sessionId, setSessionId] = useState("");
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  const handleJoin = async () => {
    const code = roomInput.trim().toUpperCase();
    if (code.length < 4) {
      toast({ title: "Enter a valid room code", variant: "destructive" });
      return;
    }
    setJoining(true);
    try {
      const res = await fetch(`${API}/quiz/sessions/${code}/join`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).detail ?? "Failed to join session");
      }
      const data = await res.json();
      const sid: string = data.session_id;
      const qs: PublicQuestion[] = data.questions ?? [];

      setSessionId(sid);
      setQuestions(qs);
      setPhase("quiz");

      // Connect WebSocket to receive leaderboard updates
      const ws = new WebSocket(`ws://127.0.0.1:8000/quiz/sessions/${sid}/ws`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.leaderboard) setLeaderboard(msg.leaderboard);
          if (msg.event === "session_closed")
            toast({ title: "Session has been closed by the teacher" });
        } catch { /* ignore */ }
      };
    } catch (e: any) {
      toast({ title: "Could not join", description: e.message, variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const handleSubmit = async () => {
    if (!confirm("Submit your answers? You cannot change them after.")) return;
    setSubmitting(true);
    try {
      const answersMap: Record<string, string> = {};
      Object.entries(answers).forEach(([k, v]) => { answersMap[k] = v; });

      const res = await fetch(`${API}/quiz/sessions/${sessionId}/submit`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersMap }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: SubmitResult = await res.json();
      setResult(data);
      setPhase("submitted");
    } catch (e: any) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <AnimatePresence mode="wait">

        {/* ── JOIN ── */}
        {phase === "join" && (
          <motion.div key="join"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="max-w-md mx-auto pt-20"
          >
            <div className="rounded-3xl border border-border/60 bg-card p-8 space-y-6 shadow-xl">
              <div className="text-center space-y-1">
                <Trophy className="w-10 h-10 text-primary mx-auto mb-3" />
                <h1 className="text-2xl font-bold">Join Quiz Session</h1>
                <p className="text-sm text-muted-foreground">Enter the room code from your teacher</p>
              </div>
              <div className="space-y-3">
                <input
                  className="w-full text-center text-3xl font-black tracking-[0.4em] bg-secondary/40 border border-border rounded-2xl py-5 px-6 focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase placeholder:text-muted-foreground/30 placeholder:font-normal placeholder:tracking-normal placeholder:text-lg"
                  placeholder="ABC123"
                  value={roomInput}
                  onChange={e => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                  maxLength={6}
                  autoFocus
                />
                <Button
                  onClick={handleJoin}
                  disabled={joining || roomInput.trim().length < 4}
                  className="w-full"
                  size="lg"
                >
                  {joining
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><ArrowRight className="w-4 h-4 mr-2" />Join Session</>}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── QUIZ ── */}
        {phase === "quiz" && (
          <motion.div key="quiz"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="max-w-2xl mx-auto space-y-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Quiz Time</h2>
                <p className="text-sm text-muted-foreground">Answer all questions then submit</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-primary">{answeredCount}/{questions.length}</p>
                <p className="text-xs text-muted-foreground">answered</p>
              </div>
            </div>

            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                animate={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 30 }}
              />
            </div>

            <div className="space-y-4">
              {questions.map((q, i) => (
                <QuestionAnswerCard
                  key={i}
                  q={q}
                  index={i}
                  answer={answers[i]}
                  onAnswer={val => setAnswers(prev => ({ ...prev, [i]: val }))}
                />
              ))}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting || answeredCount < questions.length}
              className="w-full"
              size="lg"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Submitting…</>
                : answeredCount < questions.length
                ? `Answer all questions (${questions.length - answeredCount} remaining)`
                : <><Trophy className="w-4 h-4 mr-2" />Submit Answers</>}
            </Button>
          </motion.div>
        )}

        {/* ── RESULTS ── */}
        {phase === "submitted" && result && (
          <motion.div key="results"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="max-w-xl mx-auto space-y-6 pt-8"
          >
            <div className="rounded-3xl border border-primary/30 bg-card p-8 text-center space-y-3"
              style={{ boxShadow: "0 0 32px hsl(var(--primary)/0.12)" }}
            >
              <Trophy className="w-12 h-12 text-primary mx-auto" />
              <p className={`text-6xl font-black ${
                result.score >= 80 ? "text-emerald-400"
                : result.score >= 50 ? "text-amber-400"
                : "text-red-400"
              }`}>{result.score}%</p>
              <p className="text-muted-foreground text-sm">{result.correct} / {result.total} correct</p>
              <p className="font-semibold text-lg">
                {result.score >= 90 ? "🏆 Excellent!"
                : result.score >= 70 ? "👍 Great work!"
                : result.score >= 50 ? "📚 Keep studying"
                : "💪 Keep practicing"}
              </p>
            </div>

            {leaderboard.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Live Leaderboard</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {leaderboard.filter(p => p.submitted).length}/{leaderboard.length} submitted
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {leaderboard.map((p, i) => (
                    <div key={p.user_id} className="flex items-center gap-3 px-5 py-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i === 0 ? "bg-amber-400/20 text-amber-400"
                        : i === 1 ? "bg-gray-400/20 text-gray-400"
                        : i === 2 ? "bg-orange-400/20 text-orange-400"
                        : "bg-secondary/40 text-muted-foreground"
                      }`}>{i + 1}</span>
                      <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
                      {p.submitted
                        ? <span className={`text-sm font-bold ${
                            (p.score ?? 0) >= 80 ? "text-emerald-400"
                            : (p.score ?? 0) >= 50 ? "text-amber-400"
                            : "text-red-400"
                          }`}>{p.score}%</span>
                        : <span className="text-xs text-muted-foreground italic">answering…</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
