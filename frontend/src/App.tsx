import { useEffect, useState, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WelcomeSplash from "./components/WelcomeSplash";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "./components/Navbar";
import { ThemeProvider } from "./components/ThemeProvider";
import LandingPage from "./pages/LandingPage";

const CreationHub        = lazy(() => import("./pages/CreationHub"));
const Dashboard          = lazy(() => import("./pages/Dashboard"));
const GeneratePage       = lazy(() => import("./pages/GeneratePage"));
const PresentationsHub   = lazy(() => import("./pages/PresentationsHub"));
const HistoryPage        = lazy(() => import("./pages/HistoryPage"));
const NotFound           = lazy(() => import("./pages/NotFound"));
const QuizPage           = lazy(() => import("./pages/QuizPage"));
const DebatePage         = lazy(() => import("./pages/DebatePage"));
const ExamSimulatorPage  = lazy(() => import("./pages/ExamSimulatorPage"));
const ExamPromptConfig   = lazy(() => import("./pages/ExamPromptConfig"));
const AboutUs            = lazy(() => import("./pages/AboutUs"));
const ContactUs          = lazy(() => import("./pages/ContactUs"));
const Login              = lazy(() => import("./pages/Login"));
const PromptPage         = lazy(() => import("./pages/ComingSoon").then(m => ({ default: m.PromptPage })));

const queryClient = new QueryClient();

const LANDING_PATHS = new Set(["/", "/about", "/contact", "/login"]);

function AppShell() {
  const location = useLocation();
  const showNav = !LANDING_PATHS.has(location.pathname);
  return (
    <>
      {showNav && <Navbar />}
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
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
      </Suspense>
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