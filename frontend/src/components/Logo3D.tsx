import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { useRef } from "react";

interface Logo3DProps {
  height?: number;
  className?: string;
}

export function Logo3D({ height = 40, className = "" }: Logo3DProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rX = useSpring(useTransform(my, [-0.5, 0.5], [18, -18]), { stiffness: 260, damping: 20 });
  const rY = useSpring(useTransform(mx, [-0.5, 0.5], [-18, 18]), { stiffness: 260, damping: 20 });
  const sc = useSpring(1, { stiffness: 260, damping: 20 });

  const shadowX = useTransform(mx, [-0.5, 0.5], ["-10px", "10px"]);
  const shadowY = useTransform(my, [-0.5, 0.5], ["-10px", "10px"]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
    sc.set(1.1);
  };

  const onLeave = () => {
    mx.set(0);
    my.set(0);
    sc.set(1);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      animate={{ y: [0, -5, 0] }}
      transition={{ y: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
      style={{
        rotateX: rX,
        rotateY: rY,
        scale: sc,
        perspective: 600,
        transformStyle: "preserve-3d",
      }}
      className={`cursor-pointer select-none ${className}`}
    >
      {/* Back shadow layer for depth illusion */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 12,
          background: "rgba(99,102,241,0.25)",
          filter: "blur(16px)",
          translateX: shadowX,
          translateY: shadowY,
          zIndex: -1,
          transform: "translateZ(-20px)",
        }}
      />
      <img
        src="/logo.png"
        alt="EduAI"
        draggable={false}
        style={{
          height,
          width: "auto",
          display: "block",
          borderRadius: 10,
          filter:
            "drop-shadow(0 8px 20px rgba(99,102,241,0.4)) drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
        }}
      />
    </motion.div>
  );
}
