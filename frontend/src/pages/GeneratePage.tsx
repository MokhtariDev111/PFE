import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LiquidEther from "@/components/reactbits/LiquidEther";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Upload, Zap, Eye, X, Check, ArrowRight, Settings, GripVertical, Lock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface Slide {
  index: number;
  title: string;
  bullets: (string | { text: string; source_id?: string })[];
  slideType: string;
}

interface GenerationStatus {
  step: string;
  message: string;
}

export default function GeneratePage() {
  const { toast } = useToast();
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  // Form state
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [theme, setTheme] = useState("Dark Navy");
  const [maxSlides, setMaxSlides] = useState(20);
  const [language, setLanguage] = useState("English");

  // Generation state
  const [isLoading, setIsLoading] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState("");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);

  // Reorder state
  const [orderedSlides, setOrderedSlides] = useState<Slide[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const dragIdx = useRef<number | null>(null);

  // Sync orderedSlides when slides change
  useEffect(() => { setOrderedSlides(slides); }, [slides]);

  const isLocked = (slide: Slide) =>
    slide.slideType === "title" || slide.slideType === "intro" || slide.slideType === "summary";

  const handleDragStart = (i: number) => { dragIdx.current = i; };
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === i) return;
    // Don't allow dragging over locked slides
    if (isLocked(orderedSlides[i])) return;
    const next = [...orderedSlides];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    dragIdx.current = i;
    setOrderedSlides(next);
  };

  const handleConfirmOrder = useCallback(async () => {
    if (!sessionId) return;
    setIsReordering(true);
    // Map orderedSlides back to original indices (handles deletions too)
    const order = orderedSlides.map(s => slides.indexOf(s)).filter(i => i !== -1);
    try {
      const res = await fetch(`http://127.0.0.1:8000/reorder/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Reorder failed");
      window.open(`http://127.0.0.1:8000/view/${sessionId}`, "_blank");
    } catch {
      toast({ title: "Error", description: "Could not apply changes", variant: "destructive" });
    } finally {
      setIsReordering(false);
    }
  }, [sessionId, orderedSlides, slides, toast]);

  // Fetch available themes
  useEffect(() => {
    fetch("http://127.0.0.1:8000/themes")
      .then((r) => r.json())
      .then(setThemes)
      .catch(() => setThemes(["Dark Navy", "Modern", "Minimalist"]));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSlides([]);
    setOrderedSlides([]);
    setProgress(0);
    setSessionId("");

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("theme", theme);
    formData.append("max_slides", maxSlides.toString());
    formData.append("language", language);

    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/generate-stream",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const lines = message.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr += line.slice(6);
            }
          }

          if (dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (eventType === "status") {
                setGenerationStatus(data);
                const stepProgress: { [key: string]: number } = {
                  ingesting: 15,
                  indexing: 30,
                  retrieving: 50,
                  generating: 70,
                  rendering: 95,
                };
                setProgress(stepProgress[data.step] || 0);
              } else if (eventType === "slide") {
                setSlides((prev) => [...prev, data]);
              } else if (eventType === "done") {
                setSessionId(data.session_id);
                setProgress(100);
                toast({
                  title: "Success! 🎉",
                  description: `Presentation ready with ${data.num_slides} slides`,
                });
              } else if (eventType === "error") {
                toast({
                  title: "Generation Error",
                  description: data.detail || "Unknown error occurred",
                  variant: "destructive",
                });
              }
            } catch (e) {
              console.error("Error parsing event:", eventType, e);
            }
          }

          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Generation failed",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
    <div className="h-[calc(100vh-65px)] bg-background relative flex overflow-hidden">
      {/* Background Effect */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <LiquidEther
          mouseForce={20}
          cursorSize={100}
          autoDemo={true}
          colors={['#5227FF', '#FF9FFC', '#B19EEF']}
        />
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" />
      </div>

      {/* Settings Sidebar */}
      <motion.div
        initial={false}
        animate={{
          width: isSettingsOpen ? 320 : 0,
          opacity: isSettingsOpen ? 1 : 0
        }}
        className="h-full shrink-0 bg-card/80 backdrop-blur-xl border-r border-border/50 overflow-y-auto relative z-20 flex flex-col"
      >
        <div className="p-6 lg:pt-12 min-w-[320px]">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Settings
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-6">
            {/* Theme */}
            <div>
              <label className="text-sm font-medium block mb-2">Theme</label>
              <Select value={theme} onValueChange={setTheme} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max Slides */}
            <div>
              <label className="text-sm font-medium block mb-2">
                Max slides: <span className="text-primary font-bold">{maxSlides}</span>
              </label>
              <Slider
                value={[maxSlides]}
                onValueChange={(v) => setMaxSlides(v[0])}
                min={5}
                max={20}
                step={1}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-2">
                AI picks the best count — won't exceed this
              </p>
            </div>

            {/* Language */}
            <div>
              <label className="text-sm font-medium block mb-2">Language</label>
              <Select value={language} onValueChange={setLanguage} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">🇬🇧 English</SelectItem>
                  <SelectItem value="French">🇫🇷 French</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 h-full overflow-y-auto relative z-10 transition-all">
        {/* Settings Toggle */}
        <AnimatePresence>
          {!isSettingsOpen && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute left-6 top-10 z-30"
            >
              <Button variant="secondary" size="icon" className="shadow-lg border border-border" onClick={() => setIsSettingsOpen(true)}>
                <Settings className="w-5 h-5 text-primary" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className={`grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto py-6 lg:py-12 px-6 lg:px-12 transition-all ${!isSettingsOpen && "pl-20"}`}
        >
          {/* Left Panel: Input */}
          <motion.div variants={itemVariants} className="space-y-6 flex flex-col">
            <div>
              <h1 className="text-4xl font-bold mb-2 gradient-text">
                Generate Presentation
              </h1>
              <p className="text-muted-foreground">
                Create stunning presentations from documents or topics
              </p>
            </div>

            {/* Topic Input */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">📝 Topic</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="e.g., Machine Learning fundamentals, Ancient Rome history, Climate change..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isLoading}
                  className="min-h-24 resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {prompt.length}/200 characters
                </p>
              </CardContent>
            </Card>

            {/* File Upload */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">📎 Documents (Optional)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  onClick={() => !isLoading && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${isLoading
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-secondary/50 border-primary/30 hover:border-primary/60"
                    }`}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to upload</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOCX, TXT (up to 100MB)
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  disabled={isLoading}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt"
                />

                {/* File List */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Check className="w-4 h-4 text-green-500 shrink-0" />
                          <span className="text-sm truncate">{file.name}</span>
                        </div>
                        <button
                          onClick={() => removeFile(i)}
                          disabled={isLoading}
                          className="ml-2 p-1 hover:bg-secondary rounded disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex-1" /> {/* Flex spacer to push button down */}

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
              className="launch-button w-full"
              size="lg"
            >
              <Zap className="w-5 h-5" />
              {isLoading ? "Generating..." : "Generate Presentation"}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </motion.div>

          {/* Right Panel: Preview & Status */}
          <motion.div variants={itemVariants} className="space-y-6 flex flex-col h-full">
            <div>
              <h2 className="text-3xl font-bold mb-2">Preview</h2>
              <p className="text-muted-foreground">
                Your slides will appear here as they're generated
              </p>
            </div>

            {/* Status Section */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Progress Bar */}
                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium">
                        {generationStatus?.message || "Initializing..."}
                      </span>
                      <span className="text-xs text-muted-foreground">{progress}%</span>
                    </div>
                    <div className="progress-track">
                      <motion.div
                        className="progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Generation Steps */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-sm">Generation Progress</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { step: "ingesting", label: "📄 Analyzing documents" },
                      { step: "indexing", label: "🗂️ Building index" },
                      { step: "retrieving", label: "🔍 Retrieving context" },
                      { step: "generating", label: "✨ Generating slides" },
                      { step: "rendering", label: "🎨 Rendering HTML" },
                    ].map((item) => {
                      const isDone = progress >= {
                        ingesting: 15,
                        indexing: 30,
                        retrieving: 50,
                        generating: 70,
                        rendering: 95,
                      }[item.step] || 0;

                      return (
                        <div
                          key={item.step}
                          className={`flex items-center gap-3 p-2 rounded transition ${isDone ? "text-primary" : "text-muted-foreground"
                            }`}
                        >
                          {isDone ? (
                            <Check className="w-5 h-5 text-green-500" />
                          ) : (
                            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          )}
                          <span className="text-sm">{item.label}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Slide Reorder / Preview */}
            {orderedSlides.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {orderedSlides.length} slides generated
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Drag to reorder · locked slides can't be moved
                    </p>
                  </div>
                </div>

                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {orderedSlides.map((slide, i) => {
                    const locked = isLocked(slide);
                    return (
                      <div
                        key={`${slide.title}-${i}`}
                        draggable={!locked}
                        onDragStart={() => !locked && handleDragStart(i)}
                        onDragOver={(e) => !locked && handleDragOver(e, i)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          locked
                            ? "bg-muted/40 border-border/30 opacity-70 cursor-not-allowed"
                            : "bg-card border-border hover:border-primary/40 cursor-grab active:cursor-grabbing hover:shadow-sm"
                        }`}
                      >
                        <div className="flex-shrink-0 text-muted-foreground">
                          {locked
                            ? <Lock className="w-4 h-4" />
                            : <GripVertical className="w-4 h-4" />}
                        </div>
                        <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{slide.title || "Untitled"}</p>
                          <p className="text-xs text-muted-foreground capitalize">{slide.slideType}</p>
                        </div>
                        {locked && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            LOCKED
                          </span>
                        )}
                        {!locked && (
                          <button
                            onClick={() => setOrderedSlides(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                            title="Remove slide"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  className="launch-button w-full"
                  size="lg"
                  onClick={handleConfirmOrder}
                  disabled={isReordering || !sessionId}
                >
                  <Eye className="w-5 h-5" />
                  {isReordering ? "Rendering..." : "Confirm Order & View"}
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </motion.div>
            )}

            {/* Empty State */}
            {!isLoading && slides.length === 0 && (
              <Card className="glass-card flex-1 flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                  <Eye className="w-16 h-16 mx-auto text-muted-foreground/30" />
                  <div>
                    <p className="text-lg font-medium text-muted-foreground">
                      No slides yet
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Fill in the form and click generate to create your presentation
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}