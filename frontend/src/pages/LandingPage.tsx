import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { FeatureCards } from "@/components/landing/FeatureCards";
import { AnimatedProcess } from "@/components/landing/AnimatedProcess";
import { SocialProof } from "@/components/landing/SocialProof";
import { PanelPresentations } from "@/components/landing/StoryPanels/PanelPresentations";
import { PanelAria } from "@/components/landing/StoryPanels/PanelAria";
import { PanelQuiz } from "@/components/landing/StoryPanels/PanelQuiz";
import { PanelExam } from "@/components/landing/StoryPanels/PanelExam";
import { Vision } from "@/components/landing/Vision";

import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  const [nearBottom, setNearBottom] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      setNearBottom(scrolled >= total - 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <FeatureCards />
        <PanelPresentations />
        <PanelAria />
        <PanelQuiz />
        <PanelExam />
        <AnimatedProcess />
        <Vision />
        <SocialProof />
      </main>
      <Footer />

      <AnimatePresence>
        {nearBottom && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-8 right-8 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-aurora shadow-lg shadow-brand-violet/30 text-white hover:scale-110 transition-transform"
            aria-label="Back to top"
          >
            <ArrowUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
