import { motion } from "framer-motion";
import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    name: "Emna Bkhari",
    role: "Data Science Student",
    avatar: "EB",
    avatarColor: "bg-brand-violet/20 text-brand-violet",
    text: "I generated a full anatomy-style quiz in seconds. It's really useful for quick revision before exams.",
    rating: 5,
  },
  {
    name: "Kamel Oueslati",
    role: "Data Science Student",
    avatar: "KO",
    avatarColor: "bg-brand-blue/20 text-brand-blue",
    text: "I used to spend a lot of time organizing my presentations. Now I just upload my course and get a solid structure instantly.",
    rating: 5,
  },
  {
    name: "Ghassen Messaoudi",
    role: "Data Science Student",
    avatar: "GM",
    avatarColor: "bg-brand-emerald/20 text-brand-emerald",
    text: "Discussing machine learning concepts with ARIA makes things much clearer. It's more interactive than just reading slides.",
    rating: 5,
  },
  {
    name: "Tasnime Ellabou",
    role: "Data Science Student",
    avatar: "TE",
    avatarColor: "bg-brand-rose/20 text-brand-rose",
    text: "The exam simulator feels very close to real exams. It helps me practice in a more realistic way.",
    rating: 5,
  },
  {
    name: "Rahma Jlassi",
    role: "Data Science Student",
    avatar: "RJ",
    avatarColor: "bg-brand-violet/20 text-brand-violet",
    text: "The quizzes help me quickly check what I really understand, especially for statistics and ML topics.",
    rating: 5,
  },
  {
    name: "Siwar Garess",
    role: "Data Science Student",
    avatar: "SG",
    avatarColor: "bg-brand-blue/20 text-brand-blue",
    text: "Everything is simple and practical. I can study, test myself, and review without switching between tools.",
    rating: 5,
  },
];

function TestimonialCard({ t, delay }: { t: typeof TESTIMONIALS[0]; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm hover:shadow-lg transition-shadow"
    >
      <div className="flex gap-0.5 mb-3">
        {Array.from({ length: t.rating }).map((_, i) => (
          <Star key={i} className="h-3.5 w-3.5 fill-brand-violet text-brand-violet" />
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">"{t.text}"</p>
      <div className="mt-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-full ${t.avatarColor} flex items-center justify-center text-xs font-semibold`}>
          {t.avatar}
        </div>
        <div>
          <div className="text-sm font-medium">{t.name}</div>
          <div className="text-xs text-muted-foreground">{t.role}</div>
        </div>
      </div>
    </motion.div>
  );
}

export const SocialProof = () => {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* Subtle background accent */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-violet/5 blur-3xl" />
      </div>

      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center mb-16"
        >
          <span className="inline-block rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground mb-4">
            Loved by learners
          </span>
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Real students. Real results.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Join thousands of learners already studying smarter.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <TestimonialCard key={t.name} t={t} delay={i * 0.08} />
          ))}
        </div>
      </div>
    </section>
  );
};
