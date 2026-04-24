import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, MessageSquare } from "lucide-react";
import LiquidEther from "@/components/reactbits/LiquidEther";
import { useTheme } from "@/components/ThemeProvider";

const options = [
  {
    icon: FileText,
    title: "Generate from Document",
    desc: "Upload a PDF or text file and let AI build a structured presentation from your content.",
    image: "/doc.webp",
    route: "/generate_from_doc",
    available: true,
    badge: null,
  },
  {
    icon: MessageSquare,
    title: "Generate from Prompt",
    desc: "Describe your topic and let AI build a complete presentation for you.",
    image: "/prompt.jpeg",
    route: "/generate/prompt",
    available: false,
    badge: "NOT AVAILABLE",
  },
];

export default function PresentationsHub() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <LiquidEther mouseForce={20} cursorSize={100} autoDemo colors={["#5227FF", "#FF9FFC", "#B19EEF"]} />
        <div className={`absolute inset-0 backdrop-blur-[2px] ${isDark ? "bg-background/60" : "bg-background/80"}`} />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 pt-16 pb-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Generate Presentations</h1>
          <p className="text-muted-foreground text-lg">Choose how you want to create your presentation.</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {options.map((opt, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={opt.available ? { y: -4, scale: 1.01 } : {}}
              onClick={() => opt.available && navigate(opt.route)}
              className={`relative bg-card border border-border rounded-2xl p-6 group transition-all duration-200 overflow-hidden ${
                !opt.available
                  ? "opacity-60 cursor-not-allowed"
                  : "cursor-pointer hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
              }`}
            >
              <div className="w-full h-40 rounded-xl mb-5 relative overflow-hidden bg-muted">
                <img
                  src={opt.image}
                  alt={opt.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              </div>

              {opt.badge && (
                <span className="absolute top-4 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                  {opt.badge}
                </span>
              )}
              {opt.available && (
                <span className="absolute top-4 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                  AVAILABLE
                </span>
              )}

              <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{opt.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{opt.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
