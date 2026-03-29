import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CompletionBurstProps {
  trigger: boolean;
  onDone?: () => void;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  shape: "circle" | "rect" | "star";
}

export function CompletionBurst({ trigger, onDone }: CompletionBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>();
  const hasTriggered = useRef(false);

  const COLORS = [
    "#6366f1", "#818cf8", "#a78bfa", // primary/purple
    "#c084fc", "#e879f9", // accent/pink
    "#34d399", "#6ee7b7", // green
    "#fbbf24", "#fcd34d", // gold
    "#ffffff",
  ];

  function spawnParticles() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const newParticles: Particle[] = [];

    for (let i = 0; i < 120; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 10;
      const shapes: ("circle" | "rect" | "star")[] = ["circle", "rect", "star"];
      newParticles.push({
        id: i,
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 4 + Math.random() * 8,
        life: 0,
        maxLife: 60 + Math.random() * 60,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
      });
    }
    particlesRef.current = newParticles;
  }

  function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const xi = x + r * Math.cos(angle);
      const yi = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(xi, yi);
      else ctx.lineTo(xi, yi);
    }
    ctx.closePath();
    ctx.fill();
  }

  function animate() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particlesRef.current = particlesRef.current.filter(p => p.life < p.maxLife);
    if (particlesRef.current.length === 0) {
      onDone?.();
      return;
    }

    for (const p of particlesRef.current) {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25; // gravity
      p.vx *= 0.98; // air drag

      const alpha = 1 - p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "rect") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 0.1);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 0.08);
        drawStar(ctx, 0, 0, p.size / 2);
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;
    rafRef.current = requestAnimationFrame(animate);
  }

  useEffect(() => {
    if (!trigger || hasTriggered.current) return;
    hasTriggered.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    spawnParticles();
    rafRef.current = requestAnimationFrame(animate);

    // Reset after 4 seconds
    const reset = setTimeout(() => { hasTriggered.current = false; }, 4000);
    return () => { clearTimeout(reset); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [trigger]);

  return (
    <AnimatePresence>
      {trigger && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] pointer-events-none"
        >
          <canvas ref={canvasRef} className="w-full h-full" />
          {/* Success toast */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-card px-8 py-5 text-center glow-border"
          >
            <div className="text-4xl mb-2">🎉</div>
            <p className="font-bold text-foreground text-lg" style={{ fontFamily: "Syne, sans-serif" }}>
              Presentation Ready!
            </p>
            <p className="text-sm text-muted-foreground mt-1">Your slides have been generated</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
