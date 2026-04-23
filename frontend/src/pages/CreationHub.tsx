import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, MessageSquare, Brain, GitBranch, Sparkles, History, BarChart3 } from "lucide-react";
import LiquidEther from "@/components/reactbits/LiquidEther";
import SplitText from "@/components/reactbits/SplitText";
import { useTheme } from "@/components/ThemeProvider";

const cards = [
  {
    lucide: FileText,
    title: "Exam Simulator",
    desc: "Generate and take AI-powered exams.",
    badge: "UNDER DEVELOPMENT",
    route: "/exam",
    image: "/exam.jpg",
    available: true,
  },
  {
    lucide: FileText,
    title: "Generate Presentations",
    desc: "Upload a PDF or text file and let AI build your presentation.",
    badge: null,
    route: "/generate/presentations",
    image: "/presentations.png",
    available: true,
  },
  {
    lucide: Brain,
    title: "Generate Quiz",
    desc: "Generate interactive quizzes from any topic or document.",
    badge: null,
    route: "/generate/quiz",
    image: "/quiz.jpg",
    available: true,
  },
  {
    lucide: GitBranch,
    title: "Aria — Your Learning Companion",
    desc: "Practice argumentation and critical thinking with an AI opponent.",
    badge: null,
    route: "/aria",
    image: "/chatbot.png",
    available: true,
  },
  {
    lucide: MessageSquare,
    title: "Tek-Up Navigator 3D",
    desc: "Create a presentation from a simple text description in seconds.",
    badge: "NOT AVAILABLE",
    route: "/generate/prompt",
    image: "/navigator.png",
    available: false,
  },
];

type ExpandingCard = {
  rect: DOMRect;
  card: typeof cards[0];
};

export default function CreationHub() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [animationKey, setAnimationKey] = useState(0);
  const [expanding, setExpanding] = useState<ExpandingCard | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setAnimationKey(p => p + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>, card: typeof cards[0]) => {
    if (!card.available) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setExpanding({ rect, card });
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── Card zoom to center overlay ── */}
      <AnimatePresence>
        {expanding && (() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const targetW = Math.min(520, vw * 0.9);
          const imgH = Math.round(targetW * 0.56); // 16:9-ish image
          const bodyH = 120;
          const targetH = imgH + bodyH;
          const targetLeft = (vw - targetW) / 2;
          const targetTop = Math.max(80, (vh - targetH) / 2);
          return (
            <motion.div
              className="fixed z-[999] overflow-hidden shadow-2xl bg-card border border-primary/40 flex flex-col"
              initial={{
                top: expanding.rect.top,
                left: expanding.rect.left,
                width: expanding.rect.width,
                height: expanding.rect.height,
                borderRadius: 16,
              }}
              animate={{
                top: targetTop,
                left: targetLeft,
                width: targetW,
                height: targetH,
                borderRadius: 24,
              }}
              transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}
              onAnimationComplete={() =>
                setTimeout(() => navigate(expanding.card.route), 700)
              }
            >
              {/* Image — takes most of the card */}
              <div className="w-full flex-shrink-0 relative overflow-hidden" style={{ height: imgH }}>
                <motion.img
                  src={expanding.card.image}
                  alt={expanding.card.title}
                  className="w-full h-full object-cover"
                  initial={{ scale: 1 }}
                  animate={{ scale: 1.06 }}
                  transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}
                />
                <div className="absolute inset-0 bg-black/10" />
                {expanding.card.badge ? (
                  <span className="absolute top-4 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/40">
                    {expanding.card.badge}
                  </span>
                ) : expanding.card.available && (
                  <span className="absolute top-4 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    AVAILABLE
                  </span>
                )}
              </div>

              {/* Card body — compact */}
              <div className="px-6 py-4 flex flex-col justify-center" style={{ height: bodyH }}>
                <h3 className="text-lg font-bold mb-1 text-primary">{expanding.card.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{expanding.card.desc}</p>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <LiquidEther mouseForce={20} cursorSize={100} autoDemo={true} colors={['#5227FF', '#FF9FFC', '#B19EEF']} />
        <div className={`absolute inset-0 backdrop-blur-[2px] ${isDark ? "bg-background/60" : "bg-background/80"}`} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            EduAI
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            <SplitText key={animationKey} text="What would you like to create?" delay={50} duration={1.25} />
          </h1>
          <p className="text-muted-foreground text-lg">
            Choose a tool to get started. More features coming soon.
          </p>        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8 relative z-10">
          {cards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              whileHover={card.available ? { y: -4, scale: 1.01 } : {}}
              onClick={(e) => handleCardClick(e, card)}
              className={`relative bg-card border border-border rounded-2xl p-6 group transition-all duration-200 ${
                !card.available
                  ? "opacity-70 cursor-not-allowed"
                  : "cursor-pointer hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
              }`}
            >
              <div className="w-full h-40 rounded-xl mb-5 relative overflow-hidden bg-muted">
                <img
                  src={card.image}
                  alt={card.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              </div>

              {card.badge && (
                <span className={`absolute -top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-md ${
                  card.badge === "UNDER DEVELOPMENT"
                    ? "bg-orange-500 text-white border-orange-400"
                    : "bg-red-500 text-white border-red-400"
                }`}>
                  {card.badge}
                </span>
              )}
              {card.available && !card.badge && (
                <span className="absolute -top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white border border-emerald-400 shadow-md">
                  AVAILABLE
                </span>
              )}

              <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* History & Stats */}
        <div className="flex gap-3 relative z-10">
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            onClick={() => navigate("/history")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card/60 backdrop-blur-sm text-sm font-medium hover:border-primary/40 hover:text-primary transition-all"
          >
            <History className="w-4 h-4" /> History
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            onClick={() => navigate("/stats")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card/60 backdrop-blur-sm text-sm font-medium hover:border-primary/40 hover:text-primary transition-all"
          >
            <BarChart3 className="w-4 h-4" /> Stats
          </motion.button>
        </div>
      </div>

    </div>
  );
}
