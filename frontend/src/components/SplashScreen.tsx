import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [visible, setVisible] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 600);
    const t2 = setTimeout(() => setStep(2), 1600);
    const t3 = setTimeout(() => { setVisible(false); setTimeout(onComplete, 700); }, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04, filter: "blur(12px)" }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background dot-grid overflow-hidden"
        >
          {/* Ambient orbs */}
          <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-primary/15 blur-[100px] pointer-events-none" />
          <div className="absolute bottom-1/3 right-1/3 w-[400px] h-[400px] rounded-full bg-accent/10 blur-[100px] pointer-events-none" />

          {/* Logo */}
          <motion.img
            initial={{ scale: 0.6, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
            src="/tekup.png"
            alt="TEKUP"
            className="w-36 md:w-44 mb-8 drop-shadow-[0_0_40px_rgba(99,102,241,0.3)] relative z-10"
          />

          {/* Text */}
          <AnimatePresence>
            {step >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center relative z-10"
              >
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                  <span className="shimmer-text">TEKUP AI</span>
                </h1>
                <p className="text-muted-foreground font-light text-sm tracking-widest uppercase">
                  Teaching Assistant
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress bar */}
          <AnimatePresence>
            {step >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-10 relative z-10 flex flex-col items-center gap-3"
              >
                <div className="w-48 h-0.5 bg-border rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.4, ease: "easeInOut" }}
                    className="h-full gradient-primary rounded-full"
                  />
                </div>
                <p className="text-xs text-muted-foreground tracking-wide">Initializing pipeline…</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
