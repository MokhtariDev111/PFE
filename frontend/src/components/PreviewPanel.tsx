import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Presentation, Maximize2, AlertCircle,
  Lightbulb, Target, Zap, TrendingUp, CheckCircle, BookOpen, Code, 
  GitBranch, BarChart3, Layers, ArrowRight, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Slide } from "@/hooks/useAppState";
import mermaid from "mermaid";

mermaid.initialize({ 
  startOnLoad: false, 
  theme: "dark", 
  darkMode: true, 
  fontFamily: "DM Sans, sans-serif",
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
  themeVariables: {
    primaryColor: '#7c3aed',
    primaryTextColor: '#f8fafc',
    primaryBorderColor: '#7c3aed',
    lineColor: '#64748b',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a'
  }
});

interface PreviewPanelProps {
  slides: Slide[];
  isStreaming?: boolean;
  htmlUrl?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART VISUAL LOGIC
// ─────────────────────────────────────────────────────────────────────────────

const NO_DIAGRAM_TYPES = new Set(["title", "intro", "summary"]);
const DIAGRAM_KEYWORDS = ["process", "workflow", "step", "flow", "architecture", "hierarchy", "comparison", "vs", "timeline", "cycle"];

function shouldShowDiagram(slide: Slide): boolean {
  // Skip for certain slide types
  if (NO_DIAGRAM_TYPES.has(slide.slideType || "")) return false;
  if (!slide.diagram) return false;
  
  // Check if diagram has enough nodes (at least 3)
  const nodeMatches = slide.diagram.match(/\[.*?\]|-->|---/g) || [];
  if (nodeMatches.length < 3) return false;
  
  // Check if content warrants a diagram
  const content = `${slide.title} ${(slide.bullets || []).map(b => typeof b === 'string' ? b : b.text).join(' ')}`.toLowerCase();
  const hasDiagramKeywords = DIAGRAM_KEYWORDS.some(kw => content.includes(kw));
  
  return hasDiagramKeywords;
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
// MERMAID DIAGRAM
// ─────────────────────────────────────────────────────────────────────────────

function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    if (!ref.current || !code) return;
    
    const renderDiagram = async () => {
      setLoading(true);
      setError(false);
      
      try {
        // Clean the code
        const cleanCode = code
          .replace(/```mermaid/g, '')
          .replace(/```/g, '')
          .trim();
        
        const { svg } = await mermaid.render(idRef.current, cleanCode);
        
        if (ref.current) {
          ref.current.innerHTML = svg;
          
          // Style the SVG
          const svgEl = ref.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
            svgEl.style.minHeight = '120px';
          }
        }
      } catch (e) {
        console.warn("Mermaid render failed:", e);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    
    // Small delay to ensure DOM is ready
    const timer = setTimeout(renderDiagram, 50);
    return () => clearTimeout(timer);
  }, [code]);

  if (error) {
    // Fallback: extract and display nodes as a list
    const nodes = code.match(/\[([^\]]+)\]/g)?.map(n => n.slice(1, -1)) || [];
    
    return (
      <div className="p-4 bg-secondary/30 rounded-xl border border-dashed border-muted-foreground/30">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
          <AlertCircle className="w-4 h-4" />
          <span>Diagram structure</span>
        </div>
        {nodes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {nodes.slice(0, 6).map((node, i) => (
              <span key={i} className="px-3 py-1.5 bg-secondary rounded-lg text-sm text-foreground/80 border border-border">
                {node}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60">Could not render diagram</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 rounded-xl">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div 
        ref={ref} 
        className="flex justify-center items-center min-h-[140px] p-4 bg-gradient-to-br from-secondary/40 to-secondary/20 rounded-xl border border-border/50"
      />
    </div>
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
  const showDiagram = shouldShowDiagram(slide);

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
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500" />
        
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none">
          <Presentation className="w-full h-full" />
        </div>
        
        <div className="p-8 md:p-12 min-h-[480px]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentSlide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="relative z-10 space-y-6"
            >
              {/* Header */}
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  {currentSlide + 1} / {slides.length}
                </span>
                <SlideTypeBadge type={slide.slideType || "content"} />
              </div>
              
              {/* Title */}
              <motion.h2 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text"
              >
                {slide.title}
              </motion.h2>
              
              {/* Divider */}
              <motion.div 
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="h-0.5 w-24 bg-gradient-to-r from-primary to-transparent origin-left"
              />
              
              {/* Bullets */}
              <motion.ul 
                className="space-y-2"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
                }}
              >
                {(slide.bullets || []).map((b: any, i: number) => (
                  <AnimatedBullet 
                    key={i} 
                    text={typeof b === 'string' ? b : b.text} 
                    index={i} 
                  />
                ))}
              </motion.ul>

              {/* Diagram (conditional) */}
              {showDiagram && slide.diagram && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  className="mt-8"
                >
                  <MermaidDiagram code={slide.diagram} />
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
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
