import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Send, Loader2, Brain, Plus, Trash2, MessageSquare, Paperclip, FileText, X, ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Orb from "@/components/reactbits/Orb";
import TextType from "@/components/reactbits/TextType";
const API = "http://127.0.0.1:8000";

type Mode = "auto" | "debate" | "explain" | "coach";
type Source = "web" | "doc" | "mix";
type Lang = "en" | "fr";
type Role = "user" | "assistant";

interface Message { role: Role; content: string }
interface Conversation { conversation_id: string; title: string; mode: string; updated_at: string }

const MODE_META: Record<Mode, { label: string; active: string; desc: string }> = {
  auto:    { label: "Auto",    active: "bg-secondary text-foreground border-border",                    desc: "AI picks the best approach" },
  debate:  { label: "Debate",  active: "bg-primary/15 text-primary border-primary/30",                  desc: "Socratic questioning" },
  explain: { label: "Explain", active: "bg-blue-500/15 text-blue-400 border-blue-500/30",               desc: "Clear structured teaching" },
  coach:   { label: "Coach",   active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",      desc: "Study plans & goals" },
};

function genId() { return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

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
  const [modeOpen, setModeOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      toast({ title: `Document indexed — ${data.chunks} chunks`, description: file.name });
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
    if (!msg || loading) return;

    // Ensure we have an active conversation ID
    const convId = activeId || genId();
    if (!activeId) setActiveId(convId);

    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setInput("");
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
      // Refresh sidebar
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
  };

  return (
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
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear all history
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Brain className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">Aria — TEK-UP AI</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Top bar — title + source toggle */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/50 bg-card/30 shrink-0 gap-4">
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

        {/* Orb — always visible, centered background */}
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
          <div className="w-96 h-96 opacity-70 rounded-full overflow-hidden" style={{ mixBlendMode: "screen" }}>
            <Orb hue={260} hoverIntensity={0} forceHoverState={false} beating={loading} backgroundColor="#000000" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 relative">          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 text-muted-foreground relative z-10">
              <div className="max-w-md">
                <TextType
                  text="Hey there! I'm Aria, your AI learning partner at TEK-UP. What's on your mind?"
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
                    : "bg-card/80 backdrop-blur-sm rounded-bl-sm border border-primary/20"
                }`}
                style={msg.role === "assistant" ? {
                  boxShadow: "0 0 0 1px hsl(var(--primary)/0.15), 0 0 16px 2px hsl(var(--primary)/0.12)"
                } : undefined}
                >
                  {msg.role === "assistant" && i === messages.length - 1 ? (
                    <TextType
                      text={msg.content}
                      typingSpeed={18}
                      loop={false}
                      showCursor={true}
                      cursorCharacter="▋"
                      cursorBlinkDuration={0.5}
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
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
          <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-4 py-3 focus-within:border-primary/40 transition-colors">
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
            <div className="flex-1 flex flex-col">
              <textarea
                ref={inputRef}
                rows={1}
                className="w-full bg-transparent resize-none text-sm focus:outline-none placeholder:text-muted-foreground max-h-36 overflow-y-auto"
                placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
                value={input}
                onChange={e => setInput(e.target.value)}
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
              {modeOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModeOpen(false)} />
                  <div className="absolute bottom-full right-0 mb-1.5 w-48 rounded-xl border border-border bg-popover shadow-lg z-50 py-1 overflow-hidden">
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
                </>
              )}
            </div>

            <Button size="icon" onClick={send} disabled={loading || !input.trim()} className="shrink-0 rounded-xl h-8 w-8">
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
