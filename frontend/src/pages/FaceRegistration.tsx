import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, RotateCcw, Loader2, ArrowLeft, ArrowRight, ArrowUp, Dot } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const API = "http://127.0.0.1:8000";

const STEPS = [
  { id: "center", hud: "LOOK STRAIGHT",  label: "Look straight at the camera", hint: "Face the camera directly", Icon: Dot        },
  { id: "left",   hud: "TURN LEFT",      label: "Turn your head slightly LEFT",  hint: "Small turn — ~15°",    Icon: ArrowLeft  },
  { id: "right",  hud: "TURN RIGHT",     label: "Turn your head slightly RIGHT", hint: "Small turn — ~15°",    Icon: ArrowRight },
  { id: "up",     hud: "TILT UP",        label: "Tilt your head slightly UP",    hint: "Chin up a little",     Icon: ArrowUp    },
] as const;

type Phase = "intro" | "capturing" | "processing" | "done" | "error";

const HOLD_NEEDED = 2;
const PERIMETER   = 2000;

// Oval geometry in the 1280×720 viewBox
const OX = 640, OY = 360, ORX = 220, ORY = 290;
const BW = 48; // bracket arm length

export default function FaceRegistration() {
  const { toast }  = useToast();
  const navigate   = useNavigate();

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const framesRef  = useRef<string[]>([]);
  const cancelRef  = useRef(false);

  const [phase,      setPhase]      = useState<Phase>("intro");
  const [stepIdx,    setStepIdx]    = useState(0);
  const [holdCount,  setHoldCount]  = useState(0);
  const [detected,   setDetected]   = useState(false);
  const [angle,      setAngle]      = useState("none");
  const [feedback,   setFeedback]   = useState("");
  const [alreadyReg, setAlreadyReg] = useState(false);
  const [flash,      setFlash]      = useState(false);
  const [sessionHex] = useState(() => Math.random().toString(16).slice(2, 10).toUpperCase());

  useEffect(() => {
    fetch(`${API}/student/face/status`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setAlreadyReg(d.registered))
      .catch(() => {});
  }, []);

  const stopCamera = useCallback(() => {
    cancelRef.current = true;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const captureRawFrame = useCallback((): string | null => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }, []);

  const startCamera = async () => {
    framesRef.current = [];
    cancelRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: "Camera not supported", description: "Use Chrome or Firefox on localhost.", variant: "destructive" });
      return;
    }

    let stream: MediaStream | null = null;
    for (const c of [
      { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } },
      { video: true },
    ]) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
      catch { /* try next */ }
    }

    if (!stream) {
      let errMsg = "Could not access webcam";
      try { await navigator.mediaDevices.getUserMedia({ video: true }); }
      catch (err: any) {
        errMsg =
          err?.name === "NotAllowedError"  ? "Camera permission denied — allow access in browser settings" :
          err?.name === "NotFoundError"    ? "No camera found on this device" :
          err?.name === "NotReadableError" ? "Camera is already in use by another application" :
          `Camera error: ${err?.name} — ${err?.message}`;
      }
      toast({ title: "Camera error", description: errMsg, variant: "destructive" });
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current!;
    video.srcObject = stream;
    try { await video.play(); } catch { /* ok */ }

    setStepIdx(0);
    setHoldCount(0);
    setDetected(false);
    setAngle("none");
    setFeedback("Position your face in the oval");
    setPhase("capturing");
  };

  useEffect(() => {
    if (phase !== "capturing") return;
    cancelRef.current = false;

    const currentStep = STEPS[stepIdx];
    let holdCounter   = 0;

    const poll = async () => {
      if (cancelRef.current) return;
      const frame = captureRawFrame();
      if (!frame) return;

      try {
        const res  = await fetch(`${API}/student/face/detect`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ frame }),
        });
        if (cancelRef.current) return;
        const data = await res.json();

        setDetected(data.detected);
        setAngle(data.angle ?? "none");

        if (!data.detected) {
          holdCounter = 0;
          setHoldCount(0);
          setFeedback(
            data.reason === "too_small"      ? "Come closer to the camera" :
            data.reason === "blurry"         ? "Hold still — too blurry"   :
            data.reason === "bad_lighting"   ? "Improve lighting"           :
            data.reason === "multiple_faces" ? "Only one face please"       :
            "Position your face in the oval"
          );
          return;
        }

        if (data.angle === currentStep.id) {
          holdCounter++;
          setHoldCount(holdCounter);
          setFeedback(holdCounter >= HOLD_NEEDED ? "✓ Captured!" : "Hold still…");

          if (holdCounter >= HOLD_NEEDED) {
            framesRef.current = [...framesRef.current, frame];
            holdCounter = 0;
            setHoldCount(0);
            setFlash(true);
            setTimeout(() => setFlash(false), 350);
            if (stepIdx >= STEPS.length - 1) {
              cancelRef.current = true;
              stopCamera();
              setPhase("processing");
            } else {
              setStepIdx(prev => prev + 1);
            }
          }
        } else {
          holdCounter = 0;
          setHoldCount(0);
          setFeedback(currentStep.label);
        }
      } catch { /* network blip */ }
    };

    const id = window.setInterval(poll, 800);
    return () => clearInterval(id);
  }, [phase, stepIdx, captureRawFrame, stopCamera]);

  useEffect(() => {
    if (phase !== "processing") return;
    (async () => {
      try {
        const res = await fetch(`${API}/student/face/register`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ frames: framesRef.current }),
        });
        if (!res.ok) throw new Error(await res.text());
        setPhase("done");
      } catch (e: any) {
        toast({ title: "Registration failed", description: e.message, variant: "destructive" });
        setPhase("error");
      }
    })();
  }, [phase, toast]);

  const reset = () => {
    stopCamera();
    cancelRef.current = false;
    framesRef.current = [];
    setPhase("intro");
    setStepIdx(0);
    setHoldCount(0);
    setDetected(false);
    setAngle("none");
    setFeedback("");
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  const currentStep  = STEPS[stepIdx];
  const match        = detected && angle === currentStep.id;
  const ovalStroke   = !detected ? "#1e3a4a" : match ? "#06b6d4" : "#f59e0b";
  const holdFrac     = Math.min(holdCount / HOLD_NEEDED, 1);

  // HUD status label
  const hudStatus =
    !detected           ? "[ SCANNING ]"    :
    match && holdFrac >= 1 ? "[ CAPTURED ]"  :
    match               ? "[ HOLD STILL ]"  :
    "[ ADJUST POSE ]";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Capturing phase — always in DOM so videoRef is always valid ── */}
      <div className={`flex-1 flex flex-col ${phase === "capturing" ? "" : "hidden"}`}>

        {/* HUD top bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-black border-b border-cyan-500/20 shrink-0">
          <div>
            <div className="text-[9px] font-mono text-cyan-500/40 uppercase tracking-[0.25em]">Biometric Identification System</div>
            <div className="text-[11px] font-mono text-cyan-400/70 mt-0.5">SESSION · {sessionHex}</div>
          </div>

          {/* Step progress — horizontal bars */}
          <div className="flex items-center gap-4">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex flex-col items-center gap-1.5">
                <div className={`w-10 h-[2px] rounded-full transition-all duration-500 ${
                  i < stepIdx    ? "bg-cyan-400"
                  : i === stepIdx ? "bg-cyan-400 shadow-[0_0_10px_#06b6d4]"
                  : "bg-gray-800"
                }`} />
                <div className={`text-[8px] font-mono tracking-widest transition-colors duration-300 ${
                  i < stepIdx    ? "text-cyan-400"
                  : i === stepIdx ? "text-cyan-300"
                  : "text-gray-700"
                }`}>{String(i + 1).padStart(2, "0")}</div>
              </div>
            ))}
          </div>

          <button
            onClick={reset}
            className="text-[10px] font-mono text-gray-700 hover:text-red-500 transition-colors uppercase tracking-widest"
          >
            [ABORT]
          </button>
        </div>

        {/* Camera area */}
        <div className="flex-1 relative bg-black overflow-hidden min-h-0">

          {/* Subtle cyan grid */}
          <div
            className="absolute inset-0 opacity-[0.055] pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(6,182,212,1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(6,182,212,1) 1px, transparent 1px)
              `,
              backgroundSize: "60px 60px",
            }}
          />

          {/* Mirrored live video */}
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover [transform:scaleX(-1)]"
          />

          {/* Capture flash */}
          <AnimatePresence>
            {flash && (
              <motion.div
                className="absolute inset-0 pointer-events-none z-30"
                style={{ background: "radial-gradient(ellipse 60% 70% at 50% 50%, rgba(6,182,212,0.45) 0%, transparent 75%)" }}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              />
            )}
          </AnimatePresence>

          {/* SVG overlay — oval, scan line, brackets, HUD text */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 1280 720"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <mask id="bio-oval-mask">
                <rect width="1280" height="720" fill="white" />
                <ellipse cx={OX} cy={OY} rx={ORX - 1} ry={ORY - 1} fill="black" />
              </mask>
              <clipPath id="bio-oval-clip">
                <ellipse cx={OX} cy={OY} rx={ORX - 1} ry={ORY - 1} />
              </clipPath>
              <linearGradient id="bio-scanGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="transparent" />
                <stop offset="30%"  stopColor="#06b6d4" stopOpacity="0.65" />
                <stop offset="70%"  stopColor="#06b6d4" stopOpacity="0.65" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
              <filter id="bio-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Dark vignette outside oval */}
            <rect width="1280" height="720" fill="rgba(0,0,0,0.62)" mask="url(#bio-oval-mask)" />

            {/* Soft glow fill inside oval when face detected */}
            {detected && (
              <ellipse
                cx={OX} cy={OY} rx={ORX - 1} ry={ORY - 1}
                fill={match ? "rgba(6,182,212,0.07)" : "rgba(245,158,11,0.05)"}
                style={{ transition: "fill 0.4s" }}
              />
            )}

            {/* Animated scan line (clipped inside oval) */}
            <motion.rect
              x={OX - ORX + 2} width={(ORX - 2) * 2} height={3} rx={1.5}
              fill="url(#bio-scanGrad)"
              clipPath="url(#bio-oval-clip)"
              animate={{ y: [OY - ORY + 10, OY + ORY - 10] }}
              transition={{ duration: 2.4, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
            />

            {/* Oval border */}
            <ellipse
              cx={OX} cy={OY} rx={ORX} ry={ORY}
              stroke={ovalStroke}
              strokeWidth={detected ? 2.5 : 1.5}
              fill="none"
              filter={detected ? "url(#bio-glow)" : undefined}
              style={{ transition: "stroke 0.4s, stroke-width 0.3s" }}
            />

            {/* Progress arc */}
            {holdFrac > 0 && (
              <ellipse
                cx={OX} cy={OY} rx={ORX} ry={ORY}
                stroke="#06b6d4"
                strokeWidth="5"
                fill="none"
                strokeDasharray={`${holdFrac * PERIMETER} ${PERIMETER}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${OX} ${OY})`}
                filter="url(#bio-glow)"
                style={{ transition: "stroke-dasharray 0.4s" }}
              />
            )}

            {/* Pulsing ring when pose matches */}
            {match && (
              <motion.ellipse
                cx={OX} cy={OY}
                rx={ORX} ry={ORY}
                stroke="#06b6d4"
                strokeWidth={1.5}
                fill="none"
                animate={{
                  rx: [ORX, ORX + 28],
                  ry: [ORY, ORY + 36],
                  opacity: [0.65, 0],
                }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}

            {/* Corner brackets */}
            {([
              `M ${OX - ORX + BW},${OY - ORY} L ${OX - ORX},${OY - ORY} L ${OX - ORX},${OY - ORY + BW}`,
              `M ${OX + ORX - BW},${OY - ORY} L ${OX + ORX},${OY - ORY} L ${OX + ORX},${OY - ORY + BW}`,
              `M ${OX - ORX + BW},${OY + ORY} L ${OX - ORX},${OY + ORY} L ${OX - ORX},${OY + ORY - BW}`,
              `M ${OX + ORX - BW},${OY + ORY} L ${OX + ORX},${OY + ORY} L ${OX + ORX},${OY + ORY - BW}`,
            ] as const).map((d, i) => (
              <path
                key={i} d={d}
                stroke="#06b6d4" strokeWidth="2.5" fill="none" strokeLinecap="round"
                opacity={detected ? 1 : 0.3}
                filter={detected ? "url(#bio-glow)" : undefined}
                style={{ transition: "opacity 0.4s" }}
              />
            ))}

            {/* HUD text readouts near the oval */}
            <text x={OX - ORX} y={OY - ORY - 12} fontFamily="monospace" fontSize="10" fill="#06b6d4" opacity="0.55">LIVE·FEED</text>
            <text x={OX + ORX} y={OY - ORY - 12} fontFamily="monospace" fontSize="10" fill="#06b6d4" opacity="0.55" textAnchor="end">
              {`STEP·${stepIdx + 1}/${STEPS.length}`}
            </text>
            <text
              x={OX - ORX} y={OY + ORY + 20}
              fontFamily="monospace" fontSize="10"
              fill={detected ? "#06b6d4" : "#374151"}
              style={{ transition: "fill 0.4s" }}
            >
              {detected ? "FACE·DETECTED" : "SCANNING···"}
            </text>
            <text
              x={OX + ORX} y={OY + ORY + 20}
              fontFamily="monospace" fontSize="10"
              fill={match ? "#06b6d4" : "#f59e0b"}
              textAnchor="end"
              style={{ transition: "fill 0.3s" }}
            >
              {`ANGLE·${angle.toUpperCase()}`}
            </text>
          </svg>

          {/* Bottom HUD overlay */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/92 via-black/40 to-transparent pt-20 pb-6 px-8 flex items-end justify-between z-10">
            <div>
              <div className="text-[9px] font-mono text-cyan-500/45 uppercase tracking-[0.22em] mb-1.5">Target Pose</div>
              <div className="flex items-center gap-2.5">
                {(() => { const { Icon } = currentStep; return <Icon className="w-5 h-5 text-cyan-400" />; })()}
                <span className="text-xl font-mono font-bold text-white tracking-[0.15em]">
                  {currentStep.hud}
                </span>
              </div>
              <div className="text-[11px] font-mono text-gray-500 mt-1 tracking-wide">{currentStep.hint}</div>
            </div>

            <div className={`px-5 py-2.5 font-mono text-sm font-bold tracking-widest border transition-all duration-300 ${
              !detected
                ? "border-gray-800 bg-black/70 text-gray-600"
                : match && holdFrac >= 1
                ? "border-cyan-500/70 bg-cyan-950/60 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                : match
                ? "border-cyan-600/40 bg-cyan-950/40 text-cyan-500"
                : "border-amber-500/50 bg-amber-950/40 text-amber-400"
            }`}>
              {hudStatus}
            </div>
          </div>
        </div>
      </div>

      {/* ── Non-capturing phases ── */}
      <AnimatePresence mode="wait">

        {phase === "intro" && (
          <motion.div key="intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center px-4 py-10">
            <div className="max-w-md w-full space-y-6">
              <div className="text-center space-y-3">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-5xl">👤</div>
                <h1 className="text-3xl font-bold">Register Your Face</h1>
                <p className="text-muted-foreground text-sm">
                  {alreadyReg
                    ? "Your face is already registered. You can update it anytime."
                    : "Your teacher's system will mark your attendance automatically once you register."}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">4 quick poses · ~30 seconds</p>
                <div className="space-y-3">
                  {STEPS.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                      <div>
                        <p className="text-sm font-medium">{s.label}</p>
                        <p className="text-[11px] text-muted-foreground">{s.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                Make sure you are in a well-lit room and your face is clearly visible.
              </div>

              <Button onClick={startCamera} className="w-full h-14 text-lg font-bold rounded-2xl">
                {alreadyReg ? "Update Face Registration" : "Start Registration"}
              </Button>
              <button
                onClick={() => navigate("/dashboard")}
                className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {phase === "processing" && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-14 h-14 animate-spin text-primary" />
            <p className="text-2xl font-bold">Processing your face…</p>
            <p className="text-sm text-muted-foreground">Computing encoding from {STEPS.length} angles</p>
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            >
              <CheckCircle2 className="w-24 h-24 text-emerald-500" />
            </motion.div>
            <div className="text-center">
              <p className="text-3xl font-bold">Face Registered!</p>
              <p className="text-muted-foreground mt-2 text-sm max-w-sm">
                Your teacher's attendance system will now recognize you automatically.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 w-full max-w-sm">
              <Button onClick={() => navigate("/dashboard")} className="w-full h-12 rounded-2xl">Back to Dashboard</Button>
              <button onClick={reset} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <RotateCcw className="w-3.5 h-3.5" /> Register again
              </button>
            </div>
          </motion.div>
        )}

        {phase === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center gap-5 px-4">
            <p className="text-5xl">😕</p>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">Registration failed</p>
              <p className="text-sm text-muted-foreground mt-1">
                Not enough clear frames captured. Try again in better lighting.
              </p>
            </div>
            <Button onClick={reset} className="h-12 px-8 rounded-2xl">Try again</Button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
