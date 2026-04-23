import { GraduationCap, Linkedin, Mail, Sparkles } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="border-t border-border/70 bg-background py-14">
      <div className="container grid gap-10 md:grid-cols-2 md:gap-12">
        <div className="max-w-md">
          <div className="flex items-center gap-2.5">
            <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-aurora">
              <GraduationCap className="h-4 w-4 text-white" strokeWidth={2.5} />
              <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-brand-cyan" />
            </span>
            <span className="text-base font-semibold tracking-tight">EduAI</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            EduAI is an AI-powered learning ecosystem for students and educators
            anywhere in the world. One platform, four intelligent tools, and an
            adaptive partner that grows with you.
          </p>
        </div>

        <div className="flex flex-col gap-4 md:items-end">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Contact
          </p>
          <div className="flex flex-col gap-3 md:items-end">
            <a
              href="mailto:hello@eduai.app"
              className="group inline-flex items-center gap-2 text-sm text-foreground/80 transition-colors hover:text-foreground"
            >
              <Mail className="h-4 w-4 text-brand-violet" />
              hello@eduai.app
            </a>
            <a
              href="https://www.linkedin.com"
              target="_blank"
              rel="noreferrer noopener"
              className="group inline-flex items-center gap-2 text-sm text-foreground/80 transition-colors hover:text-foreground"
            >
              <Linkedin className="h-4 w-4 text-brand-blue" />
              LinkedIn
            </a>
          </div>
        </div>
      </div>

      <div className="container mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <p>© {new Date().getFullYear()} EduAI. All rights reserved.</p>
        <p>Designed for curious minds, everywhere.</p>
      </div>
    </footer>
  );
};
