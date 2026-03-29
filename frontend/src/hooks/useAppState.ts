import { useState, useCallback } from "react";
import {
  generatePresentationStream,
  fetchHistory,
  clearAllHistory,
  type HistoryRecord,
  type GenerateOptions,
} from "@/lib/api";

export interface Slide {
  id: number;
  title: string;
  bullets: any[];
  speakerNotes: string;
  diagram?: string | null;
  slideType?: string;
  qualityScore?: number;
  qualityFeedback?: string;
  image_id?: string | null;
}

export interface HistoryItem {
  id: string;
  topic: string;
  prompt: string;
  slides: Slide[];
  createdAt: Date;
  htmlUrl?: string;
}

export interface GenerationStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

export function useAppState() {
  const [activeTab, setActiveTab] = useState<"generate" | "preview" | "history">("generate");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (opts: GenerateOptions) => {
      setIsGenerating(true);
      setIsStreaming(true);
      setError(null);
      setSlides([]);
      setHtmlUrl(null);

      const initSteps: GenerationStep[] = [
        { id: "ingesting",  label: "Analyzing Knowledge Base…",       status: "pending" },
        { id: "indexing",   label: "Building Knowledge Index…",         status: "pending" },
        { id: "retrieving", label: "Retrieving Relevant Context…",      status: "pending" },
        { id: "generating", label: "Generating Interactive Slides…",    status: "pending" },
        { id: "finalizing", label: "Finalizing Presentation Rendering…", status: "pending" },
      ];
      setGenerationSteps(initSteps);

      const markStep = (step: string, status: "active" | "done") => {
        setGenerationSteps(prev =>
          prev.map(s => {
            if (s.id === step) return { ...s, status };
            if (status === "active") {
              const ids = ["ingesting", "indexing", "retrieving", "generating", "finalizing"];
              if (ids.indexOf(s.id) < ids.indexOf(step)) return { ...s, status: "done" };
            }
            return s;
          })
        );
      };

      const streamedSlides: Slide[] = [];

      await generatePresentationStream(
        { ...opts, files: uploadedFiles },
        (e) => {
          markStep(e.step, "active");
          if (e.step === "generating") setActiveTab("preview");
        },
        (e) => {
          const newSlide: Slide = {
            id:           e.id,
            title:        e.title,
            bullets:      e.bullets,
            speakerNotes: e.speakerNotes,
            diagram:      e.diagram,
            slideType:    e.slideType,
            image_id:     e.image_id,
          };
          streamedSlides.push(newSlide);
          setSlides(prev => [...prev, newSlide]);
        },
        (e) => {
          setSlides(prev => prev.map((s, i) => i === e.slide_index ? { ...s, diagram: e.diagram } : s));
        },
        (e) => {
          setCurrentSessionId(e.session_id);
          setHtmlUrl(e.html_url);
          setGenerationSteps(prev => prev.map(s => ({ ...s, status: "done" })));
          
          const histItem: HistoryItem = {
            id:        e.session_id,
            topic:     e.topic,
            prompt:    opts.prompt,
            slides:    [...streamedSlides],
            createdAt: new Date(),
            htmlUrl:   e.html_url,
          };
          setHistory(prev => [histItem, ...prev]);
        },
        (msg) => {
          setError(`Generation failed: ${msg}`);
          setGenerationSteps(prev => prev.map(s => s.status === "active" ? { ...s, status: "pending" } : s));
        },
      );

      setIsGenerating(false);
      setIsStreaming(false);
    },
    [uploadedFiles, setActiveTab]
  );

  const loadHistoryFromApi = useCallback(async () => {
    try {
      const records = await fetchHistory();
      const mapped: HistoryItem[] = records.map(r => ({
        id: r.id,
        topic: r.topic,
        prompt: r.prompt,
        slides: r.slides || [],
        createdAt: new Date(r.created_at),
        htmlUrl: r.html_url,
      }));
      setHistory(mapped);
    } catch (e) {
      console.warn("Could not load history", e);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    await clearAllHistory();
    setHistory([]);
  }, []);

  const simulateGeneration = useCallback(
    (topic: string, prompt: string, options?: any) => {
      void generate({
        prompt,
        theme: options?.theme,
        language: options?.language,
        numSlides: options?.numSlides ?? 5,
        usePdfImages: options?.usePdfImages,
      });
    },
    [generate]
  );

  return {
    activeTab, setActiveTab,
    slides, setSlides,
    history, setHistory,
    isGenerating,
    isStreaming,
    generationSteps,
    uploadedFiles, setUploadedFiles,
    searchQuery, setSearchQuery,
    currentSessionId,
    htmlUrl,
    error,
    simulateGeneration,
    generate,
    loadHistoryFromApi,
    clearHistory,
  };
}
