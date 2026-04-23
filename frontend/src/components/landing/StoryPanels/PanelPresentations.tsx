import { motion } from "framer-motion";
import { BarChart3, Image as ImageIcon, Type } from "lucide-react";
import { StoryPanel } from "./StoryPanel";

const SlideMock = ({
  delay,
  offset,
  rotate,
  zIndex,
}: {
  delay: number;
  offset: number;
  rotate: number;
  zIndex: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 40, rotate: rotate - 6 }}
    whileInView={{ opacity: 1, y: offset, rotate }}
    viewport={{ once: true, margin: "-120px" }}
    transition={{ duration: 0.7, delay, ease: "easeOut" }}
    style={{ zIndex }}
    className="absolute left-1/2 top-[45%] w-[90%] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/70 bg-card p-7 shadow-2xl shadow-brand-violet/20"
  >
    {/* Window chrome */}
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-brand-rose/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-brand-violet/40" />
      <span className="h-2.5 w-2.5 rounded-full bg-brand-emerald/70" />
    </div>

    {/* Slide title bar */}
    <div className="mt-5 h-3 w-3/4 rounded-full bg-gradient-violet" />
    <div className="mt-2.5 h-2 w-1/2 rounded-full bg-muted" />

    {/* Body */}
    <div className="mt-6 grid grid-cols-5 gap-4">
      <div className="col-span-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Type className="h-3.5 w-3.5 text-brand-violet" />
          <div className="h-2 flex-1 rounded-full bg-muted" />
        </div>
        <div className="h-2 w-11/12 rounded-full bg-muted" />
        <div className="h-2 w-10/12 rounded-full bg-muted" />
        <div className="h-2 w-9/12 rounded-full bg-muted" />
        <div className="mt-3 flex items-center gap-2">
          <Type className="h-3.5 w-3.5 text-brand-indigo" />
          <div className="h-2 flex-1 rounded-full bg-muted" />
        </div>
        <div className="h-2 w-10/12 rounded-full bg-muted" />
      </div>
      <div className="col-span-2 grid place-items-center rounded-xl bg-gradient-violet/10 p-4">
        <BarChart3 className="h-12 w-12 text-brand-violet" />
      </div>
    </div>

    <div className="mt-5 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Slide</span>
      </div>
      <div className="h-1.5 w-20 rounded-full bg-muted" />
    </div>
  </motion.div>
);

export const PanelPresentations = () => {
  const visual = (
    <div className="relative h-[600px] w-full max-w-3xl sm:h-[640px] lg:-ml-72 xl:-ml-96">
      <div className="absolute inset-0 -z-10 rounded-[2rem] bg-gradient-violet/15 blur-3xl" />
      <SlideMock delay={0.45} offset={-62} rotate={-8} zIndex={1} />
      <SlideMock delay={0.3} offset={-18} rotate={-2} zIndex={2} />
      <SlideMock delay={0.15} offset={26} rotate={4} zIndex={3} />
    </div>
  );

  return (
    <StoryPanel
      eyebrow="Module 01 — Presentations"
      eyebrowColorClass="text-brand-violet"
      accentBorderClass="bg-brand-violet"
      headline="From document to slideshow in seconds."
      body="Upload any PDF, textbook chapter, or research paper. Our AI reads, understands, and structures it into a polished, ready-to-present slide deck — complete with diagrams and speaker notes."
      ctaLabel="Try Presentations"
      ctaRoute="/dashboard"
      ctaGradientClass="bg-gradient-violet"
      tintClass="bg-tint-violet/40 dark:bg-tint-violet/30"
      visual={visual}
      reverse={false}
    />
  );
};
