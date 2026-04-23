import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

const PHOTOS = [
  "/pexels-matreding-4397200.jpg",
  "/pexels-pixabay-159775.jpg",
  "/pexels-cottonbro-4709290.jpg",
];


const AboutUs = () => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % PHOTOS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero with background slideshow */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden">

        {/* Sliding photos as background */}
        <AnimatePresence>
          <motion.img
            key={current}
            src={PHOTOS[current]}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        </AnimatePresence>

        {/* Dark overlay so text is readable */}
        <div className="absolute inset-0 bg-black/55" />

        {/* Text content */}
        <div className="relative z-10 container max-w-4xl text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-brand-violet" />
              About EduAI
            </span>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              Reimagining how the world{" "}
              <span className="bg-gradient-aurora bg-clip-text text-transparent">learns</span>.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
              EduAI is an AI-powered learning assistant that turns any document into presentations, quizzes, and exams — so studying feels less like work and more like progress.
            </p>
          </motion.div>

        </div>
      </section>

      {/* Values + Story */}
      <main className="py-24">
        <section className="container max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="mt-20 rounded-3xl border border-border/70 bg-gradient-aurora/10 p-10 sm:p-14"
          >
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Our story</h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              We started EduAI because studying shouldn't mean spending hours reformatting notes or building practice tests from scratch. By pairing modern AI with thoughtful design, we give learners back their time — and make every minute they spend studying count.
            </p>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default AboutUs;
