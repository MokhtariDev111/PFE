import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Brain, MessageSquare, Zap, Clock, TrendingUp, Book } from "lucide-react";
import { motion } from "framer-motion";

const API = "http://127.0.0.1:8000";

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <motion.div variants={item} whileHover={{ y: -3 }}>
      <Card className="glass-card-hover h-full">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className={`w-5 h-5 ${color}`} />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{value}</div>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data: presentations = [] } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      try { const r = await fetch(`${API}/history`); return r.ok ? r.json() : []; }
      catch { return []; }
    },
    staleTime: 30000,
  });

  const { data: quizData } = useQuery({
    queryKey: ["quiz-history"],
    queryFn: async () => {
      try { const r = await fetch(`${API}/quiz/history`); return r.ok ? r.json() : { quizzes: [] }; }
      catch { return { quizzes: [] }; }
    },
  });

  const { data: debateData } = useQuery({
    queryKey: ["debate-history"],
    queryFn: async () => {
      try { const r = await fetch(`${API}/debate/conversations`); return r.ok ? r.json() : { conversations: [] }; }
      catch { return { conversations: [] }; }
    },
  });

  const pres   = presentations as any[];
  const quizzes = (quizData as any)?.quizzes ?? [];
  const debates = (debateData as any)?.conversations ?? [];

  const totalSlides   = pres.reduce((s: number, p: any) => s + (p.num_slides || 0), 0);
  const totalQuestions = quizzes.reduce((s: number, q: any) => s + (q.total || 0), 0);
  const avgTime       = pres.length
    ? (pres.reduce((s: number, p: any) => s + (p.elapsed_seconds || 0), 0) / pres.length).toFixed(1)
    : 0;

  const SECTIONS = [
    {
      title: "Presentations",
      icon: FileText,
      color: "from-blue-500 via-purple-500 to-pink-500",
      stats: [
        { icon: TrendingUp, label: "Total Presentations", value: pres.length,  sub: "all time",          color: "text-blue-500" },
        { icon: Book,       label: "Total Slides",        value: totalSlides,  sub: "across all decks",  color: "text-purple-500" },
        { icon: Clock,      label: "Avg Generation Time", value: `${avgTime}s`, sub: "per presentation", color: "text-green-500" },
      ],
    },
    {
      title: "Quiz Generator",
      icon: Brain,
      color: "from-violet-500 via-purple-500 to-fuchsia-500",
      stats: [
        { icon: Brain, label: "Quizzes Generated", value: quizzes.length,  sub: "all time",           color: "text-violet-500" },
        { icon: Zap,   label: "Total Questions",   value: totalQuestions, sub: "across all quizzes", color: "text-fuchsia-500" },
      ],
    },
    {
      title: "AI Debate Partner (Aria)",
      icon: MessageSquare,
      color: "from-emerald-500 via-teal-500 to-cyan-500",
      stats: [
        { icon: MessageSquare, label: "Conversations", value: debates.length, sub: "all time", color: "text-emerald-500" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background relative">
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-10 pb-16">
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>

          <motion.div variants={item} className="mb-10">
            <h1 className="text-4xl font-bold gradient-text mb-1">Stats</h1>
            <p className="text-muted-foreground">Overview of everything you've created with EduAI</p>
          </motion.div>

          {SECTIONS.map((section, si) => (
            <motion.div key={si} variants={item} className="mb-10">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${section.color} flex items-center justify-center`}>
                  <section.icon className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.stats.map((s, i) => (
                  <StatCard key={i} {...s} />
                ))}
              </div>
            </motion.div>
          ))}

        </motion.div>
      </div>
    </div>
  );
}
