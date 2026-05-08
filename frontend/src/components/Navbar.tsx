import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogOut, ShieldCheck, GraduationCap, BookOpen, ScanFace } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Logo3D } from "@/components/Logo3D";
import { authHeaders } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";

const API = "http://127.0.0.1:8000";

function useFaceStatus(isStudent: boolean) {
  const [registeredAt, setRegisteredAt] = useState<string | null>(null);
  useEffect(() => {
    if (!isStudent) return;
    fetch(`${API}/student/face/status`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setRegisteredAt(d.face_registered_at ?? null))
      .catch(() => {});
  }, [isStudent]);

  const urgent = (() => {
    if (!registeredAt) return true;
    const next = new Date(registeredAt);
    next.setMonth(next.getMonth() + 1);
    return (next.getTime() - Date.now()) / 86400000 <= 7;
  })();

  return { registeredAt, urgent };
}

function RoleBadge({ role }: { role: UserRole }) {
  if (role === "admin") return null; // admin already shown by the shield button
  if (role === "teacher") return (
    <span className="flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
      <BookOpen className="w-3 h-3" /> Teacher
    </span>
  );
  return (
    <span className="flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
      <GraduationCap className="w-3 h-3" /> Student
    </span>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const isStudent = user?.role === "student";
  const { registeredAt, urgent } = useFaceStatus(isStudent);

  // Hide navbar on pages that have their own navbar
  const pagesWithOwnNav = ["/", "/about", "/contact", "/login"];
  if (pagesWithOwnNav.includes(location.pathname)) return null;

  const isQuizPage    = location.pathname === "/generate/quiz";
  const isAriaPage    = location.pathname === "/aria";
  const isGenPage     = location.pathname === "/generate_from_doc" || location.pathname === "/generate/presentations";
  const isImmersive   = isQuizPage || isAriaPage;
  const isSemiTransparent = isGenPage;

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors duration-300 ${
        isImmersive
          ? "bg-transparent border-transparent"
          : isSemiTransparent
          ? "bg-background/20 border-white/10"
          : "bg-background/80 border-border/50"
      }`}
    >
      <div className="w-full px-4 sm:px-6 py-3 flex items-center gap-2">

        {/* Logo — extreme left */}
        <div onClick={() => navigate("/")} className="cursor-pointer shrink-0">
          <Logo3D height={38} />
        </div>

        {/* Back / Forward arrows right after logo */}
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

        {/* Spacer */}
        <div className="flex-1" />

        {/* User badge + role badge + admin link + logout — extreme right */}
        {user && (
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => navigate("/admin")}
                className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-400/20 transition-all"
                title="Admin dashboard"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </button>
            )}
            {isStudent && (
              <button
                onClick={() => navigate("/face-registration")}
                title={registeredAt ? "Update face registration" : "Register your face for attendance"}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                  urgent
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                }`}
              >
                <ScanFace className="w-3.5 h-3.5" />
                {!registeredAt ? "Register Face" : urgent ? "Renew Face" : "Face ✓"}
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
              <RoleBadge role={user.role} />
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
