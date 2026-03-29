import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, Brain, Presentation, ArrowRight } from "lucide-react";
import { useState } from "react";

const STEPS = [
  {
    icon: Upload,
    color: "text-primary bg-primary/10 border-primary/20",
    title: "Upload Your Documents",
    desc: "Drop in PDFs, TXT files, or images. The AI will OCR and index everything automatically.",
  },
  {
    icon: Brain,
    color: "text-accent bg-accent/10 border-accent/20",
    title: "Describe Your Topic",
    desc: "Type what you want to teach. The RAG pipeline retrieves the most relevant content from your docs.",
  },
  {
    icon: Presentation,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    title: "Get Your Presentation",
    desc: "Receive a fully structured PPTX with slides, speaker notes, and auto-generated diagrams.",
  },
];

interface WelcomeModalProps {
  onClose: () => void;
}

export function WelcomeModal({ onClose }: WelcomeModalProps) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-background/80 backdrop-blur-md"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative glass-card glow-border w-full max-w-md overflow-hidden"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-primary/15 blur-3xl pointer-events-none" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-8 relative z-10">
            <div className="text-center mb-8">
              <div className="text-3xl mb-3">👋</div>
              <h2 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: "Syne, sans-serif" }}>
                Welcome to TEKUP AI
              </h2>
              <p className="text-sm text-muted-foreground">Here's how it works in 3 simple steps</p>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="mb-8"
              >
                {(() => {
                  const { icon: Icon, color, title, desc } = STEPS[step];
                  return (
                    <div className="flex flex-col items-center text-center gap-4">
                      <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center ${color}`}>
                        <Icon className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-center gap-2 mb-6">
              {STEPS.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className={`rounded-full transition-all duration-300 ${i === step ? "w-6 h-2 gradient-primary" : "w-2 h-2 bg-border hover:bg-muted-foreground/40"}`}
                />
              ))}
            </div>

            <div className="flex gap-3">
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)}
                  className="flex-1 py-2.5 rounded-xl border border-glass-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
                  Back
                </button>
              )}
              <button
                onClick={() => isLast ? onClose() : setStep(s => s + 1)}
                className="flex-1 py-2.5 rounded-xl gradient-primary text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
              >
                {isLast ? "Get Started" : "Next"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {!isLast && (
              <button onClick={onClose} className="w-full text-center text-xs text-muted-foreground/50 hover:text-muted-foreground mt-3 transition-colors">
                Skip intro
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
