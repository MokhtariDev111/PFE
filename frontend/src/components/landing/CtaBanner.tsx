import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

export const CtaBanner = () => {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-200, 200], [4, -4]), { stiffness: 100, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-300, 300], [-4, 4]), { stiffness: 100, damping: 30 });

  return (
    <section className="container py-24 sm:py-32">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7 }}
        style={{ rotateX, rotateY, transformPerspective: 1000 }}
        onMouseMove={(e) => {
          if (!ref.current) return;
          const r = ref.current.getBoundingClientRect();
          x.set(e.clientX - r.left - r.width / 2);
          y.set(e.clientY - r.top - r.height / 2);
        }}
        onMouseLeave={() => { x.set(0); y.set(0); }}
        className="relative mx-auto max-w-5xl cursor-default"
      >
        {/* Rotating conic glow */}
        <div className="pointer-events-none absolute -inset-px overflow-hidden rounded-[2rem]">
          <div
            className="absolute left-1/2 top-1/2 h-[160%] w-[160%] -translate-x-1/2 -translate-y-1/2 animate-spin-slow opacity-70"
            style={{
              background: "conic-gradient(from 0deg, hsl(var(--brand-violet)), hsl(var(--brand-blue)), hsl(var(--brand-emerald)), hsl(var(--brand-rose)), hsl(var(--brand-violet)))",
            }}
          />
        </div>

        <div className="relative m-[2px] overflow-hidden rounded-[calc(2rem-2px)] border border-border/50 bg-card px-8 py-16 text-center shadow-2xl sm:px-16 sm:py-20">
          <div className="absolute inset-0 -z-10 opacity-50">
            <div className="absolute -left-10 top-0 h-72 w-72 rounded-full bg-brand-violet/20 blur-3xl" />
            <div className="absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-brand-blue/20 blur-3xl" />
          </div>

          {/* Sparkles icon */}
          <motion.div
            animate={{ rotate: [0, 15, -10, 15, 0], scale: [1, 1.1, 1, 1.05, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-aurora shadow-lg shadow-brand-violet/30"
          >
            <Sparkles className="h-6 w-6 text-white" />
          </motion.div>

          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Ready to learn differently?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Upload your first document and see the magic. Free forever, no credit card required.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => navigate("/dashboard")}
              className="group h-12 rounded-full bg-gradient-aurora px-7 text-base font-medium text-white shadow-lg shadow-brand-violet/30 [background-size:200%_200%] hover:[background-position:100%_50%] hover:shadow-xl"
            >
              Get Started Free
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-emerald opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-emerald" />
              </span>
              No credit card required
            </span>
          </div>
        </div>
      </motion.div>
    </section>
  );
};
