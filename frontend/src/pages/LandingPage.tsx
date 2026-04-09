import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Brain, Zap, BarChart3, ArrowRight, Sparkles, GraduationCap, Sun, Moon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import TextType from "@/components/reactbits/TextType";
import BorderGlow from "@/components/reactbits/BorderGlow";
import DarkVeil from "@/components/reactbits/DarkVeil";
import GlareHover from "@/components/reactbits/GlareHover";

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
        { color: "hsl(var(--accent)/0.08)",  x: "70%", y: "60%", size: "500px", dur: "22s" },
        { color: "hsl(235,80%,70%,0.07)",    x: "40%", y: "80%", size: "400px", dur: "15s" },
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

// ── Welcome avatar ────────────────────────────────────────────────────────────
function WelcomeAvatar() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.9 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-10 right-10 z-50 flex items-end gap-4"
        >
          {/* Speech bubble */}
          <motion.div
            initial={{ opacity: 0, x: 30, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
            className="relative max-w-[280px]"
            style={{
              background: "linear-gradient(135deg, hsl(var(--card)/0.95), hsl(var(--card)/0.85))",
              border: "1px solid hsl(var(--primary)/0.3)",
              borderRadius: "20px 20px 4px 20px",
              padding: "18px 22px",
              backdropFilter: "blur(20px)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px hsl(var(--primary)/0.1)",
            }}
          >
            <p className="text-base font-bold text-foreground mb-1">
              Welcome to TEKUP AI! 👋
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Transform your PDFs into stunning presentations, quizzes & more.
            </p>
            <motion.div
              className="mt-3 h-0.5 rounded-full"
              style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))" }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.8, duration: 7, ease: "linear" }}
              style2={{ transformOrigin: "left" }}
            />
          </motion.div>

          {/* Avatar circle */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, duration: 0.6, type: "spring", stiffness: 200 }}
            className="w-20 h-20 rounded-full flex-shrink-0 flex items-center justify-center shadow-2xl"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
              boxShadow: "0 0 40px hsl(var(--primary)/0.5), 0 20px 40px rgba(0,0,0,0.4)",
            }}
          >
            <GraduationCap className="w-10 h-10 text-white" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
          animation: "photo-scroll 30s linear infinite",
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
    title: "PDF to Presentation",
    desc: "Upload any textbook or document and get a structured, visual presentation in seconds.",
    color: "from-violet-500 to-indigo-500",
    bg: "bg-violet-500/10",
  },
  {
    icon: Brain,
    title: "Smart Quiz Generation",
    desc: "Automatically generate quizzes from your content to test understanding and retention.",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: Zap,
    title: "Flashcard Creator",
    desc: "Turn key concepts into flashcards for efficient spaced-repetition studying.",
    color: "from-amber-500 to-orange-500",
    bg: "bg-amber-500/10",
  },
  {
    icon: BarChart3,
    title: "Diagram Generator",
    desc: "Visualize complex relationships and processes with auto-generated diagrams.",
    color: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-500/10",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(true);

  // Force dark mode when landing page mounts, restore on unmount
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    return () => {
      // Restore to whatever the user had before
      root.classList.remove("dark");
    };
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }
    setIsDark(!isDark);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* DarkVeil WebGL background — full screen */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ opacity: 0.7 }}>
        <DarkVeil speed={0.4} hueShift={0} noiseIntensity={0} warpAmount={0.3} />
      </div>
      <AuroraBackground />
      <ParticleBackground />
      <FloatingPhotos />
      <WelcomeAvatar />

      {/* Gradient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-accent/6 rounded-full blur-[100px]" />
      </div>

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
        <section className="flex flex-col items-center justify-center text-center px-6 pt-32 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8"
          >
            <GraduationCap className="w-4 h-4" />
            Built for students & educators
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl"
          >
            <span className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
              AI-Powered
            </span>
            <br />
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Learning Assistant
            </span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed"
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
            className="flex flex-col sm:flex-row gap-4"
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
                  onClick={() => navigate("/dashboard")}
                >
                  <BorderGlow
                    borderRadius={16}
                    glowRadius={32}
                    backgroundColor="hsl(var(--card))"
                    colors={['#c084fc', '#818cf8', '#38bdf8']}
                    glowColor="235 80 65"
                    fillOpacity={0.3}
                    className="h-full cursor-pointer"
                  >
                    <div className="p-6 group">
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
                  </BorderGlow>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── CTA banner ── */}
        <section className="px-6 pb-24 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl p-10 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)/0.15), hsl(var(--accent)/0.1))",
              border: "1px solid hsl(var(--primary)/0.2)",
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
      </div>
    </div>
  );
}
