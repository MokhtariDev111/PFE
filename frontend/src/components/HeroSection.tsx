import { motion } from "framer-motion";
import { Cpu, Zap, Sparkles } from "lucide-react";

export function HeroSection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="py-10 relative z-10"
    >
      {/* ── Horizontal logo + title row ── */}
      <div className="flex items-center gap-6 mb-5">
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 120, delay: 0.1 }}
          className="relative shrink-0"
        >
          <img
            src="/tekup.png"
            alt="TEKUP"
            className="h-16 md:h-20 object-contain relative z-10 animate-float"
          />
          {/* Glow behind logo */}
          <div className="absolute inset-0 bg-primary/25 blur-2xl rounded-full scale-150 pointer-events-none" />
        </motion.div>

        {/* Title block */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-1"
        >
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-none">
            <span className="shimmer-text">TEKUP AI</span>
          </h1>
          <p className="text-base md:text-lg font-medium text-foreground/60 tracking-widest uppercase">
            Teaching Assistant
          </p>
        </motion.div>
      </div>

      {/* ── Subtitle + stats row ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8"
      >
        <p className="text-muted-foreground text-sm md:text-base font-light leading-relaxed max-w-lg">
          Transform documents into stunning pedagogical presentations powered by retrieval-augmented intelligence.
        </p>

        {/* Feature pills */}
        <div className="flex items-center gap-3 shrink-0">
          {[
            { icon: Cpu, label: "RAG Pipeline" },
            { icon: Sparkles, label: "Auto Diagrams" },
            { icon: Zap, label: "PPTX Export" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground/70 bg-secondary/50 border border-glass-border px-2.5 py-1.5 rounded-xl">
              <Icon className="w-3.5 h-3.5 text-primary/70" />
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Divider line ── */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 h-px gradient-primary opacity-20 origin-left"
      />
    </motion.div>
  );
}
