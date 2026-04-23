import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight, GraduationCap, HelpCircle, MessagesSquare, Presentation } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";

type Feature = {
  title: string;
  description: string;
  route: string;
  icon: typeof Presentation;
  gradient: string;
  glowColor: string;
  tag: string;
};

const features: Feature[] = [
  {
    title: "AI Presentation Generator",
    description: "Upload a PDF or describe any topic — get a full slide deck in seconds.",
    route: "/dashboard",
    icon: Presentation,
    gradient: "bg-gradient-violet",
    glowColor: "shadow-brand-violet/30",
    tag: "Most Popular",
  },
  {
    title: "Quiz Generator",
    description: "Auto-generate MCQ, True/False, and short-answer quizzes from any topic.",
    route: "/generate/quiz",
    icon: HelpCircle,
    gradient: "bg-gradient-blue",
    glowColor: "shadow-brand-blue/30",
    tag: "Instant",
  },
  {
    title: "Aria — AI Debate Partner",
    description: "Learn through Socratic debate and personalized coaching with an AI tutor.",
    route: "/aria",
    icon: MessagesSquare,
    gradient: "bg-gradient-emerald",
    glowColor: "shadow-brand-emerald/30",
    tag: "Interactive",
  },
  {
    title: "Exam Simulator",
    description: "Generate and take AI-powered exams with instant grading.",
    route: "/exam",
    icon: GraduationCap,
    gradient: "bg-gradient-rose",
    glowColor: "shadow-brand-rose/30",
    tag: "Smart Grading",
  },
];

function TiltCard({ feature, index }: { feature: Feature; index: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-80, 80], [8, -8]), { stiffness: 200, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-80, 80], [-8, 8]), { stiffness: 200, damping: 30 });
  const glareX = useTransform(x, [-80, 80], [0, 100]);
  const glareY = useTransform(y, [-80, 80], [0, 100]);

  const Icon = feature.icon;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={() => navigate(feature.route)}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      onMouseMove={(e) => {
        if (!ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set(e.clientX - r.left - r.width / 2);
        y.set(e.clientY - r.top - r.height / 2);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      className="group relative flex h-full flex-col items-start rounded-2xl border border-border/70 bg-card p-6 text-left shadow-sm transition-shadow hover:shadow-2xl hover:border-border cursor-pointer"
    >
      {/* Glare effect */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at ${glareX.get()}% ${glareY.get()}%, rgba(255,255,255,0.12) 0%, transparent 60%)`,
        }}
      />

      {/* Tag badge */}
      <span className="absolute right-4 top-4 rounded-full border border-border/50 bg-background/60 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
        {feature.tag}
      </span>

      <div className={`relative grid h-12 w-12 place-items-center rounded-xl ${feature.gradient} text-white shadow-lg ${feature.glowColor} shadow-md group-hover:shadow-xl transition-shadow`}>
        <Icon className="h-5 w-5" strokeWidth={2.25} />
        {/* Icon pulse ring */}
        <span className={`absolute inset-0 rounded-xl ${feature.gradient} opacity-0 group-hover:opacity-60 group-hover:scale-125 transition-all duration-500`} />
      </div>

      <h3 className="mt-5 text-base font-semibold tracking-tight">{feature.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>

      <span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-foreground/60 transition-colors group-hover:text-foreground">
        Explore
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </motion.button>
  );
}

export const FeatureCards = () => {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.span
            className="inline-block rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground mb-4"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            Four AI superpowers
          </motion.span>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Everything you need to learn smarter
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            One platform. Four powerful AI tools. Zero limits.
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <TiltCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};
