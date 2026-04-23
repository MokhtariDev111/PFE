import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Send, Loader2, Brain, Plus, Trash2, MessageSquare, Paperclip, FileText, X, ChevronDown, PanelLeftClose, PanelLeftOpen, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import Orb from "@/components/reactbits/Orb";
import Galaxy from "@/components/reactbits/Galaxy";
import TextType from "@/components/reactbits/TextType";
const API = "http://127.0.0.1:8000";

type Mode = "auto" | "debate" | "explain" | "coach" | "virtual";
type Source = "web" | "doc" | "mix";
type Lang = "en" | "fr";
type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
  suggestions?: { label: string; prompt: string }[];
  video_url?: string;
}
interface Conversation { conversation_id: string; title: string; mode: string; updated_at: string }

const MODE_META: Record<Mode, { label: string; active: string; desc: string }> = {
  auto:    { label: "Auto",    active: "bg-secondary text-foreground border-border",                    desc: "AI picks the best approach" },
  debate:  { label: "Debate",  active: "bg-primary/15 text-primary border-primary/30",                  desc: "Socratic questioning" },
  explain: { label: "Explain", active: "bg-blue-500/15 text-blue-400 border-blue-500/30",               desc: "Clear structured teaching" },
  coach:   { label: "Coach",   active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",      desc: "Study plans & goals" },
  virtual: { label: "Virtual", active: "bg-violet-500/15 text-violet-400 border-violet-500/30",         desc: "Face-to-face with Adam" },
};

function genId() { return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

const SLASH_COMMANDS = [
  { cmd: "/virtual",   icon: "👤", label: "/virtual",   desc: "Talk face-to-face with Adam" },
  { cmd: "/youtube",   icon: "▶",  label: "/youtube",   desc: "Search YouTube videos by views" },
  { cmd: "/wikipedia", icon: "📖", label: "/wikipedia",  desc: "Fetch Wikipedia article summary" },
  { cmd: "/animation", icon: "🎬", label: "/animation",  desc: "Generate educational Manim animation" },
];

// ─── Smart message renderer — makes bullet points clickable ──────────────────
function PagePreview({ conversationId, page }: { conversationId: string; page: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  const load = () => {
    timerRef.current = setTimeout(() => {
      if (badgeRef.current) {
        const r = badgeRef.current.getBoundingClientRect();
        setPos({ top: r.top - 60, left: r.right - 230 });
      }
      setShow(true);
    }, 120);
    if (!src) {
      fetch(`http://127.0.0.1:8000/debate/preview/${conversationId}/${page}`)
        .then(r => r.ok ? r.blob() : null)
        .then(b => { if (b) setSrc(URL.createObjectURL(b)); })
        .catch(() => {});
    }
  };
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  };

  return (
    <span className="relative inline-block shrink-0" onMouseEnter={load} onMouseLeave={hide}>
      <span ref={badgeRef} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary cursor-default hover:bg-primary/20 transition-colors font-mono">
        p.{page}
      </span>
      {show && (
        <span
          className="fixed z-[9999] block w-56 rounded-xl overflow-hidden border border-border shadow-2xl shadow-black/60 bg-card pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          {src
            ? <img src={src} alt={`Page ${page}`} className="w-full h-auto block" />
            : <span className="flex items-center justify-center h-32 text-[11px] text-muted-foreground">Loading page {page}…</span>
          }
          <span className="block text-center text-[10px] text-muted-foreground py-1.5 border-t border-border">Page {page}</span>
        </span>
      )}
    </span>
  );
}

// ─── Structured outline renderer ─────────────────────────────────────────────
function OutlineRenderer({ content, onTopicClick, conversationId }: {
  content: string; onTopicClick: (t: string) => void; conversationId: string;
}) {
  // Parse into chapters + sections
  type Section = { topic: string; page: string | null };
  type Chapter = { title: string; page: string | null; sections: Section[] };

  const chapters: Chapter[] = [];
  let currentChapter: Chapter | null = null;
  const otherLines: string[] = [];
  let isOutline = false;

  const lines = content.split("\n");

  for (const line of lines) {
    const romanMatch = line.match(/^\s*([IVX]+)\.\s+(.+)$/);
    const bulletMatch = line.match(/^\s*[\*\-]\s+(.+)$/);

    if (romanMatch) {
      isOutline = true;
      const full = romanMatch[2].trim();
      const pm = full.match(/^(.*?)\s*\(p\.?\s*(\d+)\)\s*$/i);
      currentChapter = { title: pm ? pm[1].trim() : full, page: pm ? pm[2] : null, sections: [] };
      chapters.push(currentChapter);
    } else if (bulletMatch && currentChapter) {
      const full = bulletMatch[1].trim();
      const pm = full.match(/^(.*?)\s*\(p\.?\s*(\d+)\)\s*$/i);
      currentChapter.sections.push({ topic: pm ? pm[1].trim() : full, page: pm ? pm[2] : null });
    } else {
      if (!isOutline || !currentChapter) otherLines.push(line);
    }
  }

  // If no outline detected, fall back to plain MessageContent
  if (chapters.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {/* Intro text before the outline */}
      {otherLines.filter(l => l.trim()).length > 0 && (
        <p className="text-sm text-foreground/80 mb-3">{otherLines.filter(l => l.trim()).join(" ")}</p>
      )}

      {chapters.map((ch, ci) => (
        <div key={ci} className="rounded-xl border border-border/60 overflow-hidden bg-card/40">
          {/* Chapter header */}
          <div className="flex items-center justify-between px-3 py-2 bg-primary/8 border-b border-border/40">
            <button
              onClick={() => onTopicClick(ch.title)}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors text-left flex-1"
            >
              {ch.title}
            </button>
            {ch.page && conversationId && (
              <PagePreview conversationId={conversationId} page={ch.page} />
            )}
          </div>

          {/* Sections */}
          {ch.sections.length > 0 && (
            <div className="divide-y divide-border/30">
              {ch.sections.map((sec, si) => (
                <div key={si} className="flex items-center justify-between px-4 py-1.5 hover:bg-secondary/30 transition-colors group">
                  <button
                    onClick={() => onTopicClick(sec.topic)}
                    className="text-xs text-muted-foreground group-hover:text-primary transition-colors text-left flex-1"
                  >
                    → {sec.topic}
                  </button>
                  {sec.page && conversationId && (
                    <PagePreview conversationId={conversationId} page={sec.page} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function renderLineWithLinks(line: string) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const parts: (string | JSX.Element)[] = [];
  let last = 0;
  let match;
  while ((match = urlRegex.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    parts.push(
      <a key={match.index} href={match[0]} target="_blank" rel="noopener noreferrer"
        className="text-primary underline hover:text-primary/80 break-all">
        {match[0]}
      </a>
    );
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length > 0 ? parts : line;
}

function RenderWithLinks({ content }: { content: string }) {
  return (
    <span className="whitespace-pre-wrap">
      {content.split("\n").map((line, i) => (
        <span key={i} className="block">{renderLineWithLinks(line)}</span>
      ))}
    </span>
  );
}

function MessageContent({ content, onTopicClick, conversationId }: {
  content: string;
  onTopicClick: (t: string) => void;
  conversationId: string;
}) {
  // Try structured outline first
  const outline = <OutlineRenderer content={content} onTopicClick={onTopicClick} conversationId={conversationId} />;
  if (outline) {
    // Check if it actually rendered chapters
    const hasRoman = /^\s*[IVX]+\.\s+/m.test(content);
    if (hasRoman) return outline;
  }

  // Fallback: plain renderer with clickable bullets
  const lines = content.split("\n");
  return (
    <span className="block">
      {lines.map((line, i) => {
        const bulletMatch = line.match(/^(\s*[\*\-]\s+)(.+)$/);
        const romanMatch  = !bulletMatch && line.match(/^(\s*[IVX]+\.\s+)(.+)$/);
        const m = bulletMatch || romanMatch;
        if (m) {
          const full = m[2].trim();
          const pm = full.match(/^(.*?)\s*\(p\.?\s*(\d+)\)\s*$/i);
          const topic = pm ? pm[1].trim() : full;
          const pageNum = pm ? pm[2] : null;
          return (
            <span key={i} className="flex items-center justify-between gap-3 py-0.5">
              <span className="flex-1 min-w-0">
                <span className="text-muted-foreground">{m[1]}</span>
                <button onClick={() => onTopicClick(topic)} className="text-primary hover:underline text-left">{topic}</button>
              </span>
              {pageNum && conversationId && <PagePreview conversationId={conversationId} page={pageNum} />}
            </span>
          );
        }
        return <span key={i} className="block">{renderLineWithLinks(line)}</span>;
      })}
    </span>
  );
}

export default function DebatePage() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [source, setSource] = useState<Source>("web");
  const [lang, setLang] = useState<Lang>("en");
  const [loading, setLoading] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<{label: string; prompt: string}[]>([]);
  const [animationLoading, setAnimationLoading] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Voice
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  // Virtual mode
  const [virtualOpen, setVirtualOpen] = useState(false);
  const [virtualPhase, setVirtualPhase] = useState<"intro" | "idle" | "talking">("intro");
  const [virtualMessages, setVirtualMessages] = useState<{ role: Role; content: string }[]>([]);
  const [virtualInput, setVirtualInput] = useState("");
  const [virtualLoading, setVirtualLoading] = useState(false);
  const [virtualListening, setVirtualListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const introVideoRef = useRef<HTMLVideoElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const talkingVideoRef = useRef<HTMLVideoElement>(null);
  const virtualRecognitionRef = useRef<any>(null);
  const sendVirtualMsgRef = useRef<(msg: string) => void>();
  const pendingVirtualTranscript = useRef("");

  // Load conversation list on mount
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/debate/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      virtualRecognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!virtualOpen) return;
    if (virtualPhase === "idle") {
      // Pause talking video and freeze idle video at frame 0 — just his face
      talkingVideoRef.current?.pause();
      if (idleVideoRef.current) {
        idleVideoRef.current.currentTime = 0;
        idleVideoRef.current.pause();
      }
    } else if (virtualPhase === "talking") {
      // Loop talking video while Adam speaks
      idleVideoRef.current?.pause();
      talkingVideoRef.current?.play().catch(() => {});
    }
  }, [virtualPhase, virtualOpen]);

  // ── Voice helpers ─────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Voice not supported", description: "Please use Chrome or Edge.", variant: "destructive" }); return; }
    if (isListening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = lang === "fr" ? "fr-FR" : "en-US";
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join(" ");
      setInput(transcript);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
  }, [isListening, lang, toast]);

  const speakText = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#+\s/g, "").replace(/\[.*?\]\(.*?\)/g, "");
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = lang === "fr" ? "fr-FR" : "en-US";
    utt.rate = 1.05;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, [voiceEnabled, lang]);

  const stopSpeaking = useCallback(() => { window.speechSynthesis?.cancel(); setIsSpeaking(false); }, []);

  // ── Virtual mode helpers ──────────────────────────────────────────────────

  const speakVirtualText = (text: string) => {
    if (!window.speechSynthesis) { setVirtualPhase("idle"); return; }
    window.speechSynthesis.cancel();
    const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#+\s/g, "");
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = lang === "fr" ? "fr-FR" : "en-US";
    utt.rate = 0.95;
    utt.pitch = 0.85;
    utt.onend = () => setVirtualPhase("idle");
    utt.onerror = () => setVirtualPhase("idle");
    setVirtualPhase("talking");
    window.speechSynthesis.speak(utt);
  };

  const sendVirtualMsg = async (msg: string) => {
    if (!msg.trim() || virtualLoading) return;
    const convId = activeId || genId();
    if (!activeId) setActiveId(convId);
    setVirtualMessages(prev => [...prev, { role: "user", content: msg.trim() }]);
    setVirtualInput("");
    setVirtualLoading(true);
    setVirtualPhase("talking");
    try {
      const fd = new FormData();
      fd.append("message", msg.trim());
      fd.append("mode", "virtual");
      fd.append("source", "web");
      fd.append("language", lang);
      fd.append("conversation_id", `virtual_${convId}`);
      const res = await fetch(`${API}/debate/chat`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setVirtualMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      speakVirtualText(data.reply);
    } catch (e: any) {
      toast({ title: "Connection error", description: e.message, variant: "destructive" });
      setVirtualPhase("idle");
    } finally {
      setVirtualLoading(false);
    }
  };
  sendVirtualMsgRef.current = sendVirtualMsg;

  const startVirtualListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Voice not supported", description: "Use Chrome or Edge", variant: "destructive" }); return; }
    if (virtualListening) { virtualRecognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = lang === "fr" ? "fr-FR" : "en-US";
    rec.interimResults = false;
    rec.onstart = () => setVirtualListening(true);
    rec.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join(" ");
      pendingVirtualTranscript.current = t;
      setVirtualInput(t);
    };
    rec.onend = () => {
      setVirtualListening(false);
      const msg = pendingVirtualTranscript.current.trim();
      pendingVirtualTranscript.current = "";
      if (msg) sendVirtualMsgRef.current?.(msg);
    };
    rec.onerror = () => setVirtualListening(false);
    virtualRecognitionRef.current = rec;
    rec.start();
  };

  const closeVirtual = () => {
    setVirtualOpen(false);
    window.speechSynthesis?.cancel();
    virtualRecognitionRef.current?.stop();
    setVirtualPhase("intro");
    setVirtualMessages([]);
    setVirtualInput("");
    setVirtualListening(false);
  };

  // Load a conversation's history
  const openConversation = async (id: string) => {
    setActiveId(id);
    try {
      const res = await fetch(`${API}/debate/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.history ?? []);
      }
    } catch { /* silent */ }
  };

  const newChat = () => {
    setActiveId(genId());
    setMessages([]);
    setInput("");
    setUploadedDoc("");
    setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const uploadFile = async (file: File) => {
    const convId = activeId || genId();
    if (!activeId) setActiveId(convId);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("conversation_id", convId);
      const res = await fetch(`${API}/debate/upload`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setUploadedDoc(file.name);

      // Get contextual intro + suggestions from the document
      const ifd = new FormData();
      ifd.append("conversation_id", convId);
      ifd.append("filename", file.name);
      ifd.append("language", lang === "fr" ? "French" : "English");
      const ires = await fetch(`${API}/debate/document-intro`, { method: "POST", body: ifd });
      if (ires.ok) {
        const intro = await ires.json();
        setMessages(prev => [...prev, {
          role: "assistant",
          content: intro.message,
          suggestions: intro.suggestions ?? [],
        }]);
        setSuggestions([]);
        // Save to MongoDB
        const sfd = new FormData();
        sfd.append("message", "");
        sfd.append("mode", mode);
        sfd.append("conversation_id", convId);
        // Just persist the assistant message
        await fetch(`${API}/debate/chat`, { method: "POST", body: (() => {
          const f = new FormData();
          f.append("message", `[Uploaded document: ${file.name}]`);
          f.append("mode", mode);
          f.append("conversation_id", convId);
          return f;
        })() });
      }

      toast({ title: `Document indexed — ${data.chunks} chunks`, description: file.name });
      loadConversations();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const clearAllHistory = async () => {
    if (!window.confirm("Delete all conversations? This cannot be undone.")) return;
    await fetch(`${API}/debate/conversations`, { method: "DELETE" });
    setConversations([]);
    newChat();
    toast({ title: "History cleared" });
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API}/debate/conversations/${id}`, { method: "DELETE" });
    if (activeId === id) newChat();
    setConversations(prev => prev.filter(c => c.conversation_id !== id));
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading || animationLoading) return;

    const convId = activeId || genId();
    if (!activeId) setActiveId(convId);

    // Handle /virtual — open immersive overlay without polluting main chat
    if (msg.toLowerCase() === "/virtual") {
      setInput("");
      setSlashOpen(false);
      setVirtualOpen(true);
      setVirtualPhase("intro");
      setVirtualMessages([]);
      return;
    }

    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setInput("");
    setSuggestions([]);
    setSlashOpen(false);

    // Handle /animation BEFORE setting loading — intercept early
    if (msg.toLowerCase().startsWith("/animation")) {
      const topic = msg.replace(/\/animation\s*/i, "").trim();
      setAnimationLoading(true);
      try {
        const fd = new FormData();
        fd.append("topic", topic || msg);
        fd.append("conversation_id", convId);
        const res = await fetch(`${API}/debate/animation`, { method: "POST", body: fd });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `🎬 Animation ready: **${data.topic}**\n${data.description}${data.prebuilt ? "\n\n📚 Pre-built animation" : ""}`,
          video_url: `${API}${data.video_url}`,
        }]);
        loadConversations();
      } catch (e: any) {
        toast({ title: "Animation failed", description: e.message, variant: "destructive" });
        setMessages(prev => prev.slice(0, -1));
      } finally {
        setAnimationLoading(false);
      }
      return;
    }

    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("message", msg);
      fd.append("mode", mode);
      fd.append("source", source);
      fd.append("language", lang);
      fd.append("conversation_id", convId);

      const res = await fetch(`${API}/debate/chat`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      speakText(data.reply);
      loadConversations();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setMessages(prev => prev.slice(0, -1)); // remove optimistic user message
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === "Tab" && slashOpen) {
      e.preventDefault();
      const filtered = SLASH_COMMANDS.filter(c =>
        input === "/" || c.cmd.includes(input.slice(1).toLowerCase())
      );
      if (filtered.length > 0) {
        setInput(filtered[0].cmd + " ");
        setSlashOpen(false);
      }
    }
    if (e.key === "Escape" && slashOpen) {
      setSlashOpen(false);
    }
  };

  const handleTopicClick = (topic: string) => {
    setInput(`Explain "${topic}" in detail with examples.`);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <>
    {/* ── Virtual Mode Overlay ── */}
    <AnimatePresence>
      {virtualOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-black overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Videos — all preloaded, only the active one is visible */}
          <video ref={introVideoRef} src="/aria sitting.mp4" autoPlay playsInline preload="auto"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${virtualPhase === "intro" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            onEnded={() => {
              setVirtualPhase("idle");
              const greeting = "Hey, great to see you. What's on your mind?";
              setVirtualMessages([{ role: "assistant", content: greeting }]);
              speakVirtualText(greeting);
            }}
          />
          <video ref={idleVideoRef} src="/aria asking me.mp4" playsInline muted preload="auto"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${virtualPhase === "idle" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          />
          <video ref={talkingVideoRef} src="/aria talking.mp4" loop playsInline muted preload="auto"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${virtualPhase === "talking" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          />

          {/* Bottom gradient */}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

          {/* Top bar */}
          <div className="absolute top-0 inset-x-0 flex items-center justify-between px-6 py-5 z-10">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors ${
                virtualPhase === "talking" ? "bg-green-400 animate-pulse" :
                virtualListening ? "bg-red-400 animate-pulse" : "bg-white/40"
              }`} />
              <span className="text-white/80 text-sm font-medium tracking-wide">Adam</span>
            </div>
            <button onClick={closeVirtual}
              className="rounded-full bg-black/40 border border-white/20 p-2 text-white hover:bg-black/60 transition-colors backdrop-blur">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Chat area */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col" style={{ maxHeight: "45vh" }}>
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
              <AnimatePresence initial={false}>
                {virtualMessages.slice(-5).map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs sm:max-w-sm px-4 py-2.5 rounded-2xl text-sm leading-relaxed backdrop-blur-sm ${
                      msg.role === "user"
                        ? "bg-white/15 text-white border border-white/20 rounded-br-sm"
                        : "bg-black/40 text-white/90 border border-white/10 rounded-bl-sm"
                    }`}>{msg.content}</div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {virtualLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="bg-black/40 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
            <div className="px-6 pb-8 pt-2">
              <div className="flex items-center gap-3 bg-black/50 border border-white/15 rounded-full px-5 py-3 backdrop-blur-md">
                <input type="text" value={virtualInput} onChange={e => setVirtualInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") sendVirtualMsgRef.current?.(virtualInput); }}
                  placeholder="Say something to Adam…"
                  className="flex-1 bg-transparent text-white placeholder:text-white/35 text-sm focus:outline-none" />
                <button onClick={startVirtualListening} title={virtualListening ? "Stop" : "Speak"}
                  className={`shrink-0 transition-colors ${virtualListening ? "text-red-400 animate-pulse" : "text-white/50 hover:text-white"}`}>
                  {virtualListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button onClick={() => sendVirtualMsgRef.current?.(virtualInput)}
                  disabled={virtualLoading || !virtualInput.trim()}
                  className="shrink-0 text-white/50 hover:text-white transition-colors disabled:opacity-30">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    <div className="flex h-[calc(100vh-56px)] bg-background overflow-hidden">

      {/* ── Sidebar ── */}
      <motion.div
        animate={{ width: sidebarOpen ? 256 : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="shrink-0 flex flex-col border-r border-border/50 bg-card/40 overflow-hidden"
      >
        <div className="w-64">
          <div className="p-3 border-b border-border/50">
            <Button onClick={newChat} size="sm" className="w-full gap-2 launch-button">
              <Plus className="w-4 h-4" /> New chat
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2" style={{ maxHeight: "calc(100vh - 260px)" }}>
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No conversations yet</p>
            )}
            {conversations.map(c => (
              <button
                key={c.conversation_id}
                onClick={() => openConversation(c.conversation_id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all group flex items-start gap-2 ${
                  activeId === c.conversation_id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-secondary/60 text-foreground"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
                <span className="flex-1 truncate leading-snug">{c.title}</span>
                <Trash2
                  className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 mt-0.5 transition-opacity"
                  onClick={(e) => deleteConversation(c.conversation_id, e)}
                />
              </button>
            ))}
          </div>

          <div className="p-3 border-t border-border/50 space-y-2">
            <button
              onClick={clearAllHistory}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-all mt-auto"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear all history
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Brain className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">Adam — EduAI</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Top bar — title + source toggle */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/50 bg-background/90 backdrop-blur-xl shrink-0 gap-4">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <span className="text-sm text-muted-foreground truncate flex-1">
            {conversations.find(c => c.conversation_id === activeId)?.title ?? "New conversation"}
          </span>
          <div className="flex items-center gap-3 shrink-0">
            {/* Language toggle */}
            <div className="flex items-center gap-0.5 rounded-full border border-border p-0.5">
              {(["en", "fr"] as Lang[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                    lang === l
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Voice toggle */}
            <button
              onClick={() => { setVoiceEnabled(v => !v); if (isSpeaking) stopSpeaking(); }}
              title={voiceEnabled ? "Disable voice responses" : "Enable voice responses"}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all ${
                voiceEnabled ? "bg-primary/15 text-primary border-primary/30" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Source toggle */}
            {(["web", "doc", "mix"] as Source[]).map(s => (
              <button
                key={s}
                onClick={() => setSource(s)}
                title={{ web: "Web search only", doc: "Uploaded document only", mix: "Document + web search" }[s]}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  source === s
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {{ web: "🌐 Web", doc: "📄 Doc", mix: "🔀 Mix" }[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Galaxy stars — behind everything */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <Galaxy hueShift={260} density={1.2} glowIntensity={0.4} twinkleIntensity={0.4} rotationSpeed={0.03} speed={0.6} transparent mouseInteraction={false} mouseRepulsion={false} />
        </div>

        {/* Orb — always visible, centered background */}
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center overflow-hidden">
          <div className="w-96 h-96 opacity-70 rounded-full overflow-hidden" style={{ mixBlendMode: "screen" }}>
            <Orb hue={260} hoverIntensity={0} forceHoverState={false} beating={loading} backgroundColor="#000000" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 relative">          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 text-muted-foreground relative z-10">
              <div className="max-w-md">
                <TextType
                  text="Hey there! I'm Adam, your AI learning partner at EduAI. What's on your mind?"
                  typingSpeed={28}
                  loop={false}
                  showCursor={true}
                  cursorCharacter="▋"
                  cursorBlinkDuration={0.6}
                  className="text-base leading-relaxed text-foreground/90 font-medium"
                />
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex relative z-10 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-2xl px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap"
                    : "bg-card/80 backdrop-blur-sm rounded-bl-sm border border-primary/20 text-foreground"
                }`}
                style={msg.role === "assistant" ? {
                  boxShadow: "0 0 0 1px hsl(var(--primary)/0.15), 0 0 16px 2px hsl(var(--primary)/0.12)"
                } : undefined}
                >
                  {msg.role === "assistant" ? (() => {
                    const hasOutline = /^\s*[IVX]+\.\s+/m.test(msg.content);
                    const hasUrl = /https?:\/\//.test(msg.content);
                    if (hasOutline) {
                      return <MessageContent content={msg.content} onTopicClick={handleTopicClick} conversationId={activeId} />;
                    }
                    if (hasUrl) {
                      return <RenderWithLinks content={msg.content} />;
                    }
                    if (i === messages.length - 1) {
                      return (
                        <TextType
                          text={msg.content}
                          typingSpeed={18}
                          loop={false}
                          showCursor={true}
                          cursorCharacter="▋"
                          cursorBlinkDuration={0.5}
                          className="text-sm leading-relaxed whitespace-pre-wrap"
                        />
                      );
                    }
                    return <RenderWithLinks content={msg.content} />;
                  })() : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                  {/* Video player for /animation results */}
                  {msg.video_url && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-border">
                      <video
                        src={msg.video_url}
                        controls
                        autoPlay
                        className="w-full max-h-72"
                        style={{ background: "#000" }}
                      />
                    </div>
                  )}
                  {/* Suggestion links inside the bubble */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-primary/10 pt-3">
                      {msg.suggestions.map((s, si) => (
                        <button
                          key={si}
                          onClick={() => {
                            setInput(s.prompt);
                            setSuggestions([]);
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="text-left text-xs text-primary hover:text-primary/80 hover:underline transition-all flex items-center gap-1.5"
                        >
                          <span className="opacity-60">→</span> {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start relative z-10">
              <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </motion.div>
          )}

          {animationLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start relative z-10">
              <div className="bg-card border border-primary/20 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-3"
                style={{ boxShadow: "0 0 16px 2px hsl(var(--primary)/0.12)" }}>
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Generating animation… this may take 30-60s</span>
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-6 pb-4 pt-2 border-t border-border/50">
          {/* Document badge — only shown when source can use the document */}
          {uploadedDoc && source !== "web" && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs">
                <FileText className="w-3 h-3" />
                <span className="truncate max-w-[200px]">{uploadedDoc}</span>
                <button onClick={() => setUploadedDoc("")} className="ml-1 hover:text-red-400 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground">RAG active</span>
            </div>
          )}
          <div className="flex items-end gap-2 bg-card/95 border border-border/80 rounded-2xl px-4 py-3 focus-within:border-primary/40 transition-colors backdrop-blur-xl shadow-lg">
            {/* Upload button — hidden when Web-only source is selected */}
            {source !== "web" && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors mb-0.5"
                title="Upload PDF"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
            />
            <div className="flex-1 flex flex-col relative">
              {/* Slash command menu — rendered via portal to escape all clipping */}
              {slashOpen && inputRef.current && createPortal(
                <div
                  className="fixed z-[300] w-72 rounded-xl border border-border bg-popover shadow-2xl"
                  style={{
                    bottom: `${window.innerHeight - inputRef.current.getBoundingClientRect().top + 8}px`,
                    left: `${inputRef.current.getBoundingClientRect().left}px`,
                  }}
                >
                  {SLASH_COMMANDS.filter(c =>
                    input === "/" || c.cmd.includes(input.slice(1).toLowerCase())
                  ).map(c => (
                    <button
                      key={c.cmd}
                      onMouseDown={e => {
                        e.preventDefault();
                        setInput(c.cmd + " ");
                        setSlashOpen(false);
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-secondary/60 transition-colors flex items-center gap-3 border-b border-border/40 last:border-0"
                    >
                      <span className="text-lg w-6 text-center">{c.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-primary">{c.label}</p>
                        <p className="text-[11px] text-muted-foreground">{c.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>,
                document.body
              )}
              <textarea
                ref={inputRef}
                rows={1}
                className="w-full bg-transparent resize-none text-sm text-foreground focus:outline-none placeholder:text-muted-foreground max-h-36 overflow-y-auto"
                placeholder="Ask anything… or type / for commands"
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  const val = e.target.value;
                  setSlashOpen(val.startsWith("/") && !val.includes(" "));
                }}
                onKeyDown={handleKey}
                style={{ lineHeight: "1.5" }}
              />
            </div>
            {/* Mode dropdown */}
            <div className="relative shrink-0">
              <button
                onClick={() => setModeOpen(o => !o)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${MODE_META[mode].active}`}
              >
                {MODE_META[mode].label}
                <ChevronDown className="w-3 h-3" />
              </button>
              {modeOpen && createPortal(
                <>
                  <div className="fixed inset-0 z-[200]" onClick={() => setModeOpen(false)} />
                  <div
                    className="fixed bottom-20 right-8 w-48 rounded-xl border border-border bg-popover shadow-xl z-[210] py-1 overflow-hidden"
                    onClick={e => e.stopPropagation()}
                  >
                    {(Object.entries(MODE_META) as [Mode, typeof MODE_META[Mode]][]).map(([m, meta]) => (
                      <button
                        key={m}
                        onClick={() => { setMode(m); setModeOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors flex flex-col gap-0.5 ${
                          mode === m ? "bg-secondary" : "hover:bg-secondary/60"
                        }`}
                      >
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          {mode === m && <span className="text-primary">✓</span>}
                          {meta.label}
                        </span>
                        <span className="text-muted-foreground">{meta.desc}</span>
                      </button>
                    ))}
                  </div>
                </>,
                document.body
              )}
            </div>

            {isSpeaking && (
              <button onClick={stopSpeaking} title="Stop speaking"
                className="shrink-0 text-primary animate-pulse hover:text-primary/70 transition-colors mb-0.5">
                <VolumeX className="w-4 h-4" />
              </button>
            )}
            <button onClick={startListening} title={isListening ? "Stop listening" : "Speak your message"}
              className={`shrink-0 transition-colors mb-0.5 ${isListening ? "text-red-500 animate-pulse" : "text-muted-foreground hover:text-primary"}`}>
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <Button size="icon" onClick={send} disabled={loading || !input.trim()} className="shrink-0 rounded-xl h-8 w-8">
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
