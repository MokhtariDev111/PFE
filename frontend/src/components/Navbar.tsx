import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, Home, History } from "lucide-react";

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50"
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <motion.div
          onClick={() => navigate("/")}
          className="flex items-center gap-2 cursor-pointer group"
          whileHover={{ scale: 1.05 }}
        >
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent group-hover:shadow-lg group-hover:shadow-primary/50 transition-shadow">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg gradient-text">TEKUP AI</h1>
            <p className="text-xs text-muted-foreground">Presentation Generator</p>
          </div>
        </motion.div>

        {/* Navigation Links */}
        <div className="hidden md:flex items-center gap-2">
          <Button
            variant={isActive("/") ? "default" : "ghost"}
            onClick={() => navigate("/")}
            className={isActive("/") ? "launch-button" : ""}
          >
            <Home className="w-4 h-4" />
            Home
          </Button>
          <Button
            variant={isActive("/generate") ? "default" : "ghost"}
            onClick={() => navigate("/generate")}
            className={isActive("/generate") ? "launch-button" : ""}
          >
            <Sparkles className="w-4 h-4" />
            Generate
          </Button>
          <Button
            variant={isActive("/history") ? "default" : "ghost"}
            onClick={() => navigate("/history")}
            className={isActive("/history") ? "launch-button" : ""}
          >
            <History className="w-4 h-4" />
            History
          </Button>
        </div>

        {/* Mobile Menu */}
        <div className="md:hidden flex items-center gap-2">
          <Button
            size="sm"
            variant={isActive("/generate") ? "default" : "ghost"}
            onClick={() => navigate("/generate")}
          >
            <Sparkles className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}