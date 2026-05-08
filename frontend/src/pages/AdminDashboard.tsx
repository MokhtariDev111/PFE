import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MessageSquare, BarChart3, Trash2, ShieldCheck,
  RefreshCw, ChevronLeft, Ban, CheckCircle, Reply,
  TrendingUp, AlertTriangle, Send, X, CalendarDays, Plus, Pencil, Camera,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
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

type Panel = "overview" | "users" | "messages" | "timetable" | "attendance";

interface TimetableEntry {
  class_id: string;
  teacher_name: string;
  teacher_email: string;
  subject: string;
  day: string;
  start_time: string;
  end_time: string;
  classroom: string;
  year: string;
  enrolled_students?: { user_id: string; name: string; email: string }[];
}

interface Stats {
  users:         { total: number; active: number; banned: number; new_today: number; new_week: number };
  conversations: { total: number; by_mode: Record<string, number> };
  contacts:      { total: number; unreplied: number; new_today: number };
}
interface User {
  user_id: string; name: string; email: string; role: "student" | "teacher" | "admin";
  is_banned?: boolean; ban_reason?: string; auth_provider: string;
  created_at: string; conversation_count: number; avatar_url?: string;
}
interface Contact {
  contact_id: string; name: string; email: string; message: string;
  created_at: string; replied?: boolean; reply_text?: string; replied_at?: string;
}
interface AttendanceSession {
  session_id: string; subject: string; teacher_id: string; class_id: string;
  date: string; status: string;
  created_at?: string; closed_at?: string;
  records: { name: string; confidence: number; marked_at: string }[];
  absent_records?: { name: string; email: string; user_id: string }[];
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
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [timetable, setTimetable]   = useState<TimetableEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [replyId, setReplyId]       = useState<string | null>(null);
  const [replyText, setReplyText]   = useState("");
  const [replying, setReplying]     = useState(false);
  const [ttForm, setTtForm]         = useState<Partial<TimetableEntry> | null>(null);
  const [ttSaving, setTtSaving]     = useState(false);
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>([]);
  const [selectedAttKey, setSelectedAttKey]   = useState<string>(""); // "year||classroom"
  const [selectedAttDay, setSelectedAttDay]   = useState<string>(""); // "Monday"..."Friday"
  const [selectedTtKey,  setSelectedTtKey]    = useState<string>(""); // "year||classroom"

  const load = async () => {
    setLoading(true);
    try {
      const h = authHeaders();
      const [sRes, uRes, cRes, ttRes, attRes] = await Promise.all([
        fetch(`${BASE_URL}/admin/stats`,     { headers: h }),
        fetch(`${BASE_URL}/admin/users`,     { headers: h }),
        fetch(`${BASE_URL}/admin/contacts`,  { headers: h }),
        fetch(`${BASE_URL}/admin/timetable`, { headers: h }),
        fetch(`${BASE_URL}/attendance/all`,  { headers: h }),
      ]);
      if (!sRes.ok) {
        const body = await sRes.text().catch(() => "");
        throw new Error(`Stats ${sRes.status}: ${body.slice(0, 120)}`);
      }
      setStats(await sRes.json());
      setUsers(uRes.ok ? await uRes.json() : []);
      setContacts(cRes.ok ? await cRes.json() : []);
      if (ttRes.ok)  setTimetable(await ttRes.json());
      if (attRes.ok) setAttendanceSessions(await attRes.json());
    } catch (err: any) {
      console.error("Admin load error:", err);
      toast({ title: "Failed to load admin data", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleTtSave = async () => {
    if (!ttForm) return;
    setTtSaving(true);
    const form = new FormData();
    (["teacher_name","teacher_email","subject","day","start_time","end_time","classroom","year"] as const)
      .forEach(k => form.append(k, (ttForm[k] as string) ?? ""));
    const isEdit = !!ttForm.class_id;
    const url    = isEdit ? `${BASE_URL}/admin/timetable/${ttForm.class_id}` : `${BASE_URL}/admin/timetable`;
    const res    = await fetch(url, { method: isEdit ? "PUT" : "POST", headers: authHeaders(), body: form });
    if (res.ok) {
      const saved: TimetableEntry = await res.json();
      setTimetable(p => isEdit ? p.map(e => e.class_id === saved.class_id ? saved : e) : [...p, saved]);
      setTtForm(null);
      toast({ title: isEdit ? "Entry updated" : "Entry added" });
    } else toast({ title: "Save failed", variant: "destructive" });
    setTtSaving(false);
  };

  const handleTtDelete = async (class_id: string) => {
    if (!confirm("Delete this timetable entry?")) return;
    const res = await fetch(`${BASE_URL}/admin/timetable/${class_id}`, { method: "DELETE", headers: authHeaders() });
    if (res.ok) { setTimetable(p => p.filter(e => e.class_id !== class_id)); toast({ title: "Deleted" }); }
    else toast({ title: "Delete failed", variant: "destructive" });
  };


  useEffect(() => { load(); }, []);
  useEffect(() => { setSelectedAttDay(""); }, [selectedAttKey]);

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

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm("Delete this message permanently?")) return;
    const res = await fetch(`${BASE_URL}/admin/contacts/${contactId}`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (res.ok) {
      setContacts(p => p.filter(c => c.contact_id !== contactId));
      toast({ title: "Message deleted" });
    } else toast({ title: "Delete failed", variant: "destructive" });
  };

  const modeData = stats
    ? Object.entries(stats.conversations.by_mode).map(([name, value]) => ({ name, value }))
    : [];

  const NAV = [
    { id: "overview"  as Panel, label: "Overview",   icon: <BarChart3 className="w-4 h-4" /> },
    { id: "users"     as Panel, label: "Users",      icon: <Users className="w-4 h-4" />,
      badge: stats?.users.banned ?? 0 },
    { id: "messages"  as Panel, label: "Messages",   icon: <MessageSquare className="w-4 h-4" />,
      badge: stats?.contacts.unreplied ?? 0 },
    { id: "timetable"  as Panel, label: "Timetable",  icon: <CalendarDays className="w-4 h-4" /> },
    { id: "attendance" as Panel, label: "Attendance", icon: <Camera className="w-4 h-4" /> },
  ];

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Left Sidebar ── */}
      <aside className="w-56 shrink-0 border-r border-border/50 bg-card/60 backdrop-blur-xl flex flex-col">
        {/* Logo */}
        <div className="flex items-center justify-between px-3 py-5 border-b border-border/40">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400/15 shrink-0">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold leading-none">Admin</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[110px]">{user?.name}</p>
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
          {panel === "users" && (() => {
            const teachers = users.filter(u => u.role === "teacher");
            const students = users.filter(u => u.role === "student");

            const UserTable = ({ list, emptyLabel, accent }: {
              list: User[];
              emptyLabel: string;
              accent: string;
            }) => (
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 bg-secondary/30 text-muted-foreground text-xs">
                        <th className="px-4 py-3 text-left font-medium">Name</th>
                        <th className="px-4 py-3 text-left font-medium">Email</th>
                        <th className="px-4 py-3 text-left font-medium">Provider</th>
                        <th className="px-4 py-3 text-center font-medium">Chats</th>
                        <th className="px-4 py-3 text-left font-medium">Joined</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(u => (
                        <tr key={u.user_id} className={`border-b border-border/20 transition-colors ${u.is_banned ? "bg-destructive/5" : "hover:bg-secondary/20"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt={u.name} className="h-7 w-7 rounded-full object-cover" />
                              ) : (
                                <div className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white ${accent}`}>
                                  {getInitials(u.name)}
                                </div>
                              )}
                              <p className="font-medium leading-none">{u.name}</p>
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
                          </td>
                        </tr>
                      ))}
                      {list.length === 0 && !loading && (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm italic">{emptyLabel}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );

            return (
              <motion.div key="users" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                className="p-8 space-y-8">

                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Users</h2>
                  {(stats?.users.banned ?? 0) > 0 && (
                    <span className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 rounded-full px-3 py-1">
                      <AlertTriangle className="w-3 h-3" />
                      {stats!.users.banned} suspended
                    </span>
                  )}
                </div>

                {/* Teachers */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                    <h3 className="font-semibold text-sm text-purple-400">Teachers
                      <span className="ml-2 text-muted-foreground font-normal">({teachers.length})</span>
                    </h3>
                  </div>
                  <UserTable list={teachers} emptyLabel="No teachers registered yet." accent="bg-gradient-to-br from-purple-500 to-violet-600" />
                </div>

                {/* Students */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <h3 className="font-semibold text-sm text-blue-400">Students
                      <span className="ml-2 text-muted-foreground font-normal">({students.length})</span>
                    </h3>
                  </div>
                  <UserTable list={students} emptyLabel="No students registered yet." accent="bg-gradient-to-br from-blue-500 to-cyan-500" />
                </div>

              </motion.div>
            );
          })()}

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
                            <div className="flex items-center gap-1.5">
                              {!c.replied && replyId !== c.contact_id && (
                                <button onClick={() => { setReplyId(c.contact_id); setReplyText(""); }}
                                  className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all">
                                  <Reply className="w-3.5 h-3.5" /> Reply
                                </button>
                              )}
                              <button onClick={() => handleDeleteContact(c.contact_id)}
                                className="flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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

          {/* ══ TIMETABLE ══ */}
          {panel === "timetable" && (
            <motion.div key="timetable" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              className="p-8 space-y-6">

              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Timetable</h2>
                <button onClick={() => setTtForm({})}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
                  <Plus className="w-4 h-4" /> Add Entry
                </button>
              </div>

              {/* Add/Edit form */}
              {ttForm !== null && (() => {
                const teacherOptions = users.filter(u => u.role === "teacher");
                const selEmail = ttForm.teacher_email ?? "";
                const teacherSubjects = Array.from(new Set(timetable.filter(e => e.teacher_email === selEmail).map(e => e.subject)));
                const allSubjects = Array.from(new Set(timetable.map(e => e.subject).filter(Boolean)));
                const classroomSuggestions = Array.from(new Set(timetable.map(e => e.classroom).filter(Boolean)));
                const yearSuggestions = Array.from(new Set(timetable.map(e => e.year).filter(Boolean)));
                return (
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
                    <p className="text-sm font-semibold">{ttForm.class_id ? "Edit entry" : "New entry"}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 col-span-2">
                        <label className="text-xs font-medium text-muted-foreground">Teacher</label>
                        <select value={ttForm.teacher_email ?? ""} onChange={e => { const t = teacherOptions.find(u => u.email === e.target.value); setTtForm(p => ({ ...p!, teacher_email: e.target.value, teacher_name: t?.name ?? "" })); }}
                          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                          <option value="">Select a teacher…</option>
                          {teacherOptions.map(u => <option key={u.user_id} value={u.email}>{u.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Subject</label>
                        <input list="tt-subjects" value={ttForm.subject ?? ""} onChange={e => setTtForm(p => ({ ...p!, subject: e.target.value }))} placeholder="e.g. Machine Learning"
                          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                        <datalist id="tt-subjects">{(teacherSubjects.length > 0 ? teacherSubjects : allSubjects).map(s => <option key={s} value={s} />)}</datalist>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Classroom</label>
                        <input list="tt-classrooms" value={ttForm.classroom ?? ""} onChange={e => setTtForm(p => ({ ...p!, classroom: e.target.value }))} placeholder="e.g. SDIA-C"
                          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                        <datalist id="tt-classrooms">{classroomSuggestions.map(c => <option key={c} value={c} />)}</datalist>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Year / Grade</label>
                        <input list="tt-years" value={ttForm.year ?? ""} onChange={e => setTtForm(p => ({ ...p!, year: e.target.value }))} placeholder="e.g. 5th Year"
                          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                        <datalist id="tt-years">{yearSuggestions.map(y => <option key={y} value={y} />)}</datalist>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Day</label>
                        <select value={ttForm.day ?? ""} onChange={e => setTtForm(p => ({ ...p!, day: e.target.value }))}
                          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                          <option value="">Select day…</option>
                          {["Monday","Tuesday","Wednesday","Thursday","Friday"].map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Start time</label>
                        <input type="time" value={ttForm.start_time ?? ""} onChange={e => setTtForm(p => ({ ...p!, start_time: e.target.value }))}
                          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">End time</label>
                        <input type="time" value={ttForm.end_time ?? ""} onChange={e => setTtForm(p => ({ ...p!, end_time: e.target.value }))}
                          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleTtSave} disabled={ttSaving}
                        className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity">
                        {ttSaving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setTtForm(null)}
                        className="rounded-xl border border-border/60 px-5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Classroom selector */}
              {(() => {
                const GRADE_COLORS: Record<string, { header: string; card: string; dot: string }> = {
                  "5th Year": { header: "text-violet-400", card: "border-violet-500/30 bg-violet-500/8 hover:bg-violet-500/15", dot: "bg-violet-500" },
                  "4th Year": { header: "text-blue-400",   card: "border-blue-500/30 bg-blue-500/8 hover:bg-blue-500/15",     dot: "bg-blue-500"   },
                };
                const FALLBACK_COLOR = { header: "text-muted-foreground", card: "border-border bg-secondary/30 hover:bg-secondary/50", dot: "bg-muted-foreground" };

                const yearGroups: Record<string, { classroom: string; year: string; count: number }[]> = {};
                const seen = new Set<string>();
                timetable.forEach(e => {
                  const key = `${e.year}||${e.classroom}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    if (!yearGroups[e.year]) yearGroups[e.year] = [];
                    yearGroups[e.year].push({ classroom: e.classroom, year: e.year, count: timetable.filter(x => x.year === e.year && x.classroom === e.classroom).length });
                  }
                });
                const years = Object.keys(yearGroups).sort();

                return years.length === 0 ? null : (
                  <div className="space-y-4">
                    {years.map(yr => {
                      const gc = GRADE_COLORS[yr] ?? FALLBACK_COLOR;
                      return (
                        <div key={yr} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className={`h-2.5 w-2.5 rounded-full ${gc.dot}`} />
                            <h3 className={`text-sm font-semibold ${gc.header}`}>{yr}</h3>
                          </div>
                          <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
                            {yearGroups[yr].map(({ classroom, year, count }) => {
                              const key = `${year}||${classroom}`;
                              const active = selectedTtKey === key;
                              return (
                                <button key={key} onClick={() => setSelectedTtKey(active ? "" : key)}
                                  className={`rounded-xl border px-4 py-3 text-left text-sm transition-all ${active ? "border-primary/60 bg-primary/10" : gc.card}`}>
                                  <p className="font-bold text-base">{classroom}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{count} subject{count !== 1 ? "s" : ""}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Weekly time-slot grid — filtered to selected classroom */}
              {selectedTtKey && (() => {
                const [ttYear, ttClassroom] = selectedTtKey.split("||");
                const filtered = timetable.filter(e => e.year === ttYear && e.classroom === ttClassroom);
                const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                const DAY_COLORS = [
                  { header: "bg-blue-600",    light: "bg-blue-950/40"    },
                  { header: "bg-violet-600",  light: "bg-violet-950/40"  },
                  { header: "bg-emerald-600", light: "bg-emerald-950/40" },
                  { header: "bg-amber-600",   light: "bg-amber-950/40"   },
                  { header: "bg-rose-600",    light: "bg-rose-950/40"    },
                ];
                const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
                const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                const MORNING: number[] = []; for (let m = toMins("08:30"); m < toMins("12:00"); m += 30) MORNING.push(m);
                const AFTERNOON: number[] = []; for (let m = toMins("13:45"); m <= toMins("16:00"); m += 30) AFTERNOON.push(m);
                const SLOTS = [...MORNING, -1, ...AFTERNOON];
                const PALETTE = [
                  { bg: "bg-violet-500", text: "text-white", border: "border-violet-400" },
                  { bg: "bg-sky-500",    text: "text-white", border: "border-sky-400"    },
                  { bg: "bg-emerald-500",text: "text-white", border: "border-emerald-400"},
                  { bg: "bg-amber-500",  text: "text-white", border: "border-amber-400"  },
                  { bg: "bg-rose-500",   text: "text-white", border: "border-rose-400"   },
                  { bg: "bg-cyan-500",   text: "text-white", border: "border-cyan-400"   },
                  { bg: "bg-fuchsia-500",text: "text-white", border: "border-fuchsia-400"},
                ];
                const colorMap: Record<string, typeof PALETTE[0]> = {};
                let ci = 0;
                filtered.forEach(e => { if (!colorMap[e.subject]) colorMap[e.subject] = PALETTE[ci++ % PALETTE.length]; });
                const byDay: Record<string, TimetableEntry[]> = {};
                DAYS.forEach(d => { byDay[d] = []; });
                filtered.forEach(e => { const k = DAYS.find(d => d.toLowerCase() === e.day.toLowerCase()); if (k) byDay[k].push(e); });

                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{ttClassroom}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{ttYear}</span>
                      <button onClick={() => setSelectedTtKey("")}
                        className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-3.5 h-3.5" /> Clear selection
                      </button>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                      <div className="grid border-b border-border/50" style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}>
                        <div className="border-r border-border/30 bg-muted/20" />
                        {DAYS.map((d, i) => (
                          <div key={d} className={`${DAY_COLORS[i].header} px-2 py-3 text-center border-r last:border-r-0 border-white/10`}>
                            <p className="text-xs font-bold text-white uppercase tracking-widest">{d.slice(0, 3)}</p>
                          </div>
                        ))}
                      </div>
                      <div>
                        {SLOTS.map((slot, si) => {
                          if (slot === -1) return (
                            <div key="break" className="grid border-b border-border/30" style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}>
                              <div className="border-r border-border/30 bg-muted/10 flex items-center justify-center py-1.5">
                                <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">Break</span>
                              </div>
                              <div className="col-span-5 bg-muted/10 flex items-center justify-center py-1.5">
                                <span className="text-[10px] text-muted-foreground/40 italic">12:00 – 13:45 · Lunch Break</span>
                              </div>
                            </div>
                          );
                          const isLast = si === SLOTS.length - 1;
                          return (
                            <div key={slot} className={`grid ${!isLast ? "border-b border-border/20" : ""}`} style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}>
                              <div className="border-r border-border/30 bg-muted/10 flex items-start justify-center pt-2.5 px-1">
                                <span className="text-[10px] font-medium text-muted-foreground/60">{fmt(slot)}</span>
                              </div>
                              {DAYS.map((d, di) => {
                                const entry = byDay[d].find(e => toMins(e.start_time) === slot);
                                const col = DAY_COLORS[di];
                                const pal = entry ? (colorMap[entry.subject] ?? PALETTE[0]) : null;
                                return (
                                  <div key={d} className={`border-r last:border-r-0 border-border/20 ${col.light} min-h-[40px] p-1`}>
                                    {entry && pal && (
                                      <div className={`rounded-lg border ${pal.border} ${pal.bg} ${pal.text} p-2 space-y-0.5`}>
                                        <p className="font-bold text-[11px] leading-tight">{entry.subject}</p>
                                        <p className="text-[10px] opacity-75">{entry.teacher_name}</p>
                                        <p className="text-[10px] opacity-60">{entry.start_time}–{entry.end_time}</p>
                                        <div className="flex gap-1 pt-0.5">
                                          <button onClick={() => setTtForm(entry)} className="flex-1 flex items-center justify-center rounded py-0.5 bg-white/20 hover:bg-white/30">
                                            <Pencil className="w-2.5 h-2.5" />
                                          </button>
                                          <button onClick={() => handleTtDelete(entry.class_id)} className="flex-1 flex items-center justify-center rounded py-0.5 bg-white/20 hover:bg-red-500/50">
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

            </motion.div>
          )}

          {/* ── ATTENDANCE ANALYTICS ── */}
          {panel === "attendance" && (() => {
            const GRADE_COLORS: Record<string, { header: string; card: string; dot: string }> = {
              "5th Year": { header: "text-violet-400", card: "border-violet-500/30 bg-violet-500/8 hover:bg-violet-500/15", dot: "bg-violet-500" },
              "4th Year": { header: "text-blue-400",   card: "border-blue-500/30 bg-blue-500/8 hover:bg-blue-500/15",     dot: "bg-blue-500"   },
            };
            const FALLBACK_COLOR = { header: "text-muted-foreground", card: "border-border bg-secondary/30 hover:bg-secondary/50", dot: "bg-muted-foreground" };

            // Build year+classroom groups with student count
            const yearGroups: Record<string, { classroom: string; year: string; subjectCount: number; studentCount: number }[]> = {};
            const seen = new Set<string>();
            timetable.forEach(e => {
              const key = `${e.year}||${e.classroom}`;
              if (!seen.has(key)) {
                seen.add(key);
                if (!yearGroups[e.year]) yearGroups[e.year] = [];
                const classEntries = timetable.filter(x => x.year === e.year && x.classroom === e.classroom);
                const stuMap = new Map<string, true>();
                classEntries.forEach(ce => (ce.enrolled_students ?? []).forEach(s => stuMap.set(s.user_id, true)));
                yearGroups[e.year].push({ classroom: e.classroom, year: e.year, subjectCount: classEntries.length, studentCount: stuMap.size });
              }
            });
            const years = Object.keys(yearGroups).sort();

            // Derive analytics for the selected classroom
            const [attYear, attClassroom] = selectedAttKey ? selectedAttKey.split("||") : ["", ""];
            const classroomEntries = selectedAttKey
              ? timetable.filter(e => e.year === attYear && e.classroom === attClassroom)
              : [];
            const classroomClassIds = new Set(classroomEntries.map(e => e.class_id));
            const filteredSessions = classroomClassIds.size > 0
              ? attendanceSessions.filter(s => classroomClassIds.has(s.class_id))
              : [];

            // s.date is the client's local YYYY-MM-DD — use it directly for day-of-week (no UTC math needed)
            const getSessionDay = (s: AttendanceSession): string =>
              new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

            // Motor returns datetimes without timezone suffix → append Z so JS treats them as UTC
            const parseUTC = (dt: string | undefined): Date | null => {
              if (!dt) return null;
              const utcStr = /[+Z]/.test(dt) ? dt : dt + "Z";
              return new Date(utcStr);
            };

            const availableDays = ["Monday","Tuesday","Wednesday","Thursday","Friday"].filter(d =>
              classroomEntries.some(e => e.day === d)
            );

            const filteredByDay = selectedAttDay
              ? filteredSessions.filter(s => getSessionDay(s) === selectedAttDay)
              : filteredSessions;

            // Union of enrolled students across all subjects in this classroom
            const stuMap = new Map<string, { user_id: string; name: string; email: string }>();
            classroomEntries.forEach(e => (e.enrolled_students ?? []).forEach(s => stuMap.set(s.user_id, s)));
            const enrolled = Array.from(stuMap.values());
            const totalSessions = filteredByDay.length;

            const sessionBarData = filteredByDay.map(s => ({ date: s.date, present: s.records.length }));

            const totalPresent = filteredByDay.reduce((acc, s) => acc + s.records.length, 0);
            const totalAbsent  = filteredByDay.reduce((acc, s) => acc + Math.max(0, enrolled.length - s.records.length), 0);
            const pieData = [
              { name: "Present", value: totalPresent },
              { name: "Absent",  value: totalAbsent  },
            ];
            const PIE_COLORS = ["#10b981", "#f43f5e"];

            const subjectBarData = classroomEntries.map(e => {
              const subSessions = filteredByDay.filter(s => s.class_id === e.class_id);
              const avgPresent = subSessions.length
                ? Math.round(subSessions.reduce((a, s) => a + s.records.length, 0) / subSessions.length)
                : 0;
              return { subject: e.subject.split(" ").slice(0, 2).join(" "), avg: avgPresent, sessions: subSessions.length };
            }).filter(x => x.sessions > 0);

            return (
              <motion.div key="attendance" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                className="p-8 space-y-6">

                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">Attendance Analytics</h2>
                  <button
                    onClick={async () => {
                      if (!confirm("Delete ALL attendance sessions? This cannot be undone.")) return;
                      const res = await fetch(`${BASE_URL}/attendance/all`, { method: "DELETE", headers: authHeaders() });
                      if (res.ok) {
                        const { deleted } = await res.json();
                        setAttendanceSessions([]);
                        setSelectedAttKey("");
                        toast({ title: `Cleared ${deleted} session${deleted !== 1 ? "s" : ""}` });
                      } else {
                        toast({ title: "Failed to clear history", variant: "destructive" });
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-destructive/40 px-3 py-1.5 text-xs text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear History
                  </button>
                </div>

                {/* Classroom selector grouped by year */}
                {years.length === 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-card px-5 py-10 text-center text-sm text-muted-foreground italic">
                    No classrooms in timetable yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {years.map(yr => {
                      const gc = GRADE_COLORS[yr] ?? FALLBACK_COLOR;
                      return (
                        <div key={yr} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className={`h-2.5 w-2.5 rounded-full ${gc.dot}`} />
                            <h3 className={`text-sm font-semibold ${gc.header}`}>{yr}</h3>
                          </div>
                          <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
                            {yearGroups[yr].map(({ classroom, year, subjectCount, studentCount }) => {
                              const key = `${year}||${classroom}`;
                              const active = selectedAttKey === key;
                              const sessCount = attendanceSessions.filter(s => {
                                const ids = new Set(timetable.filter(e => e.year === year && e.classroom === classroom).map(e => e.class_id));
                                return ids.has(s.class_id);
                              }).length;
                              return (
                                <button key={key} onClick={() => setSelectedAttKey(active ? "" : key)}
                                  className={`rounded-xl border px-4 py-3 text-left text-sm transition-all ${active ? "border-primary/60 bg-primary/10" : gc.card}`}>
                                  <p className="font-bold text-base">{classroom}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{studentCount} student{studentCount !== 1 ? "s" : ""}</p>
                                  <p className="text-[10px] text-muted-foreground">{sessCount} session{sessCount !== 1 ? "s" : ""}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!selectedAttKey && (
                  <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                    <Camera className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Select a classroom above to view analytics</p>
                  </div>
                )}

                {selectedAttKey && (
                  <>
                    {/* Classroom summary bar */}
                    <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
                      <div className="flex-1">
                        <p className="font-semibold">{attClassroom}</p>
                        <p className="text-xs text-muted-foreground">{attYear} · {classroomEntries.length} subject{classroomEntries.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex gap-6 text-center">
                        <div>
                          <p className="text-2xl font-bold text-primary">{totalSessions}</p>
                          <p className="text-xs text-muted-foreground">Sessions</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-primary">{enrolled.length}</p>
                          <p className="text-xs text-muted-foreground">Enrolled</p>
                        </div>
                      </div>
                    </div>

                    {/* Day selector */}
                    {availableDays.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filter by day</p>
                        <div className="flex flex-wrap gap-2">
                          {availableDays.map(d => (
                            <button key={d} onClick={() => setSelectedAttDay(selectedAttDay === d ? "" : d)}
                              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all border ${
                                selectedAttDay === d
                                  ? "bg-primary/15 border-primary/50 text-primary"
                                  : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                              }`}>
                              {d}
                            </button>
                          ))}
                          {selectedAttDay && (
                            <button onClick={() => setSelectedAttDay("")}
                              className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border/60 transition-colors flex items-center gap-1">
                              <X className="w-3.5 h-3.5" />All days
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Enrolled students — ALWAYS VISIBLE ── */}
                    {enrolled.length > 0 ? (
                      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                        <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
                          <span className="text-sm font-semibold">Enrolled Students</span>
                          <span className="text-xs text-muted-foreground">
                            {enrolled.length} student{enrolled.length !== 1 ? "s" : ""}
                            {totalSessions > 0 && ` · ${totalSessions} session${totalSessions !== 1 ? "s" : ""} recorded`}
                          </span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/40 bg-muted/20">
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {enrolled.map(s => (
                              <tr key={s.user_id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 font-medium">{s.name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                        <Users className="w-6 h-6 opacity-30" />
                        <p className="text-sm">No students enrolled in this classroom yet.</p>
                      </div>
                    )}

                    {/* ── Charts + day detail — only when sessions exist ── */}
                    {filteredByDay.length > 0 ? (
                      <>
                        {/* Row 1: Pie + Session bar */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-2">
                            <p className="text-sm font-semibold">Overall Attendance Rate</p>
                            <p className="text-xs text-muted-foreground">Cumulated across all sessions</p>
                            <ResponsiveContainer width="100%" height={220}>
                              <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                                  paddingAngle={3} dataKey="value"
                                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                  labelLine={false}>
                                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                                </Pie>
                                <Tooltip formatter={(val: number) => [val, "slots"]}
                                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-2">
                            <p className="text-sm font-semibold">Present per Session</p>
                            <p className="text-xs text-muted-foreground">Students recognized each session</p>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={sessionBarData} margin={{ top: 8, right: 16, left: -16, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                                <Bar dataKey="present" name="Present" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Row 2: Per-subject average */}
                        {subjectBarData.length > 1 && (
                          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-2">
                            <p className="text-sm font-semibold">Avg. Attendance by Subject</p>
                            <p className="text-xs text-muted-foreground">Average students present per session, per subject</p>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={subjectBarData} margin={{ top: 8, right: 16, left: -16, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                                <XAxis dataKey="subject" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                                <Bar dataKey="avg" name="Avg. Present" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* Present / Absent per session (shown when a day is selected) */}
                        {selectedAttDay && (
                          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                            <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
                              <span className="text-sm font-semibold">{selectedAttDay} — Attendance Detail</span>
                              <span className="text-xs text-muted-foreground">{filteredByDay.length} session{filteredByDay.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="divide-y divide-border/30">
                              {filteredByDay.map(s => {
                                const presentList: string[] = s.records.map((r: any) => r.name);
                                const absentList: string[]  = (s.absent_records ?? []).map(r => r.name);
                                const localStart = parseUTC(s.created_at);
                                const localEnd   = parseUTC(s.closed_at);
                                // s.date is the client's local date — format it for display
                                const displayDate = new Date(s.date + "T12:00:00")
                                  .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
                                const startTime = localStart
                                  ? localStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
                                  : null;
                                const endTime = localEnd
                                  ? localEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
                                  : null;
                                return (
                                  <div key={s.session_id} className="px-5 py-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <span className="font-semibold text-sm">{s.subject}</span>
                                        <span className="ml-2 text-xs text-muted-foreground">{displayDate}</span>
                                        {startTime && (
                                          <span className="ml-2 text-xs text-primary/80 font-medium">
                                            {startTime}{endTime ? ` – ${endTime}` : ""}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 text-xs">
                                        <span className="text-emerald-400 font-semibold">{presentList.length} present</span>
                                        <span className="text-red-400 font-semibold">{absentList.length} absent</span>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider w-14 shrink-0">Present</span>
                                      {presentList.length > 0
                                        ? presentList.map(name => (
                                            <span key={name} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                                              {name}
                                            </span>
                                          ))
                                        : <span className="text-xs text-muted-foreground italic">none recognized</span>
                                      }
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider w-14 shrink-0">Absent</span>
                                      {absentList.length > 0
                                        ? absentList.map(name => (
                                            <span key={name} className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
                                              {name}
                                            </span>
                                          ))
                                        : <span className="text-xs text-muted-foreground italic">all present</span>
                                      }
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                        <Camera className="w-7 h-7 opacity-25" />
                        {selectedAttDay
                          ? <p className="text-sm">No sessions recorded on <strong>{selectedAttDay}</strong> yet.</p>
                          : <p className="text-sm">No attendance sessions recorded yet.</p>
                        }
                        <p className="text-xs opacity-60">Charts will appear once Dr. Nadjib runs sessions for this classroom.</p>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            );
          })()}

        </AnimatePresence>
      </main>
    </div>
  );
}
