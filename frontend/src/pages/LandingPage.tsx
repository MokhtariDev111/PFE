import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Brain, MessageSquare, Zap, ArrowRight, Sparkles, GraduationCap, Sun, Moon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import TextType from "@/components/reactbits/TextType";
import ShinyText from "@/components/reactbits/ShinyText";
import DarkVeil from "@/components/reactbits/DarkVeil";
import GlareHover from "@/components/reactbits/GlareHover";
import { useTheme } from "@/components/ThemeProvider";
import { Brain3D } from "@/components/Brain3D";

// ── Aurora animated background ───────────────────────────────────────────────
function AuroraBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary)/0.15), transparent)",
        }}
      />
      {/* Animated aurora blobs */}
      {[
        { color: "hsl(var(--primary)/0.12)", x: "10%", y: "20%", size: "600px", dur: "18s" },
        { color: "hsl(var(--accent)/0.08)", x: "70%", y: "60%", size: "500px", dur: "22s" },
        { color: "hsl(235,80%,70%,0.07)", x: "40%", y: "80%", size: "400px", dur: "15s" },
      ].map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full blur-[100px]"
          style={{
            background: b.color,
            width: b.size,
            height: b.size,
            left: b.x,
            top: b.y,
            transform: "translate(-50%,-50%)",
            animation: `aurora-drift-${i} ${b.dur} ease-in-out infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes aurora-drift-0 { from { transform: translate(-50%,-50%) scale(1); } to { transform: translate(-40%,-60%) scale(1.1); } }
        @keyframes aurora-drift-1 { from { transform: translate(-50%,-50%) scale(1); } to { transform: translate(-60%,-40%) scale(0.9); } }
        @keyframes aurora-drift-2 { from { transform: translate(-50%,-50%) scale(1); } to { transform: translate(-45%,-55%) scale(1.05); } }
      `}</style>
    </div>
  );
}

// ── Particle canvas ───────────────────────────────────────────────────────────
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);

    const pts = Array.from({ length: 50 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.5 + 0.5, a: Math.random() * 0.2 + 0.05,
    }));

    let raf: number;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      pts.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99,102,241,${p.a})`;
        ctx.fill();
      });
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(99,102,241,${0.07 * (1 - d / 130)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.5 }} />;
}

// Removed WelcomeAvatar (now in GlobalAssistant)

// ── Meteor effect ────────────────────────────────────────────────────────────
function Meteors({ count = 18 }: { count?: number }) {
  const meteors = Array.from({ length: count }, (_, i) => ({
    id: i,
    top: `${Math.random() * 60}%`,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 6}s`,
    dur: `${3 + Math.random() * 4}s`,
    width: `${80 + Math.random() * 120}px`,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {meteors.map((m) => (
        <span
          key={m.id}
          className="absolute h-px rotate-[215deg] animate-meteor"
          style={{
            top: m.top,
            left: m.left,
            width: m.width,
            animationDelay: m.delay,
            animationDuration: m.dur,
            background: "linear-gradient(90deg, hsl(var(--primary)/0.6), transparent)",
          }}
        />
      ))}
      <style>{`
        @keyframes meteor {
          0%   { transform: rotate(215deg) translateX(0); opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: rotate(215deg) translateX(-600px); opacity: 0; }
        }
        .animate-meteor { animation: meteor linear infinite; }
      `}</style>
    </div>
  );
}

// ── Floating photos strip ─────────────────────────────────────────────────────
const PHOTOS = ["/tekup1.png", "/tekup2.png", "/tekup3.png", "/TEK-UP.png"];

function FloatingPhotos() {
  // Duplicate for seamless loop
  const all = [...PHOTOS, ...PHOTOS, ...PHOTOS];
  return (
    <div className="fixed bottom-0 left-0 right-0 pointer-events-none z-0 overflow-hidden h-48 opacity-20">
      <div
        className="flex gap-6 items-end"
        style={{
          width: "max-content",
          animation: "photo-scroll 23s linear infinite",
        }}
      >
        {all.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            className="h-36 w-auto rounded-2xl object-cover flex-shrink-0 shadow-2xl"
            style={{ filter: "blur(0.5px)" }}
          />
        ))}
      </div>
      <style>{`
        @keyframes photo-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.33%); }
        }
      `}</style>
    </div>
  );
}
const features = [
  {
    icon: FileText,
    title: "PDF → Presentation",
    desc: "Upload any document and get a structured, AI-powered presentation with slides, diagrams and speaker notes in seconds.",
    color: "from-violet-500 to-indigo-500",
    bg: "bg-violet-500/10",
    route: "/generate_from_doc",
  },
  {
    icon: Brain,
    title: "Quiz Generator",
    desc: "Automatically generate MCQ, True/False and short-answer quizzes from any topic — with explanations and visual diagrams.",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-500/10",
    route: "/generate/quiz",
  },
  {
    icon: MessageSquare,
    title: "Aria — AI Debate Partner",
    desc: "Learn through Socratic debate, guided explanations, and personalized study coaching powered by TEK-UP's AI tutor.",
    color: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-500/10",
    route: "/aria",
  },
  {
    icon: Zap,
    title: "Generate from Prompt",
    desc: "Describe any topic and let AI build a complete presentation for you — no document needed.",
    color: "from-amber-500 to-orange-500",
    bg: "bg-amber-500/10",
    route: "/generate/prompt",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { isDark, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* DarkVeil — dark mode only */}
      {isDark && (
        <div className="fixed inset-0 z-0 pointer-events-none" style={{ opacity: 0.7 }}>
          <DarkVeil speed={0.4} hueShift={0} noiseIntensity={0} warpAmount={0.3} />
        </div>
      )}
      <AuroraBackground />
      <ParticleBackground />
      <FloatingPhotos />

      {/* Gradient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-accent/6 rounded-full blur-[100px]" />
      </div>

      {/* 3D Brain — dark mode only */}
      {isDark && <Brain3D />}

      <div className="relative z-10">
        {/* ── Floating nav on landing ── */}
        <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-accent">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg gradient-text">TEKUP AI</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-border bg-card/60 backdrop-blur-sm hover:bg-card transition-all"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </nav>
        {/* ── Hero ── */}
        <section className="flex flex-col items-center justify-center text-center px-6 pt-32 pb-24 relative">
          {/* Backdrop to isolate text from brain animation behind */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: isDark
              ? "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(0,0,0,0.45) 0%, transparent 100%)"
              : "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(255,255,255,0.5) 0%, transparent 100%)"
          }} />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8 relative z-20"
          >
            <GraduationCap className="w-4 h-4" />
            Built for students & educators
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl relative z-20 isolate"
          >
            <span className={isDark ? "drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]" : ""}>
              <ShinyText
                text="AI-Powered"
                speed={3}
                color={isDark ? "#f0f4ff" : "#1e1b4b"}
                shineColor={isDark ? "#ffffff" : "#6366f1"}
                spread={90}
              />
            </span>
            <br />
            <span
              style={{ filter: `drop-shadow(0 0 32px hsl(var(--primary)/${isDark ? "0.8" : "0.3"}))` }}
            >
              <ShinyText
                text="Learning Assistant"
                speed={3}
                color={isDark ? "#c084fc" : "#7c3aed"}
                shineColor="#ffffff"
                spread={90}
              />
            </span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed relative z-20 [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]"
          >
            <TextType
              text={[
                "Transform PDFs into stunning presentations.",
                "Generate quizzes from any document.",
                "Create flashcards for smarter studying.",
                "Visualize concepts with AI diagrams.",
              ]}
              typingSpeed={55}
              deletingSpeed={30}
              pauseDuration={1800}
              showCursor
              cursorCharacter="_"
              cursorBlinkDuration={0.5}
              loop
              className="text-xl text-muted-foreground"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="flex flex-col sm:flex-row gap-4 relative z-20"
          >
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white text-lg transition-all duration-200 hover:scale-105 hover:shadow-2xl hover:shadow-primary/30"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
              }}
            >
              <Sparkles className="w-5 h-5" />
              Start Creating
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        </section>

        {/* ── Features ── */}
        <section className="px-6 pb-24 max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to learn faster</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              One platform, four powerful tools — all powered by AI and your own documents.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  onClick={() => navigate(f.route)}
                  className="h-full flex"
                >
                  <GlareHover
                    width="100%"
                    height="100%"
                    background="hsl(var(--card))"
                    borderRadius="16px"
                    className="cursor-pointer border border-border"
                  >
                    <div className="p-6 group h-full relative z-10">
                      <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                        <div className={`bg-gradient-to-br ${f.color} rounded-lg p-2`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                        {f.title}
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                    </div>
                  </GlareHover>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── CTA banner ── */}
        <section className="px-6 pb-24 max-w-4xl mx-auto relative z-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl p-10 text-center relative overflow-hidden backdrop-blur-md"
            style={{
              background: isDark
                ? "linear-gradient(135deg, hsl(var(--background)/0.85), hsl(var(--card)/0.9))"
                : "linear-gradient(135deg, hsl(var(--background)/0.95), hsl(var(--card)))",
              border: "1px solid hsl(var(--primary)/0.25)",
              boxShadow: "0 8px 40px -8px hsl(var(--primary)/0.2)",
            }}
          >
            <h2 className="text-3xl font-bold mb-3">Ready to study smarter?</h2>
            <p className="text-muted-foreground mb-6 text-lg">
              Upload your first document and see the magic happen.
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white transition-all hover:scale-105"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
              }}
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </section>

        {/* ── Footer ── */}
        <footer className="relative z-20 border-t border-border/40 backdrop-blur-md px-8 py-12 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

            {/* About — left */}
            <div>
              <h4 className="font-semibold text-sm mb-3 text-foreground">About</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">
                TEKUP AI is a final-year project (PFE) that transforms academic documents into
                interactive learning materials — presentations, quizzes, flashcards and diagrams.
              </p>
            </div>

            {/* Contact — right */}
            <div className="md:flex md:flex-col md:items-end">
              <div>
                <h4 className="font-semibold text-sm mb-3 text-foreground">Contact</h4>
                <div className="flex flex-col gap-2">
                  <a
                    href="mailto:mohmedazizmokhtari@gmail.com"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 7.5-9.75-7.5" />
                    </svg>
                    mohmedazizmokhtari@gmail.com
                  </a>
                  <a
                    href="https://www.linkedin.com/in/mohamed-aziz-mokhtari-469777365"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    Mohamed Aziz Mokhtari
                  </a>
                </div>
              </div>
            </div>

          </div>
          <div className="mt-10 pt-6 border-t border-border/30 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} TEKUP AI — PFE Project. All rights reserved.
          </div>
        </footer>

      </div>
    </div>
  );
}
