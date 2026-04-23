import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Upload, Wand2, Download, CheckCircle } from "lucide-react";

const STEPS = [
  {
    icon: Upload,
    number: "01",
    title: "Upload or Describe",
    desc: "Drop a PDF, paste a topic, or just type what you want to learn about.",
    color: "text-brand-violet",
    bg: "bg-brand-violet/10",
    border: "border-brand-violet/20",
  },
  {
    icon: Wand2,
    number: "02",
    title: "AI Does the Work",
    desc: "Our AI analyzes, structures, and creates personalized learning content in seconds.",
    color: "text-brand-blue",
    bg: "bg-brand-blue/10",
    border: "border-brand-blue/20",
  },
  {
    icon: CheckCircle,
    number: "03",
    title: "Learn & Interact",
    desc: "Study with quizzes, presentations, debates, and exams — all tailored to you.",
    color: "text-brand-emerald",
    bg: "bg-brand-emerald/10",
    border: "border-brand-emerald/20",
  },
  {
    icon: Download,
    number: "04",
    title: "Master the Material",
    desc: "Track your progress, revisit weak spots, and walk into exams with confidence.",
    color: "text-brand-rose",
    bg: "bg-brand-rose/10",
    border: "border-brand-rose/20",
  },
];

function StepCard({ step, index }: { step: typeof STEPS[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const Icon = step.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.15, ease: "easeOut" }}
      className="relative flex flex-col sm:flex-row items-start gap-5"
    >
      {/* Number + connector line */}
      <div className="flex flex-col items-center">
        <motion.div
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${step.bg} border ${step.border}`}
          whileHover={{ scale: 1.08, rotate: 3 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Icon className={`h-6 w-6 ${step.color}`} />
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border text-[9px] font-bold text-muted-foreground">
            {step.number}
          </span>
        </motion.div>
        {index < STEPS.length - 1 && (
          <motion.div
            className="mt-3 w-0.5 flex-1 bg-gradient-to-b from-border to-transparent hidden sm:block"
            style={{ height: "60px" }}
            initial={{ scaleY: 0, originY: 0 }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ delay: index * 0.15 + 0.3, duration: 0.5 }}
          />
        )}
      </div>
      <div className="pb-8">
        <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground max-w-sm">{step.desc}</p>
      </div>
    </motion.div>
  );
}

export const AnimatedProcess = () => {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="container">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20 items-center">
          {/* Left: text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground mb-5">
              How it works
            </span>
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              From topic to mastery in{" "}
              <span className="bg-gradient-aurora bg-clip-text text-transparent [background-size:200%_200%] animate-gradient-shift">
                4 steps
              </span>
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg max-w-md">
              No complex setup. No learning curve. Just upload, generate, and start learning.
            </p>
          </motion.div>

          {/* Right: steps */}
          <div className="flex flex-col gap-1">
            {STEPS.map((step, i) => (
              <StepCard key={step.number} step={step} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
