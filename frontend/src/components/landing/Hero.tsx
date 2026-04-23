import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Sparkles, Zap, Brain, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ParticleNetwork } from "./ParticleNetwork";
import { Typewriter } from "./Typewriter";

const API_BASE = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8000`;

const PHRASES = [
  "Transform any document into a presentation.",
  "Generate quizzes from any topic instantly.",
  "Debate and learn with an AI tutor.",
  "Simulate real exams with AI grading.",
];

const FLOATING_ICONS = [
  { Icon: Brain, color: "text-brand-violet", bg: "bg-brand-violet/10", size: "h-5 w-5", x: "12%", y: "22%", delay: 0 },
  { Icon: Zap, color: "text-brand-blue", bg: "bg-brand-blue/10", size: "h-4 w-4", x: "82%", y: "18%", delay: 1.2 },
  { Icon: BookOpen, color: "text-brand-emerald", bg: "bg-brand-emerald/10", size: "h-5 w-5", x: "85%", y: "62%", delay: 0.6 },
  { Icon: Sparkles, color: "text-brand-rose", bg: "bg-brand-rose/10", size: "h-4 w-4", x: "8%", y: "68%", delay: 1.8 },
];

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${Math.floor(n / 1000)}K+`;
}

function useUserCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    fetch(`${API_BASE}/stats`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.user_count !== undefined) setCount(data.user_count); })
      .catch(() => {});
  }, []);
  return count;
}

function CountUp({ target }: { target: string }) {
  const [display, setDisplay] = useState("0");
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const numMatch = target.match(/\d+/);
    if (!numMatch) { setDisplay(target); return; }
    const num = parseInt(numMatch[0]);
    let frame = 0;
    const total = 40;
    const timer = setInterval(() => {
      frame++;
      const progress = frame / total;
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * num);
      setDisplay(target.replace(/\d+/, String(current)));
      if (frame >= total) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [started, target]);

  return <span ref={ref}>{display}</span>;
}

function MagneticCTA({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 25 });
  const sy = useSpring(y, { stiffness: 300, damping: 25 });

  return (
    <div
      ref={ref}
      className="inline-block"
      onMouseMove={(e) => {
        if (!ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.25);
        y.set((e.clientY - r.top - r.height / 2) * 0.25);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
    >
      <motion.div style={{ x: sx, y: sy }}>
        <Button
          size="lg"
          onClick={onClick}
          className="group h-12 rounded-full bg-gradient-aurora px-7 text-base font-medium text-white shadow-lg shadow-brand-violet/30 transition-all hover:shadow-xl hover:shadow-brand-violet/40 [background-size:200%_200%] hover:[background-position:100%_50%]"
        >
          Start Learning Free
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </motion.div>
    </div>
  );
}

export const Hero = () => {
  const navigate = useNavigate();
  const userCount = useUserCount();
  const sectionRef = useRef<HTMLElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-400, 400], [2, -2]), { stiffness: 80, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-400, 400], [-2, 2]), { stiffness: 80, damping: 30 });

  const statItems = [
    { value: formatCount(userCount), label: "Students" },
    { value: "4", label: "AI Tools" },
    { value: "99%", label: "Satisfaction" },
  ];

  return (
    <section
      ref={sectionRef}
      id="top"
      onMouseMove={(e) => {
        if (!sectionRef.current) return;
        const r = sectionRef.current.getBoundingClientRect();
        mouseX.set(e.clientX - r.left - r.width / 2);
        mouseY.set(e.clientY - r.top - r.height / 2);
      }}
      className="relative isolate flex min-h-screen items-center overflow-hidden pt-24"
    >
      {/* Aurora blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-10%] top-[10%] h-[600px] w-[600px] rounded-full bg-brand-violet/25 blur-[100px] animate-aurora" />
        <div className="absolute right-[-5%] top-[20%] h-[520px] w-[520px] rounded-full bg-brand-blue/20 blur-[80px] animate-aurora" style={{ animationDelay: "-4s" }} />
        <div className="absolute bottom-[-15%] left-[30%] h-[440px] w-[440px] rounded-full bg-brand-emerald/15 blur-[80px] animate-aurora" style={{ animationDelay: "-8s" }} />
        <div className="absolute left-[60%] top-[5%] h-[300px] w-[300px] rounded-full bg-brand-rose/15 blur-[60px] animate-aurora" style={{ animationDelay: "-12s" }} />
      </div>

      <div className="absolute inset-0 -z-10 opacity-60 dark:opacity-50">
        <ParticleNetwork />
      </div>

      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 50%, transparent 80%)",
        }}
      />

      {/* Floating icons */}
      {FLOATING_ICONS.map(({ Icon, color, bg, size, x, y, delay }, i) => (
        <motion.div
          key={i}
          className={`pointer-events-none absolute hidden lg:flex items-center justify-center h-12 w-12 rounded-2xl ${bg} backdrop-blur-sm border border-white/10`}
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: [0, -14, 0],
          }}
          transition={{
            opacity: { delay: delay + 1, duration: 0.5 },
            scale: { delay: delay + 1, duration: 0.6, type: "spring", bounce: 0.4 },
            y: { delay: delay + 1.5, duration: 3.5 + i * 0.4, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          <Icon className={`${size} ${color}`} />
        </motion.div>
      ))}

      <div className="container relative z-10 mx-auto py-20 text-center">
        {/* Live indicator badge */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="mx-auto inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-background/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-emerald opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-emerald" />
          </span>
          Built for students &amp; educators worldwide
        </motion.div>

        {/* Headline with 3D tilt */}
        <motion.div style={{ rotateX, rotateY, transformPerspective: 1000 }}>
          <h1 className="mx-auto mt-7 max-w-5xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl lg:text-[5.25rem]">
            <motion.span
              className="block"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            >
              AI-Powered
            </motion.span>
            <motion.span
              className="mt-2 block bg-gradient-aurora bg-clip-text text-transparent [background-size:200%_200%] animate-gradient-shift"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
            >
              Learning Assistant
            </motion.span>
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65 }}
          className="mx-auto mt-7 flex min-h-[3.25rem] max-w-2xl items-center justify-center text-base text-muted-foreground sm:text-lg"
        >
          <Typewriter phrases={PHRASES} className="font-medium text-foreground/80" />
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.85 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <MagneticCTA onClick={() => navigate("/dashboard")} />
          <motion.a
            href="#features"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-border/70 bg-background/60 px-6 text-sm font-medium backdrop-blur-md transition-colors hover:bg-background/90 cursor-pointer"
          >
            See how it works
          </motion.a>
        </motion.div>

        {/* Animated stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.1 }}
          className="mx-auto mt-16 flex items-center justify-center gap-10 sm:gap-16"
        >
          {statItems.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="text-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + i * 0.12, duration: 0.5 }}
            >
              <div className="text-2xl font-bold bg-gradient-aurora bg-clip-text text-transparent [background-size:200%_200%]">
                <CountUp target={stat.value} />
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2, duration: 0.8 }}
        >
          <motion.div
            className="flex flex-col items-center gap-2"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="h-8 w-5 rounded-full border-[1.5px] border-border/50 flex items-start justify-center pt-1.5">
              <motion.div
                className="h-1.5 w-1 rounded-full bg-muted-foreground/50"
                animate={{ y: [0, 8, 0], opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
