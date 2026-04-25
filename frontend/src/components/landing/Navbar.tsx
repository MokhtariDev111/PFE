import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, Sparkles, Menu, X, LogOut, LayoutDashboard, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/context/AuthContext";

const NAV_LINKS = [
  { label: "About",   href: "/about" },
  { label: "Contact", href: "/contact" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const Navbar = () => {
  const [scrolled,    setScrolled]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const { user, logout }              = useAuth();
  const navigate                      = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = () => {
    logout();
    setMobileOpen(false);
  };

  return (
    <>
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="fixed inset-x-0 top-0 z-50 transition-all duration-300 border-b border-border/60 bg-background/95 backdrop-blur-xl shadow-sm"
      >
        <div className="container flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="group flex items-center gap-2.5">
            <motion.span
              className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-aurora shadow-lg shadow-brand-violet/30"
              whileHover={{ scale: 1.08, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <GraduationCap className="h-4 w-4 text-white" strokeWidth={2.5} />
              <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-brand-cyan drop-shadow" />
            </motion.span>
            <span className="text-base font-semibold tracking-tight">EduAI</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link key={link.label} to={link.href}
                className="group relative rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                {link.label}
                <span className="absolute inset-x-3 bottom-1 h-px scale-x-0 bg-brand-violet/60 transition-transform group-hover:scale-x-100" />
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            {user ? (
              /* ── Logged-in state ── */
              <div className="hidden items-center gap-2 sm:flex">
                {user.is_admin && (
                  <motion.button
                    onClick={() => navigate("/admin")}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                    className="relative flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-gradient-to-r from-amber-400/20 to-orange-400/20 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 shadow-sm shadow-amber-400/20 hover:from-amber-400/35 hover:to-orange-400/35 hover:shadow-amber-400/40 transition-all"
                    title="Admin dashboard"
                  >
                    <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                    </span>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Admin
                  </motion.button>
                )}
                <button onClick={() => navigate("/profile")}
                  className="flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-3 py-1.5 text-sm font-medium hover:bg-secondary/70 transition-all">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name}
                      className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white">
                      {getInitials(user.name)}
                    </span>
                  )}
                  <span className="max-w-[100px] truncate">{user.name}</span>
                </button>
                <Button asChild size="sm"
                  className="hidden h-9 rounded-full bg-gradient-aurora px-4 text-xs font-medium text-white shadow-md sm:flex">
                  <Link to="/dashboard">
                    <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" />
                    Go to app
                  </Link>
                </Button>
                <button onClick={handleLogout}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
                  title="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              /* ── Guest state ── */
              <Button asChild size="sm"
                className="hidden h-9 rounded-full bg-gradient-aurora px-4 text-xs font-medium text-white shadow-md sm:flex">
                <Link to="/login">Log in</Link>
              </Button>
            )}

            {/* Mobile menu button */}
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <AnimatePresence mode="wait">
                {mobileOpen ? (
                  <motion.div key="x" initial={{ rotate: -90 }} animate={{ rotate: 0 }} exit={{ rotate: 90 }} transition={{ duration: 0.15 }}>
                    <X className="h-4 w-4" />
                  </motion.div>
                ) : (
                  <motion.div key="menu" initial={{ rotate: 90 }} animate={{ rotate: 0 }} exit={{ rotate: -90 }} transition={{ duration: 0.15 }}>
                    <Menu className="h-4 w-4" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-16 z-40 border-b border-border/60 bg-background/95 backdrop-blur-xl p-4 md:hidden"
          >
            {NAV_LINKS.map((link, i) => (
              <motion.div key={link.label} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to={link.href} onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  {link.label}
                </Link>
              </motion.div>
            ))}
            <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
              {user ? (
                <>
                  {user.is_admin && (
                    <Link to="/admin" onClick={() => setMobileOpen(false)}>
                      <Button size="sm" variant="outline"
                        className="w-full rounded-full border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-400 hover:bg-amber-400/20">
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Admin dashboard
                      </Button>
                    </Link>
                  )}
                  <Link to="/dashboard" onClick={() => setMobileOpen(false)}>
                    <Button size="sm" className="w-full rounded-full bg-gradient-aurora text-white">Go to app</Button>
                  </Link>
                  <button onClick={handleLogout}
                    className="w-full rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left">
                    Sign out
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={() => setMobileOpen(false)}>
                  <Button size="sm" className="w-full rounded-full bg-gradient-aurora text-white">Log in</Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
