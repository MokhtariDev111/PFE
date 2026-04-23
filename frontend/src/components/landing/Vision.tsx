import { motion, useMotionValue, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8000`;

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

function AnimatedStat({ stat, delay }: { stat: typeof stats[0]; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || !numRef.current) return;
      const el = numRef.current;
      const controls = animate(0, stat.value, {
        duration: 2,
        ease: "easeOut",
        delay,
        onUpdate: (v) => {
          if (stat.value >= 1000) {
            el.textContent = Math.round(v).toLocaleString() + "+";
          } else if (stat.suffix === "%") {
            el.textContent = Math.round(v) + "%";
          } else {
            el.textContent = String(Math.round(v));
          }
        },
      });
      observer.disconnect();
      return controls.stop;
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [stat, delay]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.85, y: 20 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      whileHover={{ scale: 1.03 }}
      className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm cursor-default"
    >
      <div className="bg-gradient-aurora bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl [background-size:200%_200%]">
        <span ref={numRef}>0</span>
      </div>
      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-white/60">
        {stat.label}
      </div>
    </motion.div>
  );
}

export const Vision = () => {
  const userCount = useUserCount();
  const stats = [
    { value: userCount, label: "Active Learners", suffix: "" },
    { value: 4, label: "AI Tools", suffix: "" },
    { value: 98, label: "Pass Rate Boost", suffix: "%" },
  ];

  return (
    <section className="relative overflow-hidden bg-[hsl(224_47%_5%)] py-28 text-[hsl(220_15%_96%)] sm:py-36">
      {/* Animated gradient overlay */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-10 h-[420px] w-[420px] rounded-full bg-brand-violet/30 blur-3xl animate-aurora" />
        <div className="absolute -right-20 bottom-10 h-[420px] w-[420px] rounded-full bg-brand-blue/30 blur-3xl animate-aurora" style={{ animationDelay: "-5s" }} />
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-emerald/20 blur-3xl animate-aurora" style={{ animationDelay: "-9s" }} />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div className="container relative">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-3xl text-balance text-center text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl"
        >
          The future of education is{" "}
          <span className="bg-gradient-aurora bg-clip-text text-transparent [background-size:200%_200%] animate-gradient-shift">
            here.
          </span>
        </motion.h2>

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
          {stats.map((s, i) => (
            <AnimatedStat key={s.label} stat={s} delay={i * 0.15} />
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mx-auto mt-14 max-w-2xl text-balance text-center text-base leading-relaxed text-white/70 sm:text-lg"
        >
          EduAI is more than a study tool. It's an intelligent academic partner
          that adapts to how you think, learn, and grow — turning every subject
          into a conversation and every challenge into mastery.
        </motion.p>
      </div>
    </section>
  );
};
