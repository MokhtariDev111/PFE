import { motion, useInView, useMotionValue, animate } from "framer-motion";
import { Check, Download, FileText, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StoryPanel } from "./StoryPanel";

/* -------------------- Floating sparkles -------------------- */
const Sparkle = ({
  x,
  y,
  delay,
  size = 14,
}: {
  x: string;
  y: string;
  delay: number;
  size?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0, rotate: 0 }}
    whileInView={{ opacity: [0, 1, 0.7], scale: [0, 1.2, 1], rotate: 180 }}
    viewport={{ once: true, margin: "-120px" }}
    transition={{ duration: 1.6, delay, ease: "easeOut" }}
    style={{ left: x, top: y }}
    className="pointer-events-none absolute"
  >
    <Sparkles
      className="text-brand-rose drop-shadow-[0_0_12px_hsl(var(--brand-rose)/0.6)]"
      style={{ width: size, height: size }}
    />
  </motion.div>
);

/* -------------------- Exam PDF mock -------------------- */
const ExamPdf = ({
  delay,
  offset,
  rotate,
  zIndex,
  label,
  accent,
  isCorrection = false,
}: {
  delay: number;
  offset: { x: number; y: number };
  rotate: number;
  zIndex: number;
  label: string;
  accent: "rose" | "emerald";
  isCorrection?: boolean;
}) => {
  const accentBg = accent === "rose" ? "bg-gradient-rose" : "bg-gradient-emerald";
  const accentText = accent === "rose" ? "text-brand-rose" : "text-brand-emerald";
  const accentTint = accent === "rose" ? "bg-brand-rose/10" : "bg-brand-emerald/10";
  const shadow = accent === "rose" ? "shadow-brand-rose/30" : "shadow-brand-emerald/30";

  return (
    <motion.div
      initial={{ opacity: 0, y: 60, x: offset.x, rotate: rotate - 8 }}
      whileInView={{ opacity: 1, y: offset.y, x: offset.x, rotate }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ zIndex }}
      className={`absolute left-1/2 top-1/2 w-[78%] max-w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/70 bg-card p-5 shadow-2xl ${shadow}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`grid h-7 w-7 place-items-center rounded-lg ${accentBg} text-white shadow-md`}>
            <FileText className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">PDF</div>
            <div className="text-[11px] font-semibold leading-tight">{label}</div>
          </div>
        </div>
        <span className={`rounded-full ${accentTint} px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${accentText}`}>
          {isCorrection ? "Graded" : "Ready"}
        </span>
      </div>
      <div className="mt-4 space-y-1.5">
        <div className={`h-2 w-3/4 rounded-full ${accentBg} opacity-80`} />
        <div className="h-1.5 w-1/2 rounded-full bg-muted" />
      </div>
      <div className="mt-4 space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] font-bold ${accentText}`}>Q{i + 1}.</span>
              <div className="h-1.5 flex-1 rounded-full bg-muted" />
            </div>
            <div className="ml-3 space-y-1">
              <div className="flex items-center gap-1.5">
                {isCorrection && i !== 1 ? (
                  <Check className="h-2.5 w-2.5 text-brand-emerald" strokeWidth={3} />
                ) : isCorrection && i === 1 ? (
                  <X className="h-2.5 w-2.5 text-brand-rose" strokeWidth={3} />
                ) : (
                  <span className="h-2 w-2 rounded-full border border-muted-foreground/40" />
                )}
                <div className="h-1 w-10/12 rounded-full bg-muted" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-muted-foreground/40" />
                <div className="h-1 w-9/12 rounded-full bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
        <span className="text-[9px] text-muted-foreground">12 questions · 45 min</span>
        <motion.span
          initial={{ y: 0 }}
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: delay + 1 }}
          className={`flex items-center gap-1 rounded-full ${accentBg} px-2.5 py-1 text-[9px] font-semibold text-white shadow-md`}
        >
          <Download className="h-2.5 w-2.5" strokeWidth={3} />
          PDF
        </motion.span>
      </div>
    </motion.div>
  );
};

/* -------------------- Topic chip flow -------------------- */
const TopicChip = ({
  label,
  delay,
  className,
}: {
  label: string;
  delay: number;
  className: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.6, y: 10 }}
    whileInView={{ opacity: 1, scale: 1, y: 0 }}
    viewport={{ once: true, margin: "-120px" }}
    transition={{ duration: 0.5, delay, ease: "backOut" }}
    className={`absolute rounded-full border border-border/80 bg-background/95 px-3 py-1 text-[10px] font-medium shadow-lg backdrop-blur ${className}`}
  >
    {label}
  </motion.div>
);

/* -------------------- Animated score badge -------------------- */
const ScoreBadge = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-120px" });
  const value = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(value, 18, {
      duration: 1.4,
      delay: 1.2,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.5, rotate: -12 }}
      whileInView={{ opacity: 1, scale: 1, rotate: -8 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 0.6, delay: 1, ease: "backOut" }}
      className="absolute -right-2 top-8 z-30 grid h-20 w-20 place-items-center rounded-full bg-gradient-rose text-white shadow-2xl shadow-brand-rose/40 sm:-right-4 sm:top-4"
    >
      <div className="text-center leading-none">
        <div className="text-2xl font-bold tabular-nums">
          {display}
          <span className="text-sm">/20</span>
        </div>
        <div className="mt-1 text-[8px] font-semibold uppercase tracking-widest opacity-90">Score</div>
      </div>
    </motion.div>
  );
};

/* -------------------- Main panel -------------------- */
export const PanelExam = () => {
  const visual = (
    <div className="relative h-[520px] w-full max-w-xl sm:h-[560px] px-0">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 1 }}
        className="absolute inset-0 -z-10 rounded-[2rem] bg-gradient-rose/20 blur-3xl"
      />
      <TopicChip label="📐 Calculus" delay={0.1} className="left-2 top-4 text-brand-violet" />
      <TopicChip label="🧬 Biology" delay={0.25} className="right-4 top-16 text-brand-emerald" />
      <TopicChip label="⚛️ Physics" delay={0.4} className="left-6 bottom-20 text-brand-blue" />
      <TopicChip label="📊 Statistics" delay={0.55} className="right-2 bottom-8 text-brand-rose" />
      <Sparkle x="12%" y="40%" delay={0.7} size={16} />
      <Sparkle x="85%" y="35%" delay={0.9} />
      <Sparkle x="20%" y="78%" delay={1.1} size={12} />
      <Sparkle x="78%" y="72%" delay={1.3} size={18} />
      <ScoreBadge />
      <ExamPdf
        delay={0.5}
        offset={{ x: -82, y: -60 }}
        rotate={-7}
        zIndex={10}
        label="Exam.pdf"
        accent="rose"
      />
      <ExamPdf
        delay={0.75}
        offset={{ x: 2, y: 0 }}
        rotate={6}
        zIndex={20}
        label="Correction.pdf"
        accent="emerald"
        isCorrection
      />
    </div>
  );

  return (
    <StoryPanel
      eyebrow="Module 04 — Exam Simulator"
      eyebrowColorClass="text-brand-rose"
      accentBorderClass="bg-brand-rose"
      headline="Build your exam. Download. Done."
      body="Pick your topics, difficulty, and format. Our AI generates a full exam as a downloadable PDF — then a second PDF with the complete corrected answer key. Print it, share it, or train against it."
      ctaLabel="Create your Exam"
      ctaRoute="/exam"
      ctaGradientClass="bg-gradient-rose"
      tintClass="bg-tint-rose/40 dark:bg-tint-rose/30"
      visual={visual}
      reverse={true}
    />
  );
};
