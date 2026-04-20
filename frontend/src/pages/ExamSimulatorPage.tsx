import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";

const OPTIONS = [
  {
    title: "Generate from Prompt",
    desc: "Type a topic and let AI build a full exam instantly.",
    image: "/examprompt.png",
    route: "/exam/prompt",
  },
  {
    title: "Generate from PDF",
    desc: "Upload your course PDF and generate exam questions directly from it.",
    image: "/exampdf.png",
    route: "/exam/pdf",
  },
];

export default function ExamSimulatorPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Subtle background grid */}
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-12 pb-24">

        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </motion.button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            EXAM SIMULATOR
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            How do you want to generate your exam?
          </h1>
          <p className="text-muted-foreground text-lg">
            Choose a method to get started.
          </p>
        </motion.div>

        {/* Option cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {OPTIONS.map((opt, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => navigate(opt.route)}
              className="cursor-pointer bg-card border border-border rounded-2xl overflow-hidden group hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-200"
            >
              {/* Image */}
              <div className="w-full h-52 relative overflow-hidden bg-muted">
                <img
                  src={opt.image}
                  alt={opt.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              </div>

              {/* Body */}
              <div className="p-6">
                <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                  {opt.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {opt.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
}
