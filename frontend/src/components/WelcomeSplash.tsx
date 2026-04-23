import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Spline = lazy(() => import("@splinetool/react-spline"));

const DURATION = 3000;

export default function WelcomeSplash({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start the countdown only once Spline has loaded
  useEffect(() => {
    if (!loaded) return;
    timerRef.current = setTimeout(() => {
      setVisible(false);
      onDone();
    }, DURATION);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [loaded, onDone]);

  // Fallback: if Spline never loads after 5s, dismiss anyway
  useEffect(() => {
    const fallback = setTimeout(() => {
      setLoaded(true); // triggers the main timer
    }, 5000);
    return () => clearTimeout(fallback);
  }, []);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    onDone();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex cursor-pointer"
          style={{ background: "#ffffff" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={dismiss}
        >
          {/* ── Left: text — fades in when Spline loads ── */}
          <motion.div
            className="w-1/2 h-full flex flex-col items-start justify-center px-20 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: loaded ? 1 : 0 }}
            transition={{ duration: 0.7 }}
          >
            <motion.span
              className="text-black/40 text-xl font-light tracking-widest uppercase"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: loaded ? 1 : 0, y: loaded ? 0 : 16 }}
              transition={{ delay: 0.1, duration: 0.6 }}
            >
              Welcome To
            </motion.span>

            <motion.h1
              className="text-6xl md:text-7xl font-extrabold leading-none tracking-tight"
              style={{
                background: "linear-gradient(135deg, #1e1b4b 0%, #7c3aed 50%, #a78bfa 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: loaded ? 1 : 0, y: loaded ? 0 : 20 }}
              transition={{ delay: 0.2, duration: 0.7 }}
            >
              EduAI
            </motion.h1>

            <motion.p
              className="text-black/50 text-2xl md:text-3xl font-light tracking-wide"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: loaded ? 1 : 0, y: loaded ? 0 : 16 }}
              transition={{ delay: 0.4, duration: 0.7 }}
            >
              The future of education
            </motion.p>

          </motion.div>

          {/* ── Right: Spline animation ── */}
          <div className="w-1/2 h-full relative pointer-events-none">
            {/* left edge fade */}
            <div
              className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to right, #ffffff, transparent)" }}
            />
            <Suspense fallback={null}>
              <Spline
                scene="https://prod.spline.design/TYFCIHBLVct3SD8G/scene.splinecode"
                style={{ width: "100%", height: "100%" }}
                onLoad={() => setLoaded(true)}
              />
            </Suspense>
            {/* hide Spline watermark */}
            <div
              className="absolute bottom-0 right-0 pointer-events-none"
              style={{ width: "220px", height: "60px", background: "#ffffff", zIndex: 9999 }}
            />
          </div>

          {/* progress bar — only animates after load */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/10">
            {loaded && (
              <motion.div
                className="h-full"
                style={{ background: "linear-gradient(to right, #7c3aed, #a78bfa)" }}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: DURATION / 1000, ease: "linear" }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
