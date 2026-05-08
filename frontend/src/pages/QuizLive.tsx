import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Trophy, X, Wifi, WifiOff } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";

const API = "http://127.0.0.1:8000";

interface Participant {
  user_id: string;
  name: string;
  score: number | null;
  submitted: boolean;
}

interface LiveState {
  session_id: string;
  room_code: string;
  leaderboard: Participant[];
  connected: boolean;
  status: "waiting" | "active" | "closed";
}

export default function QuizLive() {
  const location = useLocation();
  const navigate  = useNavigate();
  const { toast } = useToast();
  const { session_id, room_code } = (location.state ?? {}) as { session_id?: string; room_code?: string };

  const [live, setLive] = useState<LiveState>({
    session_id: session_id ?? "",
    room_code:  room_code  ?? "",
    leaderboard: [],
    connected: false,
    status: "waiting",
  });
  const [closing, setClosing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!session_id) return;
    const wsUrl = `ws://127.0.0.1:8000/quiz/sessions/${session_id}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen  = () => setLive(p => ({ ...p, connected: true }));
    ws.onclose = () => setLive(p => ({ ...p, connected: false }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.leaderboard) setLive(p => ({ ...p, leaderboard: msg.leaderboard }));
        if (msg.event === "session_closed") setLive(p => ({ ...p, status: "closed" }));
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [session_id]);

  const handleClose = async () => {
    if (!confirm("End the session? Students will be notified.")) return;
    setClosing(true);
    const res = await fetch(`${API}/quiz/sessions/${session_id}/close`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    if (res.ok) {
      toast({ title: "Session ended" });
      navigate("/generate/quiz");
    } else toast({ title: "Failed to close session", variant: "destructive" });
    setClosing(false);
  };

  if (!session_id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No active session. Go generate a quiz first.</p>
      </div>
    );
  }

  const submitted = live.leaderboard.filter(p => p.submitted).length;
  const total     = live.leaderboard.length;

  return (
    <div className="min-h-screen bg-background p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Quiz Session</h1>
          <div className="flex items-center gap-2 mt-1">
            {live.connected
              ? <Wifi className="w-4 h-4 text-emerald-400" />
              : <WifiOff className="w-4 h-4 text-red-400" />}
            <span className="text-sm text-muted-foreground">{live.connected ? "Connected" : "Reconnecting…"}</span>
          </div>
        </div>
        <button onClick={handleClose} disabled={closing}
          className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50">
          <X className="w-4 h-4" />
          {closing ? "Closing…" : "End Session"}
        </button>
      </div>

      {/* Room code card */}
      <div className="rounded-3xl border border-primary/30 bg-primary/5 p-8 text-center">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2">Room Code</p>
        <p className="text-7xl font-black tracking-[0.3em] text-primary">{live.room_code}</p>
        <p className="text-sm text-muted-foreground mt-3">Share this code with your students</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-5 text-center">
          <p className="text-3xl font-bold text-primary">{total}</p>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Participants</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-5 text-center">
          <p className="text-3xl font-bold text-emerald-400">{submitted}</p>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Submitted</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-5 text-center">
          <p className="text-3xl font-bold text-amber-400">{total - submitted}</p>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Pending</p>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h2 className="font-semibold text-sm">Live Leaderboard</h2>
          <span className="ml-auto text-xs text-muted-foreground">{submitted}/{total} submitted</span>
        </div>
        <div className="divide-y divide-border/40">
          {live.leaderboard.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Users className="w-8 h-8 opacity-40" />
              <p className="text-sm">Waiting for students to join…</p>
            </div>
          )}
          <AnimatePresence>
            {live.leaderboard.map((p, i) => (
              <motion.div
                key={p.user_id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 px-5 py-3"
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? "bg-amber-400/20 text-amber-400"
                  : i === 1 ? "bg-gray-400/20 text-gray-400"
                  : i === 2 ? "bg-orange-400/20 text-orange-400"
                  : "bg-secondary/40 text-muted-foreground"
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                </div>
                {p.submitted ? (
                  <span className={`text-sm font-bold ${
                    (p.score ?? 0) >= 80 ? "text-emerald-400"
                    : (p.score ?? 0) >= 50 ? "text-amber-400"
                    : "text-red-400"
                  }`}>{p.score}%</span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">answering…</span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
