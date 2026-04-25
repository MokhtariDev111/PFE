import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ChevronLeft, Save, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function resizeToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 200;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      // Center-crop
      const side = Math.min(img.width, img.height);
      const sx   = (img.width  - side) / 2;
      const sy   = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Invalid image")); };
    img.src = url;
  });
}

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const navigate  = useNavigate();
  const { toast } = useToast();
  const fileRef   = useRef<HTMLInputElement>(null);

  const [name,      setName]      = useState(user?.name ?? "");
  const [preview,   setPreview]   = useState<string>(user?.avatar_url ?? "");
  const [avatarB64, setAvatarB64] = useState("");
  const [saving,    setSaving]    = useState(false);

  if (!user) { navigate("/login", { replace: true }); return null; }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }
    try {
      const b64 = await resizeToBase64(file);
      setPreview(b64);
      setAvatarB64(b64);
    } catch {
      toast({ title: "Could not process image", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name cannot be empty", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateProfile(name.trim(), avatarB64);
      toast({ title: "Profile updated" });
    } catch (err) {
      toast({ title: "Failed to update", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-6 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">Edit Profile</h1>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-border/60 bg-card p-8 shadow-xl shadow-brand-violet/5">

          {/* Avatar */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-border/40 bg-secondary">
                {preview ? (
                  <img src={preview} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-accent text-2xl font-bold text-white">
                    {getInitials(name || user.name)}
                  </div>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-2 border-background bg-primary text-white shadow-md hover:scale-105 transition-transform"
                title="Change photo"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <p className="text-xs text-muted-foreground">Click the camera icon to change your photo</p>
          </div>

          {/* Fields */}
          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="profile-name" value={name} onChange={e => setName(e.target.value)}
                  className="pl-9" maxLength={80} placeholder="Your full name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user.email} disabled className="cursor-not-allowed opacity-60" />
              <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
            </div>
          </div>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving} size="lg"
            className="mt-8 h-11 w-full rounded-full bg-gradient-aurora text-white shadow-lg">
            {saving ? "Saving…" : <><Save className="mr-2 h-4 w-4" /> Save changes</>}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
