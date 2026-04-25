import { motion, AnimatePresence } from "framer-motion";
import { Mail, MapPin, MessageSquare, Send } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const contactSchema = z.object({
  name: z.string().trim().min(1, { message: "Name is required" }).max(100),
  email: z.string().trim().email({ message: "Invalid email address" }).max(255),
  message: z.string().trim().min(1, { message: "Message is required" }).max(1000),
});

const ContactUs = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [videoDone, setVideoDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      message: String(formData.get("message") ?? ""),
    };
    const result = contactSchema.safeParse(data);
    if (!result.success) {
      toast({ title: "Please check your input", description: result.error.issues[0]?.message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? `${window.location.protocol}//${window.location.hostname}:8000`;
      const form = new FormData();
      form.append("name", data.name);
      form.append("email", data.email);
      form.append("message", data.message);
      const res = await fetch(`${BASE_URL}/contact`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Failed to send");
      toast({ title: "Message sent", description: "Thanks! We'll get back to you within 24 hours." });
      (e.target as HTMLFormElement).reset();
    } catch {
      toast({ title: "Failed to send", description: "Please try again later.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Full-screen video intro */}
      <AnimatePresence>
        {!videoDone && (
          <motion.div
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <video
              ref={videoRef}
              src="/contact_us.mp4"
              autoPlay
              playsInline
              className="h-full w-full object-cover"
              onEnded={() => setVideoDone(true)}
            />
            {/* Skip button */}
            <button
              onClick={() => setVideoDone(true)}
              className="absolute bottom-8 right-8 rounded-full border border-white/30 bg-black/40 px-5 py-2 text-sm font-medium text-white backdrop-blur hover:bg-black/60 transition-colors"
            >
              Skip →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-32 pb-24">
        <section className="container max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <MessageSquare className="h-3.5 w-3.5 text-brand-rose" />
              Contact us
            </span>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              Let's <span className="bg-gradient-rose bg-clip-text text-transparent">talk</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Questions, feedback, partnerships — drop us a line and we'll get back to you fast.
            </p>
          </motion.div>

          <div className="mt-16 grid gap-10 lg:grid-cols-5">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="lg:col-span-2 space-y-5">
              <div className="rounded-2xl border border-border/70 bg-card p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-violet/10">
                  <Mail className="h-5 w-5 text-brand-violet" />
                </span>
                <h3 className="mt-4 font-semibold">Email</h3>
                <p className="mt-1 text-sm text-muted-foreground">hello@eduai.app</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-emerald/10">
                  <MapPin className="h-5 w-5 text-brand-emerald" />
                </span>
                <h3 className="mt-4 font-semibold">Office</h3>
                <p className="mt-1 text-sm text-muted-foreground">Remote-first · Global team</p>
              </div>
            </motion.div>

            <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="lg:col-span-3 space-y-5 rounded-2xl border border-border/70 bg-card p-6 sm:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Jane Doe" maxLength={100} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="jane@example.com" maxLength={255} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" name="message" placeholder="Tell us how we can help…" rows={6} maxLength={1000} required />
              </div>
              <Button type="submit" disabled={submitting} size="lg" className="group h-11 w-full rounded-full bg-gradient-aurora text-white sm:w-auto">
                {submitting ? "Sending…" : "Send message"}
                <Send className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </motion.form>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  </>
  );
};

export default ContactUs;
