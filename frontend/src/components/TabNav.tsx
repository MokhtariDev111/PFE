import { motion } from "framer-motion";
import { Wand2, Eye, History } from "lucide-react";

interface TabNavProps {
  activeTab: string;
  onTabChange: (tab: "generate" | "preview" | "history") => void;
}

const tabs = [
  { value: "generate", label: "Generate", icon: Wand2 },
  { value: "preview", label: "Preview", icon: Eye },
  { value: "history", label: "History", icon: History },
] as const;

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="flex justify-center mb-8"
    >
      <div className="relative flex items-center gap-1 p-1.5 rounded-2xl bg-secondary/60 backdrop-blur-xl border border-glass-border">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => onTabChange(tab.value)}
              className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 z-10"
              style={{ color: isActive ? undefined : undefined }}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 gradient-primary rounded-xl"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <tab.icon
                className={`w-4 h-4 relative z-10 transition-colors ${isActive ? "text-white" : "text-muted-foreground"}`}
              />
              <span className={`relative z-10 transition-colors ${isActive ? "text-white" : "text-muted-foreground"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
