import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";

export const ThemeToggle = () => {
  const { isDark, setTheme, theme } = useTheme();

  const toggle = () => setTheme(isDark ? "light" : "dark");

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative h-10 w-10 rounded-full border border-border/60 bg-background/40 backdrop-blur"
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ rotate: -90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 grid place-items-center"
          >
            <Moon className="h-4 w-4 text-brand-violet" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: -90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 grid place-items-center"
          >
            <Sun className="h-4 w-4 text-brand-rose" />
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
};
