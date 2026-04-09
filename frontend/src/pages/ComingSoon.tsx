import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: string;
}

export default function ComingSoon({ title, description, icon }: ComingSoonProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 max-w-md"
      >
        <div className="text-7xl mb-6">{icon}</div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-semibold mb-5">
          <Construction className="w-3.5 h-3.5" />
          COMING SOON
        </div>

        <h1 className="text-3xl font-bold mb-3">{title}</h1>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">{description}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium border border-border bg-card hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <button
            onClick={() => navigate("/generate")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
            }}
          >
            Try PDF → Presentation
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function PromptPage() {
  return (
    <ComingSoon
      icon="🤖"
      title="Generate from Prompt"
      description="Describe your topic and let AI build a complete presentation for you. This feature is currently in development."
    />
  );
}

export function QuizPage() {
  return (
    <ComingSoon
      icon="🧠"
      title="Quiz Generator"
      description="Automatically create quizzes and test questions from any document or topic. Coming soon."
    />
  );
}

export function DiagramPage() {
  return (
    <ComingSoon
      icon="📊"
      title="Diagram Generator"
      description="Visualize concepts, processes, and relationships with AI-generated diagrams. Coming soon."
    />
  );
}
