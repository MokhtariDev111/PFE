import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Wand2, Eye, History, Moon, Sun, Zap, FileText, X } from "lucide-react";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  category: string;
}

interface CommandPaletteProps {
  onTabChange: (tab: "generate" | "preview" | "history") => void;
  onToggleTheme: () => void;
  isDark: boolean;
}

export function CommandPalette({ onTabChange, onToggleTheme, isDark }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    {
      id: "generate", label: "Go to Generate", description: "Create a new presentation",
      icon: <Wand2 className="w-4 h-4 text-primary" />, shortcut: "G",
      action: () => { onTabChange("generate"); setOpen(false); }, category: "Navigation"
    },
    {
      id: "preview", label: "Go to Preview", description: "Browse generated slides",
      icon: <Eye className="w-4 h-4 text-accent" />, shortcut: "P",
      action: () => { onTabChange("preview"); setOpen(false); }, category: "Navigation"
    },
    {
      id: "history", label: "Go to History", description: "View past presentations",
      icon: <History className="w-4 h-4 text-muted-foreground" />, shortcut: "H",
      action: () => { onTabChange("history"); setOpen(false); }, category: "Navigation"
    },
    {
      id: "theme", label: `Switch to ${isDark ? "Light" : "Dark"} Mode`,
      icon: isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-blue-400" />,
      action: () => { onToggleTheme(); setOpen(false); }, category: "Appearance"
    },
    {
      id: "docs", label: "Open Documentation", description: "View project README",
      icon: <FileText className="w-4 h-4 text-muted-foreground" />,
      action: () => { window.open("https://github.com/MokhtariDev111/edugenius-ai", "_blank"); setOpen(false); },
      category: "Help"
    },
  ];

  const filtered = query
    ? commands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  useEffect(() => { setSelected(0); }, [query]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(o => !o); }
    if (!open) return;
    if (e.key === "Escape") setOpen(false);
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(filtered.length - 1, s + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(0, s - 1)); }
    if (e.key === "Enter" && filtered[selected]) { filtered[selected].action(); }
  }, [open, filtered, selected]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); setQuery(""); setSelected(0); }
  }, [open]);

  const groups = filtered.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl glass-card border border-glass-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all shadow-lg group"
      >
        <Zap className="w-3.5 h-3.5 text-primary group-hover:animate-pulse" />
        <span>Command</span>
        <kbd className="ml-1 px-1.5 py-0.5 rounded-md bg-secondary text-[10px] font-mono border border-glass-border">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] bg-background/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -16 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[310] w-full max-w-lg"
            >
              <div className="glass-card border border-glass-border shadow-2xl overflow-hidden bg-card/95 backdrop-blur-xl">
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-glass-border">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Type a command..."
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  <X size={16} className="text-muted-foreground cursor-pointer" onClick={() => setOpen(false)} />
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {Object.entries(groups).map(([category, cmds]) => (
                    <div key={category}>
                      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest px-3 py-2">{category}</p>
                      {cmds.map((cmd) => {
                        const idx = filtered.indexOf(cmd);
                        return (
                          <button
                            key={cmd.id}
                            onClick={cmd.action}
                            onMouseEnter={() => setSelected(idx)}
                            className={`w-full flex items-center gap-4 px-3 py-2.5 rounded-xl text-left transition-all ${
                              selected === idx ? "bg-primary/10 border border-primary/20" : "hover:bg-secondary/40 border border-transparent"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-secondary/60 text-primary">{cmd.icon}</div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{cmd.label}</p>
                              {cmd.description && <p className="text-[11px] text-muted-foreground">{cmd.description}</p>}
                            </div>
                            {cmd.shortcut && (
                                <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-glass-border">{cmd.shortcut}</kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
