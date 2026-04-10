import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "./components/Navbar";
import LandingPage from "./pages/LandingPage";
import CreationHub from "./pages/CreationHub";
import Dashboard from "./pages/Dashboard.tsx";
import GeneratePage from "./pages/GeneratePage.tsx";
import HistoryPage from "./pages/HistoryPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import { PromptPage, QuizPage, DiagramPage } from "./pages/ComingSoon";
import ContactUs from "./pages/ContactUs";
import AboutUs from "./pages/AboutUs";
import { SplashScreen } from "./components/SplashScreen";
import { ThemeProvider } from "./components/ThemeProvider";
import { GlobalAssistant } from "./components/GlobalAssistant";

const queryClient = new QueryClient();

const App = () => {
  const [splashDone, setSplashDone] = useState(
    sessionStorage.getItem("splashSeen") === "true"
  );

  useEffect(() => {
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0 && (navEntries[0] as PerformanceNavigationTiming).type === "reload") {
      if (window.location.pathname !== "/") {
        window.location.replace("/");
      }
    }
  }, []);

  const handleSplashComplete = () => {
    setSplashDone(true);
    sessionStorage.setItem("splashSeen", "true");
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {!splashDone && <SplashScreen onComplete={handleSplashComplete} />}
          <BrowserRouter>
            <Navbar />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<CreationHub />} />
              <Route path="/stats" element={<Dashboard />} />
              <Route path="/generate_from_doc" element={<GeneratePage />} />
              <Route path="/generate/prompt" element={<PromptPage />} />
              <Route path="/generate/quiz" element={<QuizPage />} />
              <Route path="/generate/diagram" element={<DiagramPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <GlobalAssistant />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;