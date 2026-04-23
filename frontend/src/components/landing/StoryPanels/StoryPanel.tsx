import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StoryPanelProps {
  eyebrow: string;
  eyebrowColorClass: string; // e.g. text-brand-violet
  accentBorderClass: string; // e.g. bg-brand-violet
  headline: string;
  body: string;
  ctaLabel: string;
  ctaRoute: string;
  ctaGradientClass: string; // e.g. bg-gradient-violet
  visual: ReactNode;
  tintClass: string; // e.g. bg-tint-violet
  reverse?: boolean; // false: text left, visual right. true: opposite
}

export const StoryPanel = ({
  eyebrow,
  eyebrowColorClass,
  accentBorderClass,
  headline,
  body,
  ctaLabel,
  ctaRoute,
  ctaGradientClass,
  visual,
  tintClass,
  reverse = false,
}: StoryPanelProps) => {
  const navigate = useNavigate();

  const textInitialX = reverse ? 60 : -60;
  const visualInitialX = reverse ? -60 : 60;

  const text = (
    <motion.div
      initial={{ opacity: 0, x: textInitialX }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="max-w-xl"
    >
      <div className="flex items-center gap-3">
        <span className={cn("h-6 w-[3px] rounded-full", accentBorderClass)} />
        <span className={cn("text-xs font-semibold uppercase tracking-[0.18em]", eyebrowColorClass)}>
          {eyebrow}
        </span>
      </div>
      <h3 className="mt-5 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">
        {headline}
      </h3>
      <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
        {body}
      </p>
      <Button
        onClick={() => navigate(ctaRoute)}
        size="lg"
        className={cn(
          "group mt-8 h-11 rounded-full px-6 text-sm font-medium text-white shadow-lg [background-size:200%_200%] hover:[background-position:100%_50%]",
          ctaGradientClass,
        )}
      >
        {ctaLabel}
        <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Button>
    </motion.div>
  );

  const visualBlock = (
    <motion.div
      initial={{ opacity: 0, x: visualInitialX }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
      className="flex w-full items-center justify-center"
    >
      {visual}
    </motion.div>
  );

  return (
    <section className={cn("relative flex min-h-screen items-center py-24", tintClass)}>
      <div
        className={cn(
          "container grid items-center gap-12 lg:grid-cols-2 lg:gap-16",
        )}
      >
        {reverse ? (
          <>
            <div className="order-2 lg:order-1">{visualBlock}</div>
            <div className="order-1 lg:order-2 lg:justify-self-end">{text}</div>
          </>
        ) : (
          <>
            <div>{text}</div>
            <div>{visualBlock}</div>
          </>
        )}
      </div>
    </section>
  );
};
