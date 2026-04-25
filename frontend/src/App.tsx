import { useState, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WelcomeSplash from "./components/WelcomeSplash";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "./components/Navbar";
import { ThemeProvider } from "./components/ThemeProvider";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";
import { LoginWelcome } from "./components/LoginWelcome";
import LandingPage from "./pages/LandingPage";

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ProfilePage    = lazy(() => import("./pages/ProfilePage"));

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
      <LoginWelcome />
      {showNav && <Navbar />}
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/contact" element={<ContactUs />} />
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route path="/dashboard"              element={<ProtectedRoute><CreationHub /></ProtectedRoute>} />
          <Route path="/stats"                  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/generate/presentations" element={<ProtectedRoute><PresentationsHub /></ProtectedRoute>} />
          <Route path="/generate_from_doc"      element={<ProtectedRoute><GeneratePage /></ProtectedRoute>} />
          <Route path="/generate/prompt"        element={<ProtectedRoute><PromptPage /></ProtectedRoute>} />
          <Route path="/generate/quiz"          element={<ProtectedRoute><div className="dark"><QuizPage /></div></ProtectedRoute>} />
          <Route path="/aria"                   element={<ProtectedRoute><div className="dark"><DebatePage /></div></ProtectedRoute>} />
          <Route path="/exam"                   element={<ProtectedRoute><ExamSimulatorPage /></ProtectedRoute>} />
          <Route path="/exam/prompt"            element={<ProtectedRoute><ExamPromptConfig /></ProtectedRoute>} />
          <Route path="/history"                element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="/admin"                  element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/profile"               element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

const App = () => {
  const [splashDone, setSplashDone] = useState(true);

  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <AuthProvider>
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
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;