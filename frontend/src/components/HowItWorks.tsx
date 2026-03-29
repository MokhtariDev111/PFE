import { motion, AnimatePresence } from "framer-motion";
import { Upload, Brain, Presentation, ChevronDown } from "lucide-react";
import { useState } from "react";

const STEPS = [
  { icon: Upload, label: "Upload Docs", desc: "PDF, TXT, Images", color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  { icon: Brain,  label: "AI Processes", desc: "RAG + Ollama LLM",  color: "text-accent",  bg: "bg-accent/10 border-accent/20"  },
  { icon: Presentation, label: "Get Slides", desc: "PPTX + Diagrams", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
];

export function HowItWorks() {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-5 overflow-hidden"
      >
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">How it works</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setCollapsed(c => !c)} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-4 h-4" />
                </motion.div>
              </button>
              <button onClick={() => setDismissed(true)} className="text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors px-2 py-0.5 rounded-lg hover:bg-secondary/50">
                Dismiss
              </button>
            </div>
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 sm:gap-4">
                  {STEPS.map(({ icon: Icon, label, desc, color, bg }, i) => (
                    <div key={label} className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex flex-col items-center text-center gap-2 flex-1 min-w-0"
                      >
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${bg}`}>
                          <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{label}</p>
                          <p className="text-[10px] text-muted-foreground/60 truncate">{desc}</p>
                        </div>
                      </motion.div>
                      {i < STEPS.length - 1 && (
                        <motion.div
                          initial={{ opacity: 0, scaleX: 0 }}
                          animate={{ opacity: 1, scaleX: 1 }}
                          transition={{ delay: i * 0.1 + 0.15 }}
                          className="shrink-0 origin-left"
                        >
                          <div className="flex items-center gap-0.5">
                            <div className="w-4 sm:w-8 h-px gradient-primary opacity-50" />
                            <div className="w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-primary/50" />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
