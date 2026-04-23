import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide navbar on pages that have their own navbar
  const pagesWithOwnNav = ["/", "/about", "/contact", "/login"];
  if (pagesWithOwnNav.includes(location.pathname)) return null;

  const isQuizPage = location.pathname === "/generate/quiz";
  const isAriaPage = location.pathname === "/aria";
  const isImmersive = isQuizPage || isAriaPage;

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors duration-300 ${
        isImmersive
          ? "bg-transparent border-transparent"
          : "bg-background/80 border-border/50"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">

        {/* Back / Forward arrows */}
        <button
          onClick={() => window.history.back()}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
          title="Go back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => window.history.forward()}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
          title="Go forward"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Logo */}
        <motion.div
          onClick={() => navigate("/")}
          className="flex items-center gap-2 cursor-pointer group"
          whileHover={{ scale: 1.04 }}
        >
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-accent group-hover:shadow-lg group-hover:shadow-primary/40 transition-shadow">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base gradient-text leading-none">EduAI</h1>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Learning Assistant</p>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
