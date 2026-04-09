import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, MessageSquare, Brain, GitBranch, Clock, Sparkles } from "lucide-react";

const cards = [
  {
    icon: "🤖",
    lucide: MessageSquare,
    title: "Generate from Prompt",
    desc: "Create a presentation from a simple text description in seconds.",
    badge: null,
    route: "/generate/prompt",
    gradient: "from-violet-500 via-purple-500 to-indigo-500",
    available: false,
  },
  {
    icon: "📄",
    lucide: FileText,
    title: "Import from Document",
    desc: "Upload a PDF or text file and let AI build your presentation.",
    badge: null,
    route: "/generate",
    gradient: "from-blue-500 via-cyan-500 to-teal-500",
    available: true,
  },
  {
    icon: "🧠",
    lucide: Brain,
    title: "Create a Quiz",
    desc: "Generate interactive quizzes from any topic or document.",
    badge: "COMING SOON",
    route: "/generate/quiz",
    gradient: "from-amber-500 via-orange-500 to-red-500",
    available: false,
  },
  {
    icon: "📊",
    lucide: GitBranch,
    title: "Generate Diagrams",
    desc: "Visualize concepts, flows, and relationships automatically.",
    badge: "COMING SOON",
    route: "/generate/diagram",
    gradient: "from-emerald-500 via-green-500 to-teal-500",
    available: false,
  },
];

export default function CreationHub() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[5%] w-[500px] h-[500px] bg-primary/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[5%] w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px]" />
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
            What would you like to create?
          </h1>
          <p className="text-muted-foreground text-lg">
            Choose a tool to get started. More features coming soon.
          </p>
        </motion.div>

        {/* Creation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-14">
          {cards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              whileHover={card.available ? { y: -4, scale: 1.01 } : {}}
              onClick={() => navigate(card.route)}
              className={`relative bg-card border border-border rounded-2xl p-6 cursor-pointer group transition-all duration-200 overflow-hidden ${
                !card.available ? "opacity-70" : "hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
              }`}
            >
              {/* Gradient thumbnail */}
              <div className={`w-full h-32 rounded-xl bg-gradient-to-br ${card.gradient} mb-5 flex items-center justify-center relative overflow-hidden`}>
                <span className="text-5xl filter drop-shadow-lg">{card.icon}</span>
                <div className="absolute inset-0 bg-black/10" />
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

        {/* Recent section placeholder */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-2 mb-5">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-muted-foreground">Recent creations</h2>
          </div>
          <div
            className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground/50 text-sm"
            onClick={() => navigate("/history")}
            style={{ cursor: "pointer" }}
          >
            Your recent presentations will appear here.
            <br />
            <span className="text-primary/60 text-xs mt-1 block">Click to view history →</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
