import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Book, Clock, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface PresentationStats {
  totalPresentations: number;
  totalSlides: number;
  avgGenerationTime: number;
  totalDiagrams: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PresentationStats>({
    totalPresentations: 0,
    totalSlides: 0,
    avgGenerationTime: 0,
    totalDiagrams: 0,
  });

  // Fetch history to calculate stats
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/history");
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  // Calculate stats whenever history updates
  useEffect(() => {
    if (history && Array.isArray(history) && history.length > 0) {
      const totalSlides = history.reduce(
        (sum, h) => sum + (h.num_slides || 0),
        0
      );
      const totalDiagrams = history.reduce(
        (sum, h) => sum + (h.num_diagrams || 0),
        0
      );
      const avgTime =
        history.length > 0
          ? (
              history.reduce((sum, h) => sum + (h.elapsed_seconds || 0), 0) /
              history.length
            ).toFixed(1)
          : 0;

      setStats({
        totalPresentations: history.length,
        totalSlides: totalSlides,
        avgGenerationTime: parseFloat(avgTime as string),
        totalDiagrams: totalDiagrams,
      });
    }
  }, [history]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[10%] w-[700px] h-[700px] bg-primary/4 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-accent/4 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[60%] w-[300px] h-[300px] bg-primary/3 rounded-full blur-[100px]" />
      </div>
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />

      {/* Content */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="relative z-10 px-6 pt-20 pb-12"
      >
        {/* Hero Section */}
        <motion.div
          variants={itemVariants}
          className="max-w-5xl mx-auto text-center mb-20"
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-4 gradient-text">
            TEKUP AI
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-foreground">
            Presentation Generator
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            Transform your documents into stunning, AI-powered presentations in
            seconds. Powered by advanced RAG technology and intelligent content
            extraction.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="launch-button"
              onClick={() => navigate("/generate")}
            >
              <Zap className="w-5 h-5" />
              Create Presentation
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/history")}
            >
              View Recent Presentations
            </Button>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={itemVariants} className="max-w-6xl mx-auto mb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: TrendingUp,
                label: "Presentations Created",
                value: stats.totalPresentations,
                color: "text-blue-500",
              },
              {
                icon: Book,
                label: "Total Slides",
                value: stats.totalSlides,
                color: "text-purple-500",
              },
              {
                icon: Clock,
                label: "Avg Generation Time",
                value: `${stats.avgGenerationTime}s`,
                color: "text-green-500",
              },
              {
                icon: Zap,
                label: "Diagrams Generated",
                value: stats.totalDiagrams,
                color: "text-yellow-500",
              },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={i}
                  variants={itemVariants}
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Card className="glass-card-hover h-full">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {stat.label}
                      </CardTitle>
                      <Icon className={`w-5 h-5 ${stat.color}`} />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stat.value}</div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {i === 3 ? "in all presentations" : "in all time"}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Features Section */}
        <motion.div variants={itemVariants} className="max-w-6xl mx-auto mb-20">
          <h2 className="text-3xl font-bold mb-12 text-center">
            Powerful Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                emoji: "⚡",
                title: "Lightning Fast",
                desc: "Generate full presentations in under 10 seconds",
              },
              {
                emoji: "📄",
                title: "Smart Upload",
                desc: "Support for PDFs, DOCX, TXT, and more",
              },
              {
                emoji: "📊",
                title: "Auto Diagrams",
                desc: "Intelligent Mermaid flowcharts & visualizations",
              },
              {
                emoji: "🎨",
                title: "Multiple Themes",
                desc: "Professional & modern design options",
              },
              {
                emoji: "🤖",
                title: "AI-Powered",
                desc: "Advanced RAG with hybrid retrieval",
              },
              {
                emoji: "🌍",
                title: "Multi-language",
                desc: "Support for English and French",
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Card className="glass-card-hover h-full cursor-pointer group">
                  <CardHeader>
                    <div className="text-5xl mb-3 group-hover:scale-110 transition-transform">
                      {feature.emoji}
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {feature.desc}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Recent Presentations */}
        {history && history.length > 0 && (
          <motion.div variants={itemVariants} className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold mb-8 text-center">
              Recent Presentations
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {history.slice(0, 3).map((presentation: any, i: number) => (
                <motion.div
                  key={i}
                  variants={itemVariants}
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Card className="glass-card-hover overflow-hidden cursor-pointer group">
                    <div className="h-32 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 backdrop-blur-sm">
                        <ArrowRight className="w-6 h-6 text-white" />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-white">
                          <div className="text-3xl font-bold">
                            {presentation.num_slides}
                          </div>
                          <p className="text-xs">Slides</p>
                        </div>
                      </div>
                    </div>

                    <CardHeader>
                      <CardTitle className="line-clamp-2 text-base">
                        {presentation.topic}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(
                          presentation.created_at
                        ).toLocaleDateString()}
                      </p>
                    </CardHeader>

                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Theme:</span>
                        <span className="font-medium">
                          {presentation.theme}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Generated in:</span>
                        <span className="font-medium">
                          {presentation.elapsed_seconds}s
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="w-full mt-4"
                        onClick={() =>
                          window.open(
                            `/view/${presentation.id}`,
                            "_blank"
                          )
                        }
                      >
                        View Presentation
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <div className="text-center mt-8">
              <Button
                variant="outline"
                onClick={() => navigate("/history")}
              >
                View All Presentations →
              </Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}