import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { StoryPanel } from "./StoryPanel";

const Bubble = ({
  side,
  delay,
  children,
}: {
  side: "left" | "right";
  delay: number;
  children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12, scale: 0.96 }}
    whileInView={{ opacity: 1, y: 0, scale: 1 }}
    viewport={{ once: true, margin: "-120px" }}
    transition={{ duration: 0.45, delay, ease: "easeOut" }}
    className={`flex w-full ${side === "right" ? "justify-end" : "justify-start"}`}
  >
    {side === "left" && (
      <div className="mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-emerald text-white shadow">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
    )}
    <div
      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
        side === "right"
          ? "rounded-tr-sm bg-foreground text-background"
          : "rounded-tl-sm border border-brand-emerald/20 bg-background text-foreground"
      }`}
    >
      {children}
    </div>
  </motion.div>
);

const TypingDots = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true, margin: "-120px" }}
    transition={{ delay, duration: 0.3 }}
    className="flex items-center gap-2"
  >
    <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-emerald text-white shadow">
      <Sparkles className="h-3.5 w-3.5" />
    </div>
    <div className="flex items-center gap-1 rounded-full border border-brand-emerald/20 bg-background px-3 py-2 shadow-sm">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-brand-emerald"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  </motion.div>
);

export const PanelAria = () => {
  const visual = (
    <div className="relative w-full max-w-md">
      <div className="absolute inset-0 -z-10 rounded-[2rem] bg-gradient-emerald/15 blur-3xl" />
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-2xl shadow-brand-emerald/20">
        <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-emerald text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Aria</p>
              <p className="text-[10px] text-brand-emerald">● Online</p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground">Socratic mode</span>
        </div>

        <div className="space-y-3">
          <Bubble side="right" delay={0.2}>
            Why does the EU prioritize renewable energy over nuclear?
          </Bubble>
          <TypingDots delay={0.6} />
          <Bubble side="left" delay={1.0}>
            Good question — but is the premise true? Let's check: which countries lean heavily on nuclear today?
          </Bubble>
          <Bubble side="right" delay={1.5}>
            France, mainly. So the EU isn't unified on this?
          </Bubble>
          <Bubble side="left" delay={1.9}>
            Exactly. Now, what trade-offs explain that divergence?
          </Bubble>
        </div>
      </div>
    </div>
  );

  return (
    <StoryPanel
      eyebrow="Module 02 — Aria"
      eyebrowColorClass="text-brand-emerald"
      accentBorderClass="bg-brand-emerald"
      headline="An AI tutor that thinks with you."
      body="Aria doesn't just answer — she debates, challenges your reasoning, and guides you to deeper understanding through Socratic dialogue. Like having a brilliant study partner available 24/7."
      ctaLabel="Meet Aria"
      ctaRoute="/aria"
      ctaGradientClass="bg-gradient-emerald"
      tintClass="bg-tint-emerald/40 dark:bg-tint-emerald/30"
      visual={visual}
      reverse={true}
    />
  );
};
