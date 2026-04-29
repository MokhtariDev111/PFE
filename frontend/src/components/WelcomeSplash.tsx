import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DURATION = 3000;

const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  size: Math.random() * 4 + 2,
  delay: Math.random() * 2.5,
  duration: Math.random() * 3 + 3,
  color: ["#7c3aed", "#06b6d4", "#f43f5e", "#a78bfa", "#67e8f9"][i % 5],
}));

export default function WelcomeSplash({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particles = useMemo(() => PARTICLES, []);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      onDone();
    }, DURATION);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDone]);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    onDone();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-white"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          onClick={dismiss}
        >
          {/* Ambient blobs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-violet-200/50 blur-3xl"
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-cyan-200/40 blur-3xl"
              animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            />
            <motion.div
              className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-200/30 blur-3xl"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            />
          </div>

          {/* Floating particles */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {particles.map(p => (
              <motion.div
                key={p.id}
                className="absolute bottom-0 rounded-full opacity-0"
                style={{
                  left: `${p.x}%`,
                  width: p.size,
                  height: p.size,
                  background: p.color,
                }}
                animate={{
                  y: [0, -window.innerHeight - 20],
                  opacity: [0, 0.55, 0.55, 0],
                }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>

          {/* Subtle grid shimmer */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative mb-8"
          >
            <img
              src="/logo.png"
              alt="EduAI"
              className="h-36 w-auto drop-shadow-2xl"
              draggable={false}
            />
          </motion.div>

          {/* Tagline */}
          <motion.div
            className="flex flex-col items-center gap-1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <p className="text-black/70 text-2xl font-semibold tracking-tight">
              Welcome to EduAI
            </p>
            <p className="text-black/35 text-sm font-light tracking-widest uppercase">
              The future of education
            </p>
          </motion.div>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/10">
            <motion.div
              className="h-full"
              style={{ background: "linear-gradient(to right, #7c3aed, #06b6d4, #f43f5e)" }}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: DURATION / 1000, ease: "linear" }}
            />
          </div>

          {/* Click to skip hint */}
          <motion.p
            className="absolute bottom-6 right-8 text-xs text-black/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            Click anywhere to skip
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
