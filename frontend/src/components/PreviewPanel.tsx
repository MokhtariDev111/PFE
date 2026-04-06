import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Presentation, Maximize2,
  Lightbulb, Target, Zap, TrendingUp, CheckCircle, BookOpen, Code, 
  GitBranch, BarChart3, Layers, ArrowRight, Sparkles, ZoomIn, ZoomOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Slide } from "@/hooks/useAppState";

interface PreviewPanelProps {
  slides: Slide[];
  isStreaming?: boolean;
  htmlUrl?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BULLET STYLING
// ─────────────────────────────────────────────────────────────────────────────

type BulletPriority = "high" | "medium" | "low";

function getBulletIcon(text: string): JSX.Element {
  const lower = text.toLowerCase();
  if (lower.includes("example") || lower.includes("case")) return <BookOpen className="w-4 h-4" />;
  if (lower.includes("step") || lower.includes("process")) return <GitBranch className="w-4 h-4" />;
  if (lower.includes("data") || lower.includes("statistic") || lower.includes("%")) return <BarChart3 className="w-4 h-4" />;
  if (lower.includes("key") || lower.includes("important") || lower.includes("critical")) return <Zap className="w-4 h-4" />;
  if (lower.includes("benefit") || lower.includes("advantage")) return <TrendingUp className="w-4 h-4" />;
  if (lower.includes("component") || lower.includes("layer")) return <Layers className="w-4 h-4" />;
  if (lower.includes("result") || lower.includes("conclusion")) return <CheckCircle className="w-4 h-4" />;
  return <Target className="w-4 h-4" />;
}

function getBulletPriority(text: string, index: number): BulletPriority {
  const lower = text.toLowerCase();
  if (lower.includes("key") || lower.includes("critical") || lower.includes("important") || lower.includes("must")) return "high";
  if (lower.includes("note") || lower.includes("also") || lower.includes("additionally") || lower.includes("optional")) return "low";
  if (index < 2) return "high";
  if (index > 4) return "low";
  return "medium";
}

const priorityStyles: Record<BulletPriority, string> = {
  high: "border-l-4 border-primary bg-gradient-to-r from-primary/10 to-transparent pl-4 -ml-1",
  medium: "border-l-2 border-muted-foreground/30 pl-4",
  low: "pl-5 opacity-80"
};

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE TYPE BADGE
// ─────────────────────────────────────────────────────────────────────────────

const slideTypeConfig: Record<string, { icon: JSX.Element; color: string; label: string }> = {
  title: { icon: <Sparkles className="w-3 h-3" />, color: "bg-violet-500/20 text-violet-400 border-violet-500/30", label: "Title" },
  intro: { icon: <BookOpen className="w-3 h-3" />, color: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Introduction" },
  definition: { icon: <BookOpen className="w-3 h-3" />, color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", label: "Definition" },
  concept: { icon: <Lightbulb className="w-3 h-3" />, color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", label: "Concept" },
  example: { icon: <Code className="w-3 h-3" />, color: "bg-green-500/20 text-green-400 border-green-500/30", label: "Example" },
  comparison: { icon: <GitBranch className="w-3 h-3" />, color: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "Comparison" },
  process: { icon: <ArrowRight className="w-3 h-3" />, color: "bg-orange-500/20 text-orange-400 border-orange-500/30", label: "Process" },
  summary: { icon: <CheckCircle className="w-3 h-3" />, color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Summary" },
  content: { icon: <Target className="w-3 h-3" />, color: "bg-slate-500/20 text-slate-400 border-slate-500/30", label: "Content" },
};

function SlideTypeBadge({ type }: { type: string }) {
  const config = slideTypeConfig[type] || slideTypeConfig.content;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATED BULLET
// ─────────────────────────────────────────────────────────────────────────────

function AnimatedBullet({ text, index }: { text: string; index: number }) {
  const priority = getBulletPriority(text, index);
  const Icon = getBulletIcon(text);
  
  return (
    <motion.li
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.3, ease: "easeOut" }}
      className={`flex gap-3 py-3 rounded-lg transition-colors ${priorityStyles[priority]}`}
    >
      <span className={`mt-0.5 shrink-0 ${priority === "high" ? "text-primary" : "text-muted-foreground/60"}`}>
        {Icon}
      </span>
      <span className={`text-foreground/90 leading-relaxed ${priority === "high" ? "font-medium" : ""}`}>
        {text}
      </span>
    </motion.li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function PreviewPanel({ slides, isStreaming = false, htmlUrl }: PreviewPanelProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);
  const [imageExpanded, setImageExpanded] = useState(false);

  useEffect(() => {
    if (slides.length === 0) {
      setCurrentSlide(0);
      setAutoFollow(true);
    } else if (isStreaming && autoFollow) {
      setDirection(1);
      setCurrentSlide(slides.length - 1);
    }
  }, [slides.length, isStreaming, autoFollow]);

  const goTo = useCallback((idx: number) => {
    setDirection(idx > currentSlide ? 1 : -1);
    setAutoFollow(false);
    setCurrentSlide(idx);
  }, [currentSlide]);

  const goNext = useCallback(() => {
    if (currentSlide < slides.length - 1) goTo(currentSlide + 1);
  }, [slides.length, currentSlide, goTo]);
  
  const goPrev = useCallback(() => {
    if (currentSlide > 0) goTo(currentSlide - 1);
  }, [currentSlide, goTo]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  // Empty state
  if (slides.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="flex flex-col items-center justify-center py-24 text-muted-foreground"
      >
        {isStreaming ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <Sparkles className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-lg font-medium bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              Generating Slides…
            </p>
          </div>
        ) : (
          <>
            <Presentation className="w-12 h-12 mb-4 opacity-20" />
            <p>No presentation generated yet</p>
            <p className="text-sm text-muted-foreground/50 mt-1">Upload documents and enter a topic to get started</p>
          </>
        )}
      </motion.div>
    );
  }

  const slide = slides[currentSlide];
  const progress = ((currentSlide + 1) / slides.length) * 100;
  const hasImage = !!slide.image_id;

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 60 : -60, opacity: 0, scale: 0.98 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (d: number) => ({ x: d < 0 ? 60 : -60, opacity: 0, scale: 0.98 })
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress Bar */}
      <div className="relative">
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden shadow-inner">
          <motion.div 
            className="h-full rounded-full bg-gradient-to-r from-primary via-purple-500 to-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        {/* Slide dots */}
        <div className="flex justify-center gap-1.5 mt-3">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                i === currentSlide 
                  ? "bg-primary w-6" 
                  : i < currentSlide 
                    ? "bg-primary/40" 
                    : "bg-secondary hover:bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Slide Card */}
      <div className="relative bg-card border rounded-2xl shadow-2xl overflow-hidden">
        {/* Decorative top accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500 z-10" />

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="p-6 md:p-8 pt-8"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                {currentSlide + 1} / {slides.length}
              </span>
              <div className="flex items-center gap-2">
                {slide.image_id && (
                  <button
                    onClick={() => setImageExpanded(v => !v)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    {imageExpanded ? <ZoomOut className="w-3 h-3" /> : <ZoomIn className="w-3 h-3" />}
                    {imageExpanded ? "Shrink" : "Expand"} image
                  </button>
                )}
                <SlideTypeBadge type={slide.slideType || "content"} />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-3 leading-snug">
              {slide.title}
            </h2>

            {/* Divider */}
            <div className="h-0.5 w-16 bg-gradient-to-r from-primary to-transparent mb-4" />

            {/* Body: split when image expanded, stacked otherwise */}
            <div className={slide.image_id && imageExpanded ? "flex gap-6 items-start" : ""}>
              {/* Bullets */}
              <ul className={`space-y-1 ${slide.image_id && imageExpanded ? "flex-1 min-w-0" : ""}`}>
                {(slide.bullets || []).map((b: any, i: number) => {
                  const text = typeof b === 'string' ? b : b?.text;
                  if (!text) return null;
                  return (
                    <AnimatedBullet key={i} text={text} index={i} />
                  );
                })}
              </ul>

              {/* Image placeholder when expanded */}
              {slide.image_id && imageExpanded && (
                <div className="w-2/5 shrink-0 rounded-xl border border-border/50 bg-secondary/20 flex flex-col items-center justify-center gap-2 p-4 min-h-[160px] text-center">
                  <Presentation className="w-8 h-8 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/50">Image visible in full presentation</p>
                  <code className="text-[10px] text-muted-foreground/30">{slide.image_id}</code>
                </div>
              )}
            </div>

            {/* Diagram */}
            
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation & Launch */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={goPrev} 
            disabled={currentSlide === 0}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </Button>
          <Button 
            variant="outline" 
            onClick={goNext} 
            disabled={currentSlide === slides.length - 1}
            className="gap-2"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {htmlUrl && (
          <Button 
            className="bg-gradient-to-r from-primary to-purple-600 text-white font-bold px-8 shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:scale-105 transition-all duration-200 gap-2" 
            onClick={() => {
              const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
              window.open(`${baseUrl}${htmlUrl}`, "_blank");
            }}
          >
            <Maximize2 className="w-4 h-4" />
            Launch Interactive Presentation
          </Button>
        )}
      </div>
      
      {/* Keyboard hint */}
      <p className="text-center text-xs text-muted-foreground/50">
        Use <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px]">←</kbd> <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px]">→</kbd> or <kbd className="px-1.5 py-0.5 bg-secondary rounded text-[10px]">Space</kbd> to navigate
      </p>
    </div>
  );
}
