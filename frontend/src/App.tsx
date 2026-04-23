import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WelcomeSplash from "./components/WelcomeSplash";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "./components/Navbar";
import LandingPage from "./pages/LandingPage";
import CreationHub from "./pages/CreationHub";
import Dashboard from "./pages/Dashboard.tsx";
import GeneratePage from "./pages/GeneratePage.tsx";
import PresentationsHub from "./pages/PresentationsHub";
import HistoryPage from "./pages/HistoryPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import { PromptPage } from "./pages/ComingSoon";
import QuizPage from "./pages/QuizPage";
import DebatePage from "./pages/DebatePage";
import ExamSimulatorPage from "./pages/ExamSimulatorPage";
import ExamPromptConfig from "./pages/ExamPromptConfig";
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";
import Login from "./pages/Login";
import { ThemeProvider } from "./components/ThemeProvider";

const queryClient = new QueryClient();

const LANDING_PATHS = new Set(["/", "/about", "/contact", "/login"]);

function AppShell() {
  const location = useLocation();
  const showNav = !LANDING_PATHS.has(location.pathname);
  return (
    <>
      {showNav && <Navbar />}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<CreationHub />} />
        <Route path="/stats" element={<Dashboard />} />
        <Route path="/generate/presentations" element={<PresentationsHub />} />
        <Route path="/generate_from_doc" element={<GeneratePage />} />
        <Route path="/generate/prompt" element={<PromptPage />} />
        <Route path="/generate/quiz" element={<div className="dark"><QuizPage /></div>} />
        <Route path="/aria" element={<div className="dark"><DebatePage /></div>} />
        <Route path="/exam" element={<ExamSimulatorPage />} />
        <Route path="/exam/prompt" element={<ExamPromptConfig />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => {
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0 && (navEntries[0] as PerformanceNavigationTiming).type === "reload") {
      if (window.location.pathname !== "/") {
        window.location.replace("/");
      }
    }
  }, []);

  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      {!splashDone && <WelcomeSplash onDone={() => setSplashDone(true)} />}
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;