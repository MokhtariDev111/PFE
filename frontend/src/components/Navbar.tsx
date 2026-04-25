import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, ChevronLeft, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

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

        {/* Spacer */}
        <div className="flex-1" />

        {/* User badge + admin link + logout */}
        {user && (
          <div className="flex items-center gap-2">
            {user.is_admin && (
              <button
                onClick={() => navigate("/admin")}
                className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-400/20 transition-all"
                title="Admin dashboard"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </button>
            )}
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 hover:bg-secondary/70 transition-all"
              title="Edit profile"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white">
                  {getInitials(user.name)}
                </span>
              )}
              <span className="max-w-[120px] truncate text-xs font-medium">{user.name}</span>
            </button>
            <button
              onClick={() => { logout(); navigate("/login", { replace: true }); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>
    </motion.div>
  );
}
