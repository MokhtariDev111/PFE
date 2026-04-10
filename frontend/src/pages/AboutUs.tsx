import { motion } from "framer-motion";
import { Sparkles, Brain, FileText, Zap, BarChart3 } from "lucide-react";

export default function AboutUs() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 pt-24 pb-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            PFE Project — TEKUP 2026
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">About TEKUP AI</h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-8">
            TEKUP AI is a final-year engineering project (PFE) developed at TEKUP University.
            It is an AI-powered teaching assistant designed to help students and educators
            transform raw academic documents into structured, interactive learning materials.
          </p>
          <p className="text-muted-foreground text-lg leading-relaxed mb-12">
            The platform uses a Retrieval-Augmented Generation (RAG) pipeline backed by large
            language models to understand document content and generate high-quality outputs
            tailored for education.
          </p>

          <h2 className="text-2xl font-bold mb-6">What it does</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: FileText, title: "PDF to Presentation", desc: "Converts textbooks and documents into structured slide decks." },
              { icon: Brain, title: "Quiz Generation", desc: "Automatically generates MCQ and open-ended quizzes from any content." },
              { icon: Zap, title: "Flashcard Creator", desc: "Extracts key concepts and turns them into spaced-repetition flashcards." },
              { icon: BarChart3, title: "Diagram Generator", desc: "Visualizes relationships and processes as auto-generated diagrams." },
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="flex gap-4 p-5 rounded-2xl bg-card border border-border"
              >
                <div className="p-2 rounded-lg bg-primary/10 h-fit">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-muted-foreground text-sm">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
