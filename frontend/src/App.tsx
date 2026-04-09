import { useState } from "react";
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
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { PromptPage, QuizPage, DiagramPage } from "./pages/ComingSoon";
import { SplashScreen } from "./components/SplashScreen";

const queryClient = new QueryClient();

const App = () => {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<CreationHub />} />
            <Route path="/stats" element={<Dashboard />} />
            <Route path="/generate" element={<GeneratePage />} />
            <Route path="/generate/prompt" element={<PromptPage />} />
            <Route path="/generate/quiz" element={<QuizPage />} />
            <Route path="/generate/diagram" element={<DiagramPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/legacy" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;