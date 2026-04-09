import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, MessageSquare, Brain, GitBranch, Clock, Sparkles } from "lucide-react";
import LiquidEther from "@/components/reactbits/LiquidEther";
import SplitText from "@/components/reactbits/SplitText";

const cards = [
  {
    icon: "🤖",
    lucide: MessageSquare,
    title: "Generate from Prompt",
    desc: "Create a presentation from a simple text description in seconds.",
    badge: null,
    route: "/generate/prompt",
    image: "/prompt.jpeg",
    available: false,
  },
  {
    icon: "📄",
    lucide: FileText,
    title: "Import from Document",
    desc: "Upload a PDF or text file and let AI build your presentation.",
    badge: null,
    route: "/generate_from_doc",
    image: "/doc.png",
    available: true,
  },
  {
    icon: "🧠",
    lucide: Brain,
    title: "Create a Quiz",
    desc: "Generate interactive quizzes from any topic or document.",
    badge: "COMING SOON",
    route: "/generate/quiz",
    image: "/quiz.jpg",
    available: false,
  },
  {
    icon: "📊",
    lucide: GitBranch,
    title: "Generate Diagrams",
    desc: "Visualize concepts, flows, and relationships automatically.",
    badge: "COMING SOON",
    route: "/generate/diagram",
    image: "/diagram.png",
    available: false,
  },
];

export default function CreationHub() {
  const navigate = useNavigate();
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationKey(prev => prev + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Background Effect */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <LiquidEther
          mouseForce={20}
          cursorSize={100}
          autoDemo={true}
          colors={['#5227FF', '#FF9FFC', '#B19EEF']}
        />
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" />
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
            TEKUP AI
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            <SplitText
              key={animationKey}
              text="What would you like to create?"
              delay={50}
              duration={1.25}
            />
          </h1>
          <p className="text-muted-foreground text-lg">
            Choose a tool to get started. More features coming soon.
          </p>
        </motion.div>

        {/* Creation cards grid (restored for performance) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-14 relative z-10">
          {cards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              whileHover={card.available ? { y: -4, scale: 1.01 } : {}}
              onClick={() => navigate(card.route)}
              className={`relative bg-card border border-border rounded-2xl p-6 cursor-pointer group transition-all duration-200 overflow-hidden ${!card.available ? "opacity-70" : "hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
                }`}
            >
              {/* Image thumbnail */}
              <div className="w-full h-40 rounded-xl mb-5 flex items-center justify-center relative overflow-hidden bg-muted">
                <img src={card.image} alt={card.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              </div>

              {/* Badge */}
              {card.badge && (
                <span className="absolute top-4 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/20">
                  {card.badge}
                </span>
              )}
              {card.available && (
                <span className="absolute top-4 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                  AVAILABLE
                </span>
              )}

              <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                {card.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.desc}</p>
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
}
