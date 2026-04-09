import { useEffect, useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HeroSection } from "@/components/HeroSection";
import { TabNav } from "@/components/TabNav";
import { GeneratePanel } from "@/components/GeneratePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { Particles } from "@/components/Particles";
import { SplashScreen } from "@/components/SplashScreen";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { CompletionBurst } from "@/components/CompletionBurst";
import { WelcomeModal } from "@/components/WelcomeModal";
import { HowItWorks } from "@/components/HowItWorks";
import { useAppState } from "@/hooks/useAppState";
import { AlertTriangle } from "lucide-react";

const Index = () => {
  const {
    activeTab, setActiveTab,
    slides, setSlides,
    history, setHistory,
    isGenerating,
    isStreaming,
    generationSteps,
    uploadedFiles, setUploadedFiles,
    searchQuery, setSearchQuery,
    simulateGeneration,
    htmlUrl,
    error,
    loadHistoryFromApi,
  } = useAppState();

  const [splashFinished, setSplashFinished] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [showBurst, setShowBurst] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const prevGenerating = useRef(false);

  useEffect(() => { loadHistoryFromApi(); }, [loadHistoryFromApi]);

  // Show welcome modal once after splash, only on first ever visit
  useEffect(() => {
    if (splashFinished) {
      const t = setTimeout(() => setShowWelcome(true), 600);
      return () => clearTimeout(t);
    }
  }, [splashFinished]);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
  };

  // Trigger burst when generation completes
  useEffect(() => {
    if (prevGenerating.current && !isGenerating && slides.length > 0) {
      setShowBurst(true);
      setTimeout(() => setShowBurst(false), 4000);
    }
    prevGenerating.current = isGenerating;
  }, [isGenerating, slides.length]);

  const handleToggleTheme = useCallback(() => {
    const el = document.documentElement;
    const nowDark = !el.classList.contains("dark");
    if (nowDark) el.classList.add("dark"); else el.classList.remove("dark");
    setIsDark(nowDark);
  }, []);

  return (
    <>
      {!splashFinished && <SplashScreen onComplete={() => setSplashFinished(true)} />}

      <CompletionBurst trigger={showBurst} onDone={() => setShowBurst(false)} />

      <AnimatePresence>
        {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}
      </AnimatePresence>

      <CommandPalette
        onTabChange={setActiveTab}
        onToggleTheme={handleToggleTheme}
        isDark={isDark}
      />

      <div className={`min-h-screen bg-background relative selection:bg-primary/25`}>
        <Particles />
        <ThemeToggle onThemeChange={setIsDark} />

        {/* Background orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[10%] w-[700px] h-[700px] bg-primary/4 rounded-full blur-[140px]" />
          <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-accent/4 rounded-full blur-[120px]" />
          <div className="absolute top-[40%] left-[60%] w-[300px] h-[300px] bg-primary/3 rounded-full blur-[100px]" />
        </div>
        <div className="fixed inset-0 dot-grid opacity-30 pointer-events-none z-0" />

        <div className="relative z-10 container max-w-5xl mx-auto px-4 py-6">
          <HeroSection />
          <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="mb-4 p-4 rounded-2xl bg-destructive/8 border border-destructive/25 text-destructive text-sm flex items-center gap-3"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* How it works — only on generate tab */}
          {activeTab === "generate" && <HowItWorks />}

          <AnimatePresence mode="wait">
            {activeTab === "generate" && (
              <GeneratePanel
                key="generate"
                uploadedFiles={uploadedFiles}
                setUploadedFiles={setUploadedFiles}
                isGenerating={isGenerating}
                generationSteps={generationSteps}
                onGenerate={simulateGeneration}
              />
            )}
            {activeTab === "preview" && (
              <PreviewPanel
                key="preview"
                slides={slides}
                isStreaming={isStreaming}
                htmlUrl={htmlUrl}
              />
            )}
            {activeTab === "history" && (
              <HistoryPanel
                key="history"
                history={history}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onDelete={(id) => setHistory(history.filter(h => h.id !== id))}
                onPreview={(item) => { setSlides(item.slides); setActiveTab("preview"); }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

export default Index;
