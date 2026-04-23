import { motion } from "framer-motion";
import { Check, Lightbulb } from "lucide-react";
import { StoryPanel } from "./StoryPanel";

const options = [
  { letter: "A", text: "It quantifies entropy as disorder", correct: true },
  { letter: "B", text: "It defines absolute zero" },
  { letter: "C", text: "It explains gravitational waves" },
  { letter: "D", text: "It only applies to gases" },
];

export const PanelQuiz = () => {
  const visual = (
    <div className="relative w-full max-w-md">
      <div className="absolute inset-0 -z-10 rounded-[2rem] bg-gradient-blue/15 blur-3xl" />
      <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-2xl shadow-brand-blue/20">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Question 3 of 10</span>
          <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 font-medium text-brand-blue">
            MCQ
          </span>
        </div>

        <h4 className="mt-3 text-base font-semibold leading-snug">
          What does the second law of thermodynamics state?
        </h4>

        <div className="mt-5 space-y-2">
          {options.map((o, i) => {
            const isCorrect = o.correct;
            return (
              <motion.div
                key={o.letter}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-120px" }}
                transition={{ duration: 0.35, delay: 0.2 + i * 0.1 }}
              >
                <motion.div
                  initial={false}
                  whileInView={
                    isCorrect
                      ? {
                          backgroundColor: "hsl(var(--brand-emerald) / 0.12)",
                          borderColor: "hsl(var(--brand-emerald))",
                        }
                      : {}
                  }
                  viewport={{ once: true, margin: "-120px" }}
                  transition={{ duration: 0.4, delay: 0.9 }}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3.5 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-md text-[11px] font-semibold ${
                        isCorrect
                          ? "bg-brand-emerald text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {o.letter}
                    </span>
                    <span>{o.text}</span>
                  </div>
                  {isCorrect && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      whileInView={{ scale: 1, opacity: 1 }}
                      viewport={{ once: true, margin: "-120px" }}
                      transition={{ duration: 0.3, delay: 1.0, type: "spring" }}
                      className="grid h-5 w-5 place-items-center rounded-full bg-brand-emerald text-white"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </motion.span>
                  )}
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.45, delay: 1.3 }}
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-brand-blue/25 bg-brand-blue/5 p-3.5 text-xs leading-relaxed text-foreground/80"
        >
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
          <p>
            <span className="font-semibold text-foreground">Explanation:</span>{" "}
            The second law states that the total entropy of an isolated system always increases over time, quantifying the natural tendency toward disorder.
          </p>
        </motion.div>
      </div>
    </div>
  );

  return (
    <StoryPanel
      eyebrow="Module 03 — Quizzes"
      eyebrowColorClass="text-brand-blue"
      accentBorderClass="bg-brand-blue"
      headline="Test your knowledge. Master any subject."
      body="Generate MCQ, True/False, and short-answer quizzes instantly from any topic or document. Each question comes with a detailed explanation so every wrong answer becomes a learning moment."
      ctaLabel="Generate a Quiz"
      ctaRoute="/generate/quiz"
      ctaGradientClass="bg-gradient-blue"
      tintClass="bg-tint-blue/40 dark:bg-tint-blue/30"
      visual={visual}
      reverse={false}
    />
  );
};
