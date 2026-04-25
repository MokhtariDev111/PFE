import { motion } from "framer-motion";
import { GraduationCap, Lock, Mail, Sparkles, User } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const loginSchema = z.object({
  email: z.string().trim().email({ message: "Please enter a valid email" }).max(255),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).max(128),
});

const signupSchema = z.object({
  name: z.string().trim().min(2, { message: "Name must be at least 2 characters" }).max(80),
  email: z.string().trim().email({ message: "Please enter a valid email" }).max(255),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }).max(128),
});

const LoginInner = () => {
  const { toast }    = useToast();
  const { login, signup, googleLogin } = useAuth();
  const navigate     = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSuccess = async (response: { credential?: string }) => {
    if (!response.credential) return;
    try {
      await googleLogin(response.credential);
      navigate("/", { replace: true });
    } catch (err) {
      toast({ title: "Google sign-in failed", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") };
    const result = loginSchema.safeParse(data);
    if (!result.success) { toast({ title: "Invalid input", description: result.error.issues[0]?.message, variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      await login(data.email, data.password);
      navigate("/", { replace: true });
    } catch (err) {
      toast({ title: "Sign in failed", description: err instanceof Error ? err.message : "Invalid email or password", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") };
    const result = signupSchema.safeParse(data);
    if (!result.success) { toast({ title: "Invalid input", description: result.error.issues[0]?.message, variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      await signup(data.name, data.email, data.password);
      navigate("/", { replace: true });
    } catch (err) {
      toast({ title: "Registration failed", description: err instanceof Error ? err.message : "Could not create account", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background" >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-violet/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-brand-rose/20 blur-3xl" />
      </div>

      <header className="container flex h-16 items-center justify-between">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-aurora shadow-lg shadow-brand-violet/30">
            <GraduationCap className="h-4 w-4 text-white" strokeWidth={2.5} />
            <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-brand-cyan drop-shadow" />
          </span>
          <span className="text-base font-semibold tracking-tight">EduAI</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md rounded-3xl border border-border/70 bg-card/80 p-8 shadow-2xl shadow-brand-violet/10 backdrop-blur-xl sm:p-10">
          <Tabs defaultValue="login" className="w-full">
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome to EduAI</h1>
              <p className="mt-2 text-sm text-muted-foreground">Log in or create an account to get started.</p>
            </div>
            <TabsList className="mt-6 grid w-full grid-cols-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            {/* Google Sign-In */}
            {GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== "your-google-client-id-here" && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <div className="flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">or continue with</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => toast({ title: "Google sign-in failed", variant: "destructive" })}
                  theme="outline"
                  shape="pill"
                  width="340"
                />
              </div>
            )}

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">or with email</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <TabsContent value="login" className="mt-0">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="login-email" name="email" type="email" placeholder="you@example.com" className="pl-9" maxLength={255} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="login-password" name="password" type="password" placeholder="••••••••" className="pl-9" maxLength={128} required />
                  </div>
                </div>
                <Button type="submit" disabled={submitting} size="lg" className="h-11 w-full rounded-full bg-gradient-aurora text-white shadow-lg">
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-0">
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full name</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="signup-name" name="name" type="text" placeholder="Ada Lovelace" className="pl-9" maxLength={80} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="signup-email" name="email" type="email" placeholder="you@example.com" className="pl-9" maxLength={255} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="signup-password" name="password" type="password" placeholder="At least 8 characters" className="pl-9" maxLength={128} required />
                  </div>
                </div>
                <Button type="submit" disabled={submitting} size="lg" className="h-11 w-full rounded-full bg-gradient-aurora text-white shadow-lg">
                  {submitting ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
};

const Login = () => {
  const clientId = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== "your-google-client-id-here"
    ? GOOGLE_CLIENT_ID
    : "placeholder";
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <LoginInner />
    </GoogleOAuthProvider>
  );
};

export default Login;
