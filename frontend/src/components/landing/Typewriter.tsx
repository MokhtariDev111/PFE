import { useEffect, useState } from "react";

interface TypewriterProps {
  phrases: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseAfterType?: number;
  pauseAfterDelete?: number;
  className?: string;
}

export const Typewriter = ({
  phrases,
  typingSpeed = 55,
  deletingSpeed = 30,
  pauseAfterType = 1600,
  pauseAfterDelete = 350,
  className,
}: TypewriterProps) => {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"typing" | "pausing" | "deleting" | "next">("typing");

  useEffect(() => {
    const current = phrases[index % phrases.length];
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (text.length < current.length) {
        timer = setTimeout(() => setText(current.slice(0, text.length + 1)), typingSpeed);
      } else {
        timer = setTimeout(() => setPhase("deleting"), pauseAfterType);
      }
    } else if (phase === "deleting") {
      if (text.length > 0) {
        timer = setTimeout(() => setText(current.slice(0, text.length - 1)), deletingSpeed);
      } else {
        timer = setTimeout(() => setPhase("next"), pauseAfterDelete);
      }
    } else if (phase === "next") {
      setIndex((i) => (i + 1) % phrases.length);
      setPhase("typing");
    }

    return () => clearTimeout(timer);
  }, [text, phase, index, phrases, typingSpeed, deletingSpeed, pauseAfterType, pauseAfterDelete]);

  return (
    <span className={className}>
      {text}
      <span className="ml-0.5 inline-block h-[1em] w-[2px] -translate-y-[2px] bg-current align-middle animate-blink-caret" />
    </span>
  );
};
