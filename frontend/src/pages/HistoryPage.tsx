import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Trash2, Calendar, Zap, Brain, MessageSquare, FileText } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";

const API = "http://127.0.0.1:8000";

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function EmptyState({ icon: Icon, label, action, actionLabel }: {
  icon: any; label: string; action: () => void; actionLabel: string;
}) {
  return (
    <Card className="glass-card flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <Icon className="w-12 h-12 mx-auto text-muted-foreground/20" />
        <p className="text-muted-foreground">{label}</p>
        <Button size="sm" className="launch-button" onClick={action}>{actionLabel}</Button>
      </div>
    </Card>
  );
}

export default function HistoryPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"presentations" | "quizzes" | "debates">("presentations");

  const { data: presentations = [], refetch: refetchPres } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      try { const r = await fetch(`${API}/history`); return r.ok ? r.json() : []; }
      catch { return []; }
    },
  });

  const { data: quizData } = useQuery({
    queryKey: ["quiz-history"],
    queryFn: async () => {
      try { const r = await fetch(`${API}/quiz/history`); return r.ok ? r.json() : { quizzes: [] }; }
      catch { return { quizzes: [] }; }
    },
  });
  const quizzes = (quizData as any)?.quizzes ?? [];

  const { data: debateData, refetch: refetchDebates } = useQuery({
    queryKey: ["debate-history"],
    queryFn: async () => {
      try { const r = await fetch(`${API}/debate/conversations`); return r.ok ? r.json() : { conversations: [] }; }
      catch { return { conversations: [] }; }
    },
  });
  const debates = (debateData as any)?.conversations ?? [];

  const clearPresentations = async () => {
    await fetch(`${API}/history`, { method: "DELETE" });
    toast({ title: "Presentation history cleared" });
    refetchPres();
  };

  const clearDebates = async () => {
    await fetch(`${API}/debate/conversations`, { method: "DELETE" });
    toast({ title: "Debate history cleared" });
    refetchDebates();
  };

  const TABS = [
    { key: "presentations" as const, label: "Presentations", icon: FileText,     count: (presentations as any[]).length },
    { key: "quizzes"       as const, label: "Quizzes",       icon: Brain,         count: quizzes.length },
    { key: "debates"       as const, label: "AI Debates",    icon: MessageSquare, count: debates.length },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background relative">
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-10 pb-16">
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.08 } } }}>

          <motion.div variants={item} className="mb-8">
            <h1 className="text-4xl font-bold gradient-text mb-1">History</h1>
            <p className="text-muted-foreground">All your generated content in one place</p>
          </motion.div>

          {/* Tabs */}
          <motion.div variants={item} className="flex gap-2 mb-8 flex-wrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  tab === t.key
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === t.key ? "bg-primary/20" : "bg-secondary"}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </motion.div>

          {/* Presentations */}
          {tab === "presentations" && (
            <motion.div variants={item} className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{(presentations as any[]).length} presentation{(presentations as any[]).length !== 1 ? "s" : ""}</p>
                {(presentations as any[]).length > 0 && (
                  <Button size="sm" variant="destructive" onClick={clearPresentations} className="gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Clear all
                  </Button>
                )}
              </div>
              {(presentations as any[]).length === 0 ? (
                <EmptyState icon={FileText} label="No presentations yet" action={() => navigate("/generate_from_doc")} actionLabel="Create one" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(presentations as any[]).map((p, i) => (
                    <motion.div key={i} variants={item} whileHover={{ y: -3 }}>
                      <Card className="glass-card-hover overflow-hidden h-full flex flex-col">
                        <div className="h-24 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
                          <div className="text-center text-white">
                            <div className="text-3xl font-bold">{p.num_slides}</div>
                            <p className="text-[11px] opacity-80">slides</p>
                          </div>
                        </div>
                        <CardHeader className="pb-2 flex-1">
                          <CardTitle className="text-sm line-clamp-2">{p.topic}</CardTitle>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                            <Calendar className="w-3 h-3" /> {new Date(p.created_at).toLocaleDateString()}
                            <span className="mx-1">·</span>
                            <Zap className="w-3 h-3" /> {p.elapsed_seconds}s
                          </p>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <Button size="sm" className="w-full gap-1.5" onClick={() => window.open(`/view/${p.id}`, "_blank")}>
                            <Eye className="w-3.5 h-3.5" /> View
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Quizzes */}
          {tab === "quizzes" && (
            <motion.div variants={item} className="space-y-4">
              <p className="text-sm text-muted-foreground">{quizzes.length} quiz{quizzes.length !== 1 ? "zes" : ""} generated</p>
              {quizzes.length === 0 ? (
                <EmptyState icon={Brain} label="No quizzes yet" action={() => navigate("/generate/quiz")} actionLabel="Create one" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {quizzes.map((q: any, i: number) => (
                    <motion.div key={i} variants={item} whileHover={{ y: -3 }}>
                      <Card className="glass-card h-full flex flex-col">
                        <div className="h-24 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center">
                          <div className="text-center text-white">
                            <div className="text-3xl font-bold">{q.total}</div>
                            <p className="text-[11px] opacity-80">questions</p>
                          </div>
                        </div>
                        <CardHeader className="pb-2 flex-1">
                          <CardTitle className="text-sm line-clamp-2">{q.topic}</CardTitle>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                            <Calendar className="w-3 h-3" />
                            {q.generated ? new Date(q.generated).toLocaleDateString() : "—"}
                          </p>
                        </CardHeader>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Debates */}
          {tab === "debates" && (
            <motion.div variants={item} className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{debates.length} conversation{debates.length !== 1 ? "s" : ""}</p>
                {debates.length > 0 && (
                  <Button size="sm" variant="destructive" onClick={clearDebates} className="gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Clear all
                  </Button>
                )}
              </div>
              {debates.length === 0 ? (
                <EmptyState icon={MessageSquare} label="No conversations yet" action={() => navigate("/aria")} actionLabel="Start one" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {debates.map((d: any, i: number) => (
                    <motion.div key={i} variants={item} whileHover={{ y: -3 }}>
                      <Card className="glass-card-hover h-full flex flex-col cursor-pointer" onClick={() => navigate("/aria")}>
                        <div className="h-24 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center">
                          <MessageSquare className="w-10 h-10 text-white/80" />
                        </div>
                        <CardHeader className="pb-2 flex-1">
                          <CardTitle className="text-sm line-clamp-2">{d.title}</CardTitle>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                            <Calendar className="w-3 h-3" />
                            {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : "—"}
                            <span className="mx-1">·</span>
                            <span className="capitalize">{d.mode} mode</span>
                          </p>
                        </CardHeader>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </motion.div>
      </div>
    </div>
  );
}
