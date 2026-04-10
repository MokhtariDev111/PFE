import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function ContactUs() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-6 pt-24 pb-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Get in touch
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Contact Us</h1>
          <p className="text-muted-foreground text-lg mb-10">
            Have a question or feedback? Reach out directly.
          </p>

          <div className="flex flex-col gap-4">
            <a
              href="mailto:[email]"
              className="flex items-center gap-4 p-5 rounded-2xl bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all group"
            >
              <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 7.5-9.75-7.5" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                <p className="font-medium text-foreground">[email]</p>
              </div>
            </a>

            <a
              href="https://www.linkedin.com/in/mohamed-aziz-mokhtari-469777365"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-5 rounded-2xl bg-card border border-border hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all group"
            >
              <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">LinkedIn</p>
                <p className="font-medium text-foreground">Mohamed Aziz Mokhtari</p>
              </div>
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
