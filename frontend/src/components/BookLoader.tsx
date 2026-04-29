import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Status messages per backend step ─────────────────────────────────────────
const STEP_MESSAGES: Record<string, string[]> = {
  ingesting:  ["Reading your document…", "Scanning pages…", "Parsing content…"],
  indexing:   ["Extracting key concepts…", "Indexing knowledge…", "Mapping ideas…"],
  retrieving: ["Finding relevant content…", "Connecting concepts…", "Gathering insights…"],
  generating: ["Building your slides…", "Crafting structure…", "Writing content…"],
  rendering:  ["Almost ready…", "Polishing slides…", "Finalizing presentation…"],
  default:    ["Analyzing document…", "Processing…", "Working on it…"],
};

// ── Floating particle ─────────────────────────────────────────────────────────
function Particle({ x, delay }: { x: number; delay: number }) {
  return (
    <motion.div
      className="absolute bottom-0 rounded-full"
      style={{
        left: `${x}%`,
        width: Math.random() * 5 + 3,
        height: Math.random() * 5 + 3,
        background: Math.random() > 0.5
          ? "hsl(var(--brand-violet) / 0.7)"
          : "hsl(var(--brand-blue) / 0.7)",
      }}
      initial={{ y: 0, opacity: 0, scale: 0 }}
      animate={{ y: -120, opacity: [0, 0.9, 0], scale: [0, 1, 0.5] }}
      transition={{ duration: 2.2, delay, ease: "easeOut", repeat: Infinity, repeatDelay: Math.random() * 2 }}
    />
  );
}

// ── Page content flash ────────────────────────────────────────────────────────
function PageContent({ side }: { side: "left" | "right" }) {
  return (
    <div className={`absolute inset-0 p-3 flex flex-col gap-1.5 ${side === "left" ? "items-start" : "items-start"}`}>
      <div className="w-3/4 h-1.5 rounded-full bg-gray-300/60" />
      <div className="w-full h-1 rounded-full bg-gray-200/50" />
      <div className="w-5/6 h-1 rounded-full bg-gray-200/50" />
      <div className="w-2/3 h-1 rounded-full bg-gray-200/50" />
      <div className="mt-1 w-full h-8 rounded bg-blue-100/40 border border-blue-200/30" />
      <div className="w-4/5 h-1 rounded-full bg-gray-200/50" />
      <div className="w-full h-1 rounded-full bg-gray-200/50" />
      <div className="w-3/4 h-1 rounded-full bg-gray-200/50" />
    </div>
  );
}

// ── Single flipping page ──────────────────────────────────────────────────────
function FlippingPage({ delay, duration }: { delay: number; duration: number }) {
  return (
    <motion.div
      className="absolute right-0 top-0 w-1/2 h-full origin-left"
      style={{ transformStyle: "preserve-3d", zIndex: 10 }}
      initial={{ rotateY: 0 }}
      animate={{ rotateY: -180 }}
      transition={{ duration, delay, ease: [0.4, 0, 0.2, 1], repeat: Infinity, repeatDelay: 0.1 }}
    >
      {/* Front face */}
      <div
        className="absolute inset-0 rounded-r-sm bg-white border-l border-gray-100 shadow-md"
        style={{ backfaceVisibility: "hidden" }}
      >
        <PageContent side="right" />
      </div>
      {/* Back face */}
      <div
        className="absolute inset-0 rounded-l-sm bg-gray-50 border-r border-gray-100"
        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
      >
        <PageContent side="left" />
      </div>
    </motion.div>
  );
}

// ── Main BookLoader ───────────────────────────────────────────────────────────
interface BookLoaderProps {
  loading: boolean;
  progress: number;
  step: string;
}

export default function BookLoader({ loading, progress, step }: BookLoaderProps) {
  const [message, setMessage] = useState("Analyzing document…");
  const [msgIndex, setMsgIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle through messages for current step
  useEffect(() => {
    const msgs = STEP_MESSAGES[step] ?? STEP_MESSAGES.default;
    setMessage(msgs[0]);
    setMsgIndex(0);

    intervalRef.current = setInterval(() => {
      setMsgIndex(i => {
        const next = (i + 1) % msgs.length;
        setMessage(msgs[next]);
        return next;
      });
    }, 2500);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [step]);

  // Flip speed based on step
  const flipDuration = step === "generating" || step === "rendering" ? 0.7 : 1.1;

  const particles = Array.from({ length: 12 }, (_, i) => ({
    x: 10 + (i * 7) % 80,
    delay: i * 0.3,
  }));

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          key="book-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white"
        >
          {/* Subtle grid background */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          {/* Glow blobs */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-brand-violet/8 blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-brand-blue/6 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col items-center gap-8 z-10">

            {/* Book */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
              style={{ perspective: "800px" }}
            >
              {/* Book body */}
              <div
                className="relative w-52 h-64 rounded-sm shadow-2xl"
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Book cover / spine */}
                <div className="absolute inset-0 rounded-sm bg-gradient-to-br from-slate-800 to-slate-900 shadow-xl">
                  {/* Spine highlight */}
                  <div className="absolute left-0 top-0 bottom-0 w-4 bg-black/20 rounded-l-sm" />
                  {/* Cover text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <div className="w-16 h-1 rounded-full bg-white/20" />
                    <div className="w-10 h-0.5 rounded-full bg-white/10" />
                  </div>
                </div>

                {/* Open pages (left side — static) */}
                <div className="absolute left-4 top-2 bottom-2 right-1/2 bg-white rounded-l-sm border border-gray-100 shadow-inner overflow-hidden">
                  <PageContent side="left" />
                </div>

                {/* Open pages (right side — static base) */}
                <div className="absolute right-4 top-2 bottom-2 left-1/2 bg-white rounded-r-sm border border-gray-100 overflow-hidden">
                  <PageContent side="right" />
                </div>

                {/* Flipping pages */}
                <div className="absolute left-4 top-2 bottom-2 right-4 overflow-hidden" style={{ perspective: "600px" }}>
                  {[0, 1, 2].map(i => (
                    <FlippingPage key={i} delay={i * (flipDuration / 3)} duration={flipDuration} />
                  ))}
                </div>

                {/* Center spine line */}
                <div className="absolute left-1/2 top-2 bottom-2 w-px bg-gray-200 -translate-x-px" />
              </div>

              {/* Floating particles */}
              <div className="absolute -inset-8 pointer-events-none overflow-visible">
                {particles.map((p, i) => (
                  <Particle key={i} x={p.x} delay={p.delay} />
                ))}
              </div>

              {/* Floating data chips */}
              {["concept", "chart", "data", "slide"].map((label, i) => (
                <motion.div
                  key={label}
                  className="absolute text-[9px] font-semibold px-2 py-0.5 rounded-full border border-brand-violet/20 bg-brand-violet/5 text-brand-violet/70"
                  style={{
                    top: `${-10 + i * 25}%`,
                    left: i % 2 === 0 ? "-60px" : "auto",
                    right: i % 2 !== 0 ? "-60px" : "auto",
                  }}
                  animate={{
                    y: [0, -8, 0],
                    opacity: [0.4, 0.9, 0.4],
                  }}
                  transition={{ duration: 2.5 + i * 0.4, repeat: Infinity, delay: i * 0.6, ease: "easeInOut" }}
                >
                  {label}
                </motion.div>
              ))}
            </motion.div>

            {/* Status text */}
            <div className="flex flex-col items-center gap-3">
              <AnimatePresence mode="wait">
                <motion.p
                  key={message}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  className="text-base font-medium text-slate-700"
                >
                  {message}
                </motion.p>
              </AnimatePresence>

              {/* Progress bar */}
              <div className="w-52 h-1 rounded-full bg-gray-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-violet to-brand-blue"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <p className="text-xs text-slate-400">{progress}%</p>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
