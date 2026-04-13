import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, LayoutDashboard, History, BarChart3, FileText } from "lucide-react";

const navLinks = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/history", label: "History", icon: History },
  { path: "/stats", label: "Stats", icon: BarChart3 },
];

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide navbar on landing page — it has its own hero
  if (location.pathname === "/") return null;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const isQuizPage = location.pathname === "/generate/quiz";

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors duration-300 ${
        isQuizPage
          ? "bg-transparent border-transparent"
          : "bg-background/80 border-border/50"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
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
            <h1 className="font-bold text-base gradient-text leading-none">TEKUP AI</h1>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Learning Assistant</p>
          </div>
        </motion.div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ path, label, icon: Icon }) => (
            <Button
              key={path}
              variant={isActive(path) ? "default" : "ghost"}
              size="sm"
              onClick={() => navigate(path)}
              className={`gap-1.5 ${isActive(path) ? "launch-button" : ""}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Button>
          ))}
        </div>

        {/* Mobile */}
        <div className="md:hidden flex items-center gap-1">
          {navLinks.map(({ path, icon: Icon }) => (
            <Button
              key={path}
              size="sm"
              variant={isActive(path) ? "default" : "ghost"}
              onClick={() => navigate(path)}
            >
              <Icon className="w-4 h-4" />
            </Button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}