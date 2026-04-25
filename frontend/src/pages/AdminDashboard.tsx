import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MessageSquare, BarChart3, Trash2, ShieldCheck,
  RefreshCw, ChevronLeft, Ban, CheckCircle, Reply,
  TrendingUp, AlertTriangle, Send, X,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { useAuth } from "@/context/AuthContext";
import { authHeaders } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:8000`;

const MODE_COLORS: Record<string, string> = {
  debate: "#7c3aed", explain: "#06b6d4", coach: "#f43f5e",
  auto: "#f59e0b", virtual: "#10b981",
};

type Panel = "overview" | "users" | "messages";

interface Stats {
  users:         { total: number; active: number; banned: number; new_today: number; new_week: number };
  conversations: { total: number; by_mode: Record<string, number> };
  contacts:      { total: number; unreplied: number; new_today: number };
}
interface User {
  user_id: string; name: string; email: string; is_admin: boolean;
  is_banned?: boolean; ban_reason?: string; auth_provider: string;
  created_at: string; conversation_count: number; avatar_url?: string;
}
interface Contact {
  contact_id: string; name: string; email: string; message: string;
  created_at: string; replied?: boolean; reply_text?: string; replied_at?: string;
}

function getInitials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function StatCard({ icon, label, value, sub, color = "text-primary" }: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl bg-current/10 ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const { toast }  = useToast();
  const [panel, setPanel]     = useState<Panel>("overview");
  const [stats, setStats]     = useState<Stats | null>(null);
  const [users, setUsers]     = useState<User[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const h = authHeaders();
      const [sRes, uRes, cRes] = await Promise.all([
        fetch(`${BASE_URL}/admin/stats`,    { headers: h }),
        fetch(`${BASE_URL}/admin/users`,    { headers: h }),
        fetch(`${BASE_URL}/admin/contacts`, { headers: h }),
      ]);
      if (!sRes.ok) throw new Error("Forbidden");
      setStats(await sRes.json());
      setUsers(await uRes.json());
      setContacts(await cRes.json());
    } catch {
      toast({ title: "Failed to load admin data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (userId: string, name: string) => {
    if (!confirm(`Delete "${name}" permanently? This cannot be undone.`)) return;
    const res = await fetch(`${BASE_URL}/admin/users/${userId}`, { method: "DELETE", headers: authHeaders() });
    if (res.ok) { setUsers(p => p.filter(u => u.user_id !== userId)); toast({ title: "User deleted" }); }
    else toast({ title: "Failed to delete", variant: "destructive" });
  };

  const handleBanToggle = async (u: User) => {
    const action = u.is_banned ? "unban" : "ban";
    let reason = "";
    if (action === "ban") {
      reason = prompt(`Reason for suspending ${u.name} (optional):`) ?? "";
    }
    const form = new FormData();
    if (action === "ban") form.append("reason", reason);
    const res = await fetch(`${BASE_URL}/admin/users/${u.user_id}/${action}`, {
      method: "PATCH", headers: authHeaders(), body: action === "ban" ? form : undefined,
    });
    if (res.ok) {
      setUsers(p => p.map(x => x.user_id === u.user_id
        ? { ...x, is_banned: action === "ban", ban_reason: reason } : x));
      toast({ title: action === "ban" ? `${u.name} suspended` : `${u.name} reinstated` });
    } else toast({ title: "Action failed", variant: "destructive" });
  };

  const handleReply = async (contactId: string) => {
    if (!replyText.trim()) return;
    setReplying(true);
    const form = new FormData();
    form.append("reply_text", replyText);
    const res = await fetch(`${BASE_URL}/admin/contacts/${contactId}/reply`, {
      method: "POST", headers: authHeaders(), body: form,
    });
    if (res.ok) {
      setContacts(p => p.map(c => c.contact_id === contactId
        ? { ...c, replied: true, reply_text: replyText, replied_at: new Date().toISOString() } : c));
      toast({ title: "Reply saved" });
      setReplyId(null);
      setReplyText("");
    } else toast({ title: "Failed to save reply", variant: "destructive" });
    setReplying(false);
  };

  const modeData = stats
    ? Object.entries(stats.conversations.by_mode).map(([name, value]) => ({ name, value }))
    : [];

  const NAV = [
    { id: "overview" as Panel, label: "Overview",  icon: <BarChart3 className="w-4 h-4" /> },
    { id: "users"    as Panel, label: "Users",     icon: <Users className="w-4 h-4" />,
      badge: stats?.users.banned ?? 0 },
    { id: "messages" as Panel, label: "Messages",  icon: <MessageSquare className="w-4 h-4" />,
      badge: stats?.contacts.unreplied ?? 0 },
  ];

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Left Sidebar ── */}
      <aside className="w-56 shrink-0 border-r border-border/50 bg-card/60 backdrop-blur-xl flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border/40">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400/15">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Admin Panel</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[100px]">{user?.name}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPanel(n.id)}
              className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                panel === n.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}>
              <span className="flex items-center gap-2.5">{n.icon}{n.label}</span>
              {!!n.badge && (
                <span className="rounded-full bg-destructive/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {n.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-4 border-t border-border/40 space-y-1">
          <button onClick={load} disabled={loading}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh data
          </button>
          <button onClick={() => navigate("/dashboard")}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-all">
            <ChevronLeft className="w-4 h-4" />
            Back to app
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">

          {/* ══ OVERVIEW ══ */}
          {panel === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              className="p-8 space-y-8">
              <h2 className="text-xl font-semibold">Overview</h2>

              {stats && (
                <>
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                    <StatCard icon={<Users className="w-5 h-5" />}   label="Total Users"
                      value={stats.users.total}
                      sub={`+${stats.users.new_today} today · +${stats.users.new_week} this week`} />
                    <StatCard icon={<CheckCircle className="w-5 h-5" />} label="Active Users"
                      value={stats.users.active} color="text-emerald-500"
                      sub="Not suspended" />
                    <StatCard icon={<Ban className="w-5 h-5" />}     label="Suspended"
                      value={stats.users.banned} color={stats.users.banned > 0 ? "text-destructive" : "text-muted-foreground"}
                      sub="Banned accounts" />
                    <StatCard icon={<BarChart3 className="w-5 h-5" />} label="Conversations"
                      value={stats.conversations.total} />
                    <StatCard icon={<MessageSquare className="w-5 h-5" />} label="Contact Messages"
                      value={stats.contacts.total}
                      sub={`${stats.contacts.unreplied} unreplied`} />
                    <StatCard icon={<TrendingUp className="w-5 h-5" />} label="New This Week"
                      value={stats.users.new_week} color="text-brand-violet" />
                  </div>

                  {/* Charts row */}
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Mode pie */}
                    <div className="rounded-2xl border border-border/60 bg-card p-6">
                      <h3 className="font-semibold mb-4">Conversations by Mode</h3>
                      {modeData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie data={modeData} cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                              paddingAngle={3} dataKey="value">
                              {modeData.map(e => <Cell key={e.name} fill={MODE_COLORS[e.name] ?? "#6b7280"} />)}
                            </Pie>
                            <Tooltip formatter={(v: number) => [v, "conversations"]} />
                            <Legend formatter={v => <span className="text-xs capitalize">{v}</span>} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No data yet</div>
                      )}
                    </div>

                    {/* User breakdown */}
                    <div className="rounded-2xl border border-border/60 bg-card p-6">
                      <h3 className="font-semibold mb-4">User Breakdown</h3>
                      <div className="space-y-4 mt-6">
                        {[
                          { label: "Active users",   value: stats.users.active,  total: stats.users.total, color: "bg-emerald-500" },
                          { label: "Suspended",      value: stats.users.banned,  total: stats.users.total, color: "bg-destructive" },
                          { label: "New this week",  value: stats.users.new_week, total: stats.users.total, color: "bg-brand-violet" },
                        ].map(r => (
                          <div key={r.label}>
                            <div className="flex justify-between text-sm mb-1.5">
                              <span className="text-muted-foreground">{r.label}</span>
                              <span className="font-medium">{r.value}</span>
                            </div>
                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                              <div className={`h-full rounded-full ${r.color} transition-all`}
                                style={{ width: r.total ? `${Math.round((r.value / r.total) * 100)}%` : "0%" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 pt-4 border-t border-border/40 grid grid-cols-2 gap-3 text-center text-sm">
                        <div>
                          <p className="text-2xl font-bold text-blue-500">
                            {users.filter(u => u.auth_provider === "google").length}
                          </p>
                          <p className="text-xs text-muted-foreground">Google accounts</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-primary">
                            {users.filter(u => u.auth_provider === "email").length}
                          </p>
                          <p className="text-xs text-muted-foreground">Email accounts</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ══ USERS ══ */}
          {panel === "users" && (
            <motion.div key="users" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Users <span className="text-muted-foreground font-normal text-base">({users.length})</span></h2>
                {stats?.users.banned! > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 rounded-full px-3 py-1">
                    <AlertTriangle className="w-3 h-3" />
                    {stats!.users.banned} suspended
                  </span>
                )}
              </div>

              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 bg-secondary/30 text-muted-foreground text-xs">
                        <th className="px-4 py-3 text-left font-medium">User</th>
                        <th className="px-4 py-3 text-left font-medium">Email</th>
                        <th className="px-4 py-3 text-left font-medium">Provider</th>
                        <th className="px-4 py-3 text-center font-medium">Chats</th>
                        <th className="px-4 py-3 text-left font-medium">Joined</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.user_id} className={`border-b border-border/20 transition-colors ${u.is_banned ? "bg-destructive/5" : "hover:bg-secondary/20"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt={u.name} className="h-7 w-7 rounded-full object-cover" />
                              ) : (
                                <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white">
                                  {getInitials(u.name)}
                                </div>
                              )}
                              <div>
                                <p className="font-medium leading-none">{u.name}</p>
                                {u.is_admin && <span className="text-[10px] text-amber-600">admin</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              u.auth_provider === "google"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                : "bg-secondary text-muted-foreground"
                            }`}>{u.auth_provider}</span>
                          </td>
                          <td className="px-4 py-3 text-center">{u.conversation_count}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {u.is_banned ? (
                              <span className="flex items-center gap-1 text-xs text-destructive">
                                <Ban className="w-3 h-3" /> Suspended
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-emerald-600">
                                <CheckCircle className="w-3 h-3" /> Active
                              </span>
                            )}
                            {u.is_banned && u.ban_reason && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[120px] truncate" title={u.ban_reason}>
                                {u.ban_reason}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {!u.is_admin && (
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => handleBanToggle(u)} title={u.is_banned ? "Unban" : "Suspend"}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    u.is_banned
                                      ? "text-emerald-600 hover:bg-emerald-500/10"
                                      : "text-amber-600 hover:bg-amber-500/10"
                                  }`}>
                                  {u.is_banned ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                </button>
                                <button onClick={() => handleDelete(u.user_id, u.name)} title="Delete"
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && !loading && (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No users yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ MESSAGES ══ */}
          {panel === "messages" && (
            <motion.div key="messages" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Contact Messages <span className="text-muted-foreground font-normal text-base">({contacts.length})</span></h2>
                {stats?.contacts.unreplied! > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 rounded-full px-3 py-1">
                    <AlertTriangle className="w-3 h-3" />
                    {stats!.contacts.unreplied} unreplied
                  </span>
                )}
              </div>

              {contacts.length === 0 && !loading ? (
                <div className="rounded-2xl border border-border/60 bg-card px-5 py-16 text-center text-sm text-muted-foreground">
                  No contact messages yet
                </div>
              ) : (
                <div className="space-y-3">
                  {contacts.map(c => (
                    <div key={c.contact_id}
                      className={`rounded-2xl border bg-card overflow-hidden transition-colors ${
                        c.replied ? "border-border/40" : "border-amber-400/30"
                      }`}>
                      {/* Message header */}
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{c.name}</p>
                              <span className="text-muted-foreground text-xs">·</span>
                              <span className="text-muted-foreground text-xs">{c.email}</span>
                              {c.replied ? (
                                <span className="ml-1 flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600">
                                  <CheckCircle className="w-2.5 h-2.5" /> Replied
                                </span>
                              ) : (
                                <span className="ml-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-600">
                                  Unreplied
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{c.message}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}
                            </span>
                            {!c.replied && replyId !== c.contact_id && (
                              <button onClick={() => { setReplyId(c.contact_id); setReplyText(""); }}
                                className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all">
                                <Reply className="w-3.5 h-3.5" /> Reply
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Existing reply */}
                        {c.replied && c.reply_text && (
                          <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                            <p className="text-xs font-medium text-emerald-600 mb-1">Your reply</p>
                            <p className="text-sm text-muted-foreground">{c.reply_text}</p>
                          </div>
                        )}
                      </div>

                      {/* Reply input */}
                      <AnimatePresence>
                        {replyId === c.contact_id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                            className="border-t border-border/40 bg-secondary/20 px-5 py-4">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Reply to <strong>{c.name}</strong> — note saved in admin panel
                            </p>
                            <textarea
                              value={replyText}
                              onChange={e => setReplyText(e.target.value)}
                              placeholder="Type your reply…"
                              rows={3}
                              className="w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => handleReply(c.contact_id)} disabled={replying || !replyText.trim()}
                                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity">
                                <Send className="w-3.5 h-3.5" />
                                {replying ? "Saving…" : "Save reply"}
                              </button>
                              <button onClick={() => setReplyId(null)}
                                className="flex items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                <X className="w-3.5 h-3.5" /> Cancel
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
