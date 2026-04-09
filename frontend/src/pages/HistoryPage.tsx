import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Eye, Trash2, Calendar, Zap } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";

interface Presentation {
  id: string;
  topic: string;
  num_slides: number;
  num_diagrams: number;
  elapsed_seconds: number;
  theme: string;
  created_at: string;
}

export default function HistoryPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: presentations = [], refetch, isLoading } = useQuery({
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
  });

  const handleDelete = async () => {
    try {
      await fetch("http://127.0.0.1:8000/history", { method: "DELETE" });
      toast({ title: "Success", description: "Cleared history" });
      refetch();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete history",
        variant: "destructive",
      });
    }
  };

  const handleView = (id: string) => {
    window.open(`/view/${id}`, "_blank");
  };

  const handleDownload = (id: string) => {
    // TODO: Implement download functionality
    toast({ title: "Coming soon", description: "Download feature coming soon" });
  };

  const filteredPresentations = presentations.filter((p: Presentation) =>
    p.topic.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="min-h-screen bg-gradient-to-br from-background via-card/50 to-background relative overflow-hidden p-6"
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[10%] w-[700px] h-[700px] bg-primary/4 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-accent/4 rounded-full blur-[120px]" />
      </div>
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none z-0" />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-12">
          <h1 className="text-4xl font-bold mb-2 gradient-text">
            Presentation History
          </h1>
          <p className="text-muted-foreground">
            View and manage all your generated presentations
          </p>
        </motion.div>

        {/* Search Bar & Actions */}
        <motion.div variants={itemVariants} className="mb-8 flex gap-4">
          <input
            type="text"
            placeholder="Search presentations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-3 rounded-lg bg-card border border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {presentations.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="h-auto px-6"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear History
            </Button>
          )}
        </motion.div>

        {/* Content */}
        {isLoading ? (
          <motion.div variants={itemVariants} className="text-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground mt-4">Loading presentations...</p>
          </motion.div>
        ) : filteredPresentations.length === 0 ? (
          <motion.div variants={itemVariants}>
            <Card className="glass-card h-96 flex items-center justify-center">
              <div className="text-center space-y-4">
                <Eye className="w-16 h-16 mx-auto text-muted-foreground/30" />
                <div>
                  <p className="text-lg font-medium text-muted-foreground">
                    No presentations yet
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 mb-6">
                    Create your first presentation to get started
                  </p>
                  <Button
                    className="launch-button"
                    onClick={() => navigate("/generate_from_doc")}
                  >
                    Create Presentation
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <>
            {/* Grid */}
            <motion.div
              variants={containerVariants}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
            >
              {filteredPresentations.map((p: Presentation, i: number) => (
                <motion.div
                  key={i}
                  variants={itemVariants}
                  whileHover={{ y: -4 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Card className="glass-card-hover overflow-hidden h-full flex flex-col">
                    {/* Thumbnail */}
                    <div className="h-32 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 relative overflow-hidden group">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-white">
                          <div className="text-4xl font-bold">{p.num_slides}</div>
                          <p className="text-xs">Slides</p>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Eye className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    {/* Content */}
                    <CardHeader className="flex-1">
                      <CardTitle className="line-clamp-2 text-base">
                        {p.topic}
                      </CardTitle>
                      <div className="space-y-2 mt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {new Date(p.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          {p.elapsed_seconds}s generation time
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Theme</p>
                          <p className="font-medium">{p.theme}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Diagrams</p>
                          <p className="font-medium">{p.num_diagrams}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleView(p.id)}
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(p.id)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>

            {/* Back Button */}
            {presentations.length > 0 && (
              <motion.div variants={itemVariants} className="flex justify-end mt-4">
                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                >
                  ← Back to Home
                </Button>
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}