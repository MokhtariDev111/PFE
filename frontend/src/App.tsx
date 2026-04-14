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
import { PromptPage, DiagramPage } from "./pages/ComingSoon";
import QuizPage from "./pages/QuizPage";
import DebatePage from "./pages/DebatePage";
import ContactUs from "./pages/ContactUs";
import AboutUs from "./pages/AboutUs";
import { ThemeProvider } from "./components/ThemeProvider";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0 && (navEntries[0] as PerformanceNavigationTiming).type === "reload") {
      if (window.location.pathname !== "/") {
        window.location.replace("/");
      }
    }
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Navbar />
            <Routes>              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<CreationHub />} />
              <Route path="/stats" element={<Dashboard />} />
              <Route path="/generate_from_doc" element={<GeneratePage />} />
              <Route path="/generate/prompt" element={<PromptPage />} />
              <Route path="/generate/quiz" element={<QuizPage />} />
              <Route path="/aria" element={<DebatePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;