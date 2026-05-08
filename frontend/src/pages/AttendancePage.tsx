import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CheckCircle2, StopCircle, Wifi, WifiOff, Users, BookOpen } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";

const API = "http://127.0.0.1:8000";

interface EnrolledStudent { user_id: string; name: string; email: string; }

interface TimetableEntry {
  class_id: string; subject: string; day: string;
  start_time: string; end_time: string;
  classroom?: string; year?: string;
  enrolled_students?: EnrolledStudent[];
}

const DAY_ORDER: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6,
};

function sortClasses(list: TimetableEntry[]): TimetableEntry[] {
  return [...list].sort((a, b) => {
    const dayDiff = (DAY_ORDER[a.day] ?? 9) - (DAY_ORDER[b.day] ?? 9);
    if (dayDiff !== 0) return dayDiff;
    return a.start_time.localeCompare(b.start_time);
  });
}

const DAY_ABBR: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
  Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

// Rainbow-spaced: each hue is ~45° apart so no two look similar
const SUBJECT_PALETTE = [
  { bg: "bg-rose-500/20",    text: "text-rose-400",    border: "border-rose-500/50"    }, // red
  { bg: "bg-orange-500/20",  text: "text-orange-400",  border: "border-orange-500/50"  }, // orange
  { bg: "bg-amber-500/20",   text: "text-amber-400",   border: "border-amber-500/50"   }, // yellow
  { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/50" }, // green
  { bg: "bg-teal-500/20",    text: "text-teal-400",    border: "border-teal-500/50"    }, // teal
  { bg: "bg-blue-500/20",    text: "text-blue-400",    border: "border-blue-500/50"    }, // blue
  { bg: "bg-violet-500/20",  text: "text-violet-400",  border: "border-violet-500/50"  }, // purple
  { bg: "bg-fuchsia-500/20", text: "text-fuchsia-400", border: "border-fuchsia-500/50" }, // pink
];


const TODAY_NAME = new Date().toLocaleDateString("en-US", { weekday: "long" });

interface AttendanceRecord { name: string; confidence: number; marked_at: string; }

interface SessionInfo {
  session_id: string; subject: string;
  status: "active" | "closed"; records: AttendanceRecord[];
}

type Phase = "idle" | "active";

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-4xl font-bold tracking-tight text-primary">
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

export default function AttendancePage() {
  const { toast } = useToast();

  const [classes, setClasses]         = useState<TimetableEntry[]>([]);
  const [selectedClass, setSelected]  = useState<string>("");
  const [cameraIndex, setCameraIndex] = useState(0);
  const [starting, setStarting]       = useState(false);
  const [stopping, setStopping]       = useState(false);
  const [showAllDays, setShowAllDays] = useState(true);

  const [phase, setPhase]       = useState<Phase>("idle");
  const [session, setSession]   = useState<SessionInfo | null>(null);
  const [records, setRecords]   = useState<AttendanceRecord[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch(`${API}/timetable/my-classes`, { headers: authHeaders() })
      .then(r => r.json())
      .then((data: TimetableEntry[]) => {
        setClasses(data);
        if (data.length > 0) setSelected(data[0].class_id);
      })
      .catch(() => toast({ title: "Failed to load classes", variant: "destructive" }));
  }, []);

  const handleStart = async () => {
    const cls = classes.find(c => c.class_id === selectedClass);
    if (!cls) { toast({ title: "Select a class first", variant: "destructive" }); return; }
    setStarting(true);
    try {
      const res = await fetch(`${API}/attendance/sessions`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: cls.class_id,
          subject: cls.subject,
          camera_index: cameraIndex,
          local_date: (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          })(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: SessionInfo = await res.json();
      setSession(data);
      setRecords([]);
      setPhase("active");

      const ws = new WebSocket(`ws://127.0.0.1:8000/attendance/sessions/${data.session_id}/live`);
      wsRef.current = ws;
      ws.onopen    = () => setConnected(true);
      ws.onclose   = () => setConnected(false);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === "student_marked") {
            setRecords(prev => prev.some(r => r.name === msg.name) ? prev
              : [{ name: msg.name, confidence: msg.confidence, marked_at: new Date().toISOString() }, ...prev]);
          }
          if (msg.event === "session_closed") { setPhase("idle"); setConnected(false); }
        } catch { /* ignore */ }
      };
    } catch (e: any) {
      toast({ title: "Failed to start session", description: e.message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!session) return;
    setStopping(true);
    try {
      const res = await fetch(`${API}/attendance/sessions/${session.session_id}/close`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      wsRef.current?.close();
      setPhase("idle");
      setConnected(false);
      toast({ title: "Session closed", description: `${records.length} students marked present` });
    } catch (e: any) {
      toast({ title: "Failed to stop session", description: e.message, variant: "destructive" });
    } finally {
      setStopping(false);
    }
  };

  // Close the session if teacher closes/refreshes the tab mid-session
  useEffect(() => {
    if (phase !== "active" || !session) return;
    const cleanup = () => {
      fetch(`${API}/attendance/sessions/${session.session_id}/close`, {
        method: "POST",
        headers: authHeaders(),
        keepalive: true,
      });
    };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, [phase, session]);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  const selectedCls = classes.find(c => c.class_id === selectedClass);

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">

        {/* ══ IDLE — full-screen setup ══ */}
        {phase === "idle" && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col px-8 py-10 max-w-5xl mx-auto space-y-8">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Mark Attendance</h1>
                  <p className="text-sm text-muted-foreground">AI face recognition · real-time</p>
                </div>
              </div>
              {/* Live clock */}
              <div className="text-right">
                <LiveClock />
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
            </div>

            {/* Class cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" />
                  {showAllDays ? "All Classes" : `Today · ${TODAY_NAME}`}
                </label>
                <button onClick={() => setShowAllDays(v => !v)}
                  className="text-[11px] font-medium text-primary hover:underline">
                  {showAllDays ? "Show today only" : "Show all days"}
                </button>
              </div>

              {(() => {
                // Assign one palette color per unique classroom+year — sorted for stability
                const classColorMap: Record<string, typeof SUBJECT_PALETTE[0]> = {};
                const uniqueKeys = Array.from(new Set(classes.map(c => `${c.classroom ?? ""}||${c.year ?? ""}`)));
                uniqueKeys.sort();
                uniqueKeys.forEach((k, i) => { classColorMap[k] = SUBJECT_PALETTE[i % SUBJECT_PALETTE.length]; });
                const getColor = (c: TimetableEntry) =>
                  classColorMap[`${c.classroom ?? ""}||${c.year ?? ""}`] ?? SUBJECT_PALETTE[0];

                const filtered = sortClasses(
                  showAllDays ? classes : classes.filter(c => c.day === TODAY_NAME)
                );
                if (classes.length === 0)
                  return <p className="text-sm text-muted-foreground italic py-4">No classes assigned. Ask an admin to add you to the timetable.</p>;
                if (filtered.length === 0)
                  return (
                    <p className="text-sm text-muted-foreground italic py-4">
                      No classes scheduled for today ({TODAY_NAME}).{" "}
                      <button className="text-primary hover:underline" onClick={() => setShowAllDays(true)}>Show all days</button>
                    </p>
                  );
                return (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {filtered.map(cls => {
                      const count = (cls.enrolled_students ?? []).length;
                      const isSelected = selectedClass === cls.class_id;
                      const cs = getColor(cls);
                      const isToday = cls.day === TODAY_NAME;
                      return (
                        <button key={cls.class_id} onClick={() => setSelected(cls.class_id)}
                          className={`text-left rounded-2xl border-2 transition-all overflow-hidden ${
                            isSelected
                              ? `${cs.border} ${cs.bg} shadow-lg`
                              : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                          }`}>
                          <div className="flex">
                            {/* Subject-colored left strip */}
                            <div className={`flex flex-col items-center justify-center px-3 py-4 shrink-0 border-r gap-1 ${
                              isSelected ? "border-white/10 " + cs.bg : "border-border/50 " + cs.bg
                            }`}>
                              <span className={`text-[10px] font-bold uppercase tracking-widest ${cs.text}`}>
                                {DAY_ABBR[cls.day] ?? cls.day}
                              </span>
                              {!isToday && showAllDays && (
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" title="Not today" />
                              )}
                            </div>
                            {/* Details — right */}
                            <div className="px-4 py-3 min-w-0">
                              <p className="font-bold text-sm truncate">{cls.subject}</p>
                              {cls.classroom && (
                                <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                  {cls.classroom}{cls.year ? ` · ${cls.year}` : ""}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">{cls.start_time} – {cls.end_time}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {count} student{count !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Camera selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Camera</label>
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <button key={i} onClick={() => setCameraIndex(i)}
                    className={`px-5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                      cameraIndex === i
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/40"
                    }`}>
                    Camera {i}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Camera 0 = built-in webcam</p>
            </div>

            {/* Big start button */}
            <div className="flex-1 flex flex-col justify-end pb-4">
              <Button
                onClick={handleStart}
                disabled={starting || !selectedClass || classes.length === 0}
                className="w-full h-20 text-xl font-bold gap-3 rounded-2xl shadow-xl shadow-primary/20"
                size="lg"
              >
                <Camera className="w-7 h-7" />
                {starting ? "Starting session…" : "Start Attendance Session"}
              </Button>
              {selectedCls && (
                <p className="text-center text-sm text-muted-foreground mt-3">
                  {selectedCls.subject}{selectedCls.classroom ? ` · ${selectedCls.classroom}` : ""} · {selectedCls.day} {selectedCls.start_time}–{selectedCls.end_time}
                </p>
              )}
            </div>

          </motion.div>
        )}

        {/* ══ ACTIVE — side-by-side layout ══ */}
        {phase === "active" && session && (
          <motion.div key="active" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col px-6 py-6 gap-5">

            {/* Top bar */}
            <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <div>
                  <p className="font-bold">
                    {session.subject}
                    {selectedCls?.classroom && (
                      <span className="ml-2 text-sm font-normal text-primary">{selectedCls.classroom}</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {connected ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
                    <span className="text-xs text-muted-foreground">{connected ? "Live" : "Reconnecting…"}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <LiveClock />
                <Button variant="destructive" size="sm" onClick={handleStop} disabled={stopping} className="gap-1.5">
                  <StopCircle className="w-4 h-4" />
                  {stopping ? "Stopping…" : "Stop Session"}
                </Button>
              </div>
            </div>

            {/* Two-column: student list LEFT, camera RIGHT */}
            <div className="flex-1 grid grid-cols-[1fr_1.6fr] gap-5 min-h-0">

              {/* LEFT — student list */}
              <div className="flex flex-col gap-4 min-h-0">
                {/* Stats row */}
                {(() => {
                  const enrolled = selectedCls?.enrolled_students ?? [];
                  const presentNames = new Set(records.map(r => r.name.toLowerCase()));
                  const absentCount = enrolled.filter(s => !presentNames.has(s.name.toLowerCase())).length;
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Enrolled", value: enrolled.length, color: "text-primary" },
                        { label: "Present",  value: records.length,  color: "text-emerald-400" },
                        { label: "Absent",   value: absentCount,     color: "text-red-400" },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl border border-border/60 bg-card p-3 text-center">
                          <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Full student list — absent by default, flips to present on recognition */}
                {(() => {
                  const enrolled = selectedCls?.enrolled_students ?? [];
                  const recordMap = new Map(records.map(r => [r.name.toLowerCase(), r]));
                  // Present first, then absent alphabetically
                  const sorted = [...enrolled].sort((a, b) => {
                    const ap = recordMap.has(a.name.toLowerCase());
                    const bp = recordMap.has(b.name.toLowerCase());
                    if (ap !== bp) return ap ? -1 : 1;
                    return a.name.localeCompare(b.name);
                  });
                  return (
                    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col flex-1 min-h-0">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 shrink-0">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">Students</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          <span className="text-emerald-400 font-semibold">{records.length}</span>
                          <span className="mx-1">/</span>
                          {enrolled.length} present
                        </span>
                      </div>
                      <div className="overflow-y-auto flex-1">
                        {enrolled.length === 0 ? (
                          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                            <Users className="w-8 h-8 opacity-25" />
                            <p className="text-sm">No students enrolled</p>
                          </div>
                        ) : (
                          <AnimatePresence initial={false}>
                            {sorted.map(stu => {
                              const rec = recordMap.get(stu.name.toLowerCase());
                              const isPresent = !!rec;
                              return (
                                <motion.div key={stu.user_id} layout
                                  animate={{ backgroundColor: isPresent ? "rgba(16,185,129,0.06)" : "transparent" }}
                                  transition={{ duration: 0.4 }}
                                  className="flex items-center gap-3 px-4 py-3 border-b border-border/20 last:border-0">
                                  {/* Status icon */}
                                  {isPresent
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                    : <div className="w-4 h-4 rounded-full border-2 border-red-400/60 shrink-0" />
                                  }
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium truncate ${isPresent ? "" : "text-muted-foreground"}`}>
                                      {stu.name}
                                    </p>
                                    {isPresent && rec && (
                                      <p className="text-[10px] text-emerald-500/80">
                                        {new Date(rec.marked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        {rec.confidence > 0 && ` · ${rec.confidence.toFixed(0)}%`}
                                      </p>
                                    )}
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    isPresent
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : "bg-red-500/10 text-red-400"
                                  }`}>
                                    {isPresent ? "Present" : "Absent"}
                                  </span>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* RIGHT — live camera */}
              <div className="rounded-2xl overflow-hidden border border-border/60 bg-black relative flex items-center justify-center min-h-0">
                <img
                  src={`${API}/attendance/sessions/${session.session_id}/stream`}
                  alt="Live camera"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white font-medium backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </div>
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 text-[11px] text-white font-mono">
                  Camera {cameraIndex}
                </div>
              </div>

            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
