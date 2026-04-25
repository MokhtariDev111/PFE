import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function LoginWelcome() {
  const { user, showWelcome, dismissWelcome } = useAuth();

  useEffect(() => {
    if (!showWelcome) return;
    const t = setTimeout(dismissWelcome, 2800);
    return () => clearTimeout(t);
  }, [showWelcome]);

  return (
    <AnimatePresence>
      {showWelcome && user && (
        <motion.div
          key="welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
          transition={{ duration: 0.4 }}
          onClick={dismissWelcome}
          className="fixed inset-0 z-[9999] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-background"
        >
          {/* Ambient glows */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-violet/20 blur-[120px]" />
            <div className="absolute left-1/4 top-1/3 h-64 w-64 rounded-full bg-brand-cyan/15 blur-[80px]" />
            <div className="absolute right-1/4 bottom-1/3 h-64 w-64 rounded-full bg-brand-rose/15 blur-[80px]" />
          </div>

          {/* Content */}
          <div className="relative flex flex-col items-center gap-6 px-6 text-center">
            {/* Logo pulse */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
              className="relative grid h-20 w-20 place-items-center rounded-3xl bg-gradient-aurora shadow-2xl shadow-brand-violet/40"
            >
              <GraduationCap className="h-9 w-9 text-white" strokeWidth={2} />
              <Sparkles className="absolute -right-2 -top-2 h-6 w-6 text-brand-cyan drop-shadow-lg" />
            </motion.div>

            {/* Greeting */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <p className="text-base font-medium text-muted-foreground">Welcome back</p>
              <h1 className="mt-1 bg-gradient-to-r from-brand-violet via-brand-cyan to-brand-rose bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl">
                {user.name.split(" ")[0]}
              </h1>
            </motion.div>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.5 }}
              className="text-sm text-muted-foreground"
            >
              Your AI learning journey continues ✦
            </motion.p>

            {/* Progress bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-4 h-0.5 w-48 overflow-hidden rounded-full bg-border/40"
            >
              <motion.div
                initial={{ scaleX: 0, originX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.8, duration: 2, ease: "linear" }}
                className="h-full rounded-full bg-gradient-aurora"
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="text-xs text-muted-foreground/50"
            >
              Click anywhere to continue
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
