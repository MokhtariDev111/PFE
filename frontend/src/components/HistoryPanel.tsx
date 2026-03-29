import { motion } from "framer-motion";
import { Search, Eye, Trash2, Clock, Layers, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HistoryItem } from "@/hooks/useAppState";

interface HistoryPanelProps {
  history: HistoryItem[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onDelete: (id: string) => void;
  onPreview: (item: HistoryItem) => void;
}

export function HistoryPanel({ history, searchQuery, setSearchQuery, onDelete, onPreview }: HistoryPanelProps) {
  const filtered = history.filter(
    h =>
      h.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.prompt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-3xl mx-auto space-y-5"
    >
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
        <Input
          placeholder="Search presentations…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-11 bg-card/60 border-glass-border text-foreground placeholder:text-muted-foreground/50 h-11 rounded-xl focus:ring-2 focus:ring-primary/30 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {/* Stats bar */}
      {history.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="tag-muted">
            <Calendar className="w-3 h-3" />
            {filtered.length} presentation{filtered.length !== 1 ? "s" : ""}
          </span>
          {searchQuery && (
            <span className="text-xs text-muted-foreground">
              Filtered from {history.length} total
            </span>
          )}
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="font-semibold text-foreground/50">No presentations found</p>
            <p className="text-sm text-muted-foreground/40 mt-1">
              {searchQuery ? "Try a different search term" : "Generate your first presentation"}
            </p>
          </motion.div>
        ) : (
          filtered.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass-card-hover p-5 group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground truncate text-base leading-tight mb-1">{item.topic}</h4>
                  <p className="text-sm text-muted-foreground line-clamp-1 font-light">{item.prompt}</p>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <span className="tag-muted">
                      <Clock className="w-3 h-3" />
                      {formatDate(item.createdAt)}
                    </span>
                    <span className="tag-muted">
                      <Layers className="w-3 h-3" />
                      {item.slides.length} slides
                    </span>
                    {item.htmlUrl && (
                      <button 
                        onClick={() => window.open(`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}${item.htmlUrl}`, "_blank")}
                        className="tag-accent hover:scale-105 transition-transform cursor-pointer border-0"
                      >
                         Open Presentation
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => onPreview(item)}
                    className="h-8 w-8 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10"
                    title="Quick Preview"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => onDelete(item.id)}
                    className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}
