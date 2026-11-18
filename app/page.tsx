"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Kind = "task" | "goal" | "habit";
type Item = { id: string; name: string; done: boolean; scheduled_date: string | null; item_type: Kind };
type Tab = "overview" | "planner" | "wellness" | "insights";
type Wellness = { water: number; sleep: number; mood: string; movement: number; journal: string };
const initialWellness: Wellness = { water: 0, sleep: 8, mood: "Good", movement: 0, journal: "" };
const defaults: Record<Kind, string[]> = {
  task: ["Plan my day", "Drink enough water", "Work towards a personal goal"],
  goal: ["Learn a new skill", "Improve my fitness"],
  habit: ["Read for 15 minutes", "Go for a walk", "Drink water regularly"],
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const prettyDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const quoteList = [
  "Progress is built one small step at a time.",
  "Your future is shaped by what you do today.",
  "Consistency beats perfection. Keep going!",
  "A little progress every day adds up.",
  "Make space for your goals and your wellbeing.",
];

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-bold text-slate-800">{title}</h2>{subtitle && <p className="mb-4 mt-1 text-sm text-slate-500">{subtitle}</p>}{!subtitle && <div className="h-4" />}{children}</section>;
  }
function Stat({ emoji, label, value, detail, color }: { emoji: string; label: string; value: string; detail: string; color: string }) {
    return <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl text-2xl ${color}`}>{emoji}</div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-800">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>;
  }


export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [taskFilter, setTaskFilter] = useState<"all" | "today" | "upcoming" | "unscheduled" | "overdue">("all");
  const [newNames, setNewNames] = useState<Record<Kind, string>>({ task: "", goal: "", habit: "" });
  const [newTaskDate, setNewTaskDate] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [wellness, setWellness] = useState<Wellness>(initialWellness);
  const [wellnessReady, setWellnessReady] = useState(false);
  // Determine the local date after the component mounts, not during prerender.
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(dateKey(new Date()));
  }, []);
  const tasks = items.filter((item) => item.item_type === "task");
  const goals = items.filter((item) => item.item_type === "goal");
  const habits = items.filter((item) => item.item_type === "habit");
  const completed = items.filter((item) => item.done).length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
  const todayTasks = tasks.filter((item) => item.scheduled_date === today);
  const overdueTasks = tasks.filter((item) => !item.done && !!item.scheduled_date && item.scheduled_date < today && !!today);
  const upcomingTasks = tasks.filter((item) => !!item.scheduled_date && item.scheduled_date > today && !!today);
  const unscheduledTasks = tasks.filter((item) => !item.scheduled_date);
  const quote = quoteList[today ? Number(today.slice(-2)) % quoteList.length : 0];

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = createClient();
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) { window.location.replace("/login"); return; }
        if (!active) return;
        setUserId(auth.user.id);
        setEmail(auth.user.email ?? "");
        const { data, error: readError } = await supabase.from("life_items")
          .select("id,item_type,title,completed,scheduled_date")
          .eq("user_id", auth.user.id).order("created_at", { ascending: false });
        if (readError) throw readError;
        let rows = data ?? [];
        const marker = `lifepilot-migrated-${auth.user.id}`;
        if (!rows.length && localStorage.getItem(marker) !== "true") {
          const oldRows: { user_id: string; item_type: Kind; title: string; completed: boolean }[] = [];
          for (const kind of ["task", "goal", "habit"] as Kind[]) {
            let entries: { name: string; done: boolean }[] = defaults[kind].map((name) => ({ name, done: false }));
            try {
              const raw = localStorage.getItem(`lifepilot-${kind}s`);
              if (raw) {
                const parsed: unknown = JSON.parse(raw);
                if (Array.isArray(parsed)) entries = parsed.filter((entry) => entry && typeof entry.name === "string")
                  .map((entry) => ({ name: entry.name as string, done: Boolean(entry.done) }));
              }
            } catch { /* Keep defaults if legacy data is invalid. */ }
            oldRows.push(...entries.map((entry) => ({ user_id: auth.user!.id, item_type: kind, title: entry.name, completed: entry.done })));
          }
          if (oldRows.length) {
            const { error: importError } = await supabase.from("life_items").insert(oldRows);
            if (importError) throw importError;
          }
          localStorage.setItem(marker, "true");
          const { data: refreshed, error: refreshError } = await supabase.from("life_items")
            .select("id,item_type,title,completed,scheduled_date")
            .eq("user_id", auth.user.id).order("created_at", { ascending: false });
          if (refreshError) throw refreshError;
          rows = refreshed ?? [];
        } else if (rows.length) localStorage.setItem(marker, "true");
        if (active) setItems(rows.filter((row) => ["task", "goal", "habit"].includes(row.item_type)).map((row) => ({
          id: row.id, item_type: row.item_type as Kind, name: row.title,
          done: row.completed, scheduled_date: row.scheduled_date ?? null,
        })));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load dashboard.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!userId || !today) return;
    setWellnessReady(false);
    try {
      const saved = localStorage.getItem(`lifepilot-wellness-${userId}-${today}`);
      setWellness(saved ? { ...initialWellness, ...JSON.parse(saved) as Partial<Wellness> } : initialWellness);
    } catch { setWellness(initialWellness); }
    setWellnessReady(true);
  }, [userId, today]);
  useEffect(() => {
    if (userId && wellnessReady) localStorage.setItem(`lifepilot-wellness-${userId}-${today}`, JSON.stringify(wellness));
  }, [userId, wellness, wellnessReady, today]);

  async function addItem(kind: Kind) {
    const title = newNames[kind].trim();
    if (!title || !userId || busy) return;
    setBusy(true); setError("");
    try {
      const { data, error: insertError } = await createClient().from("life_items")
        .insert({ user_id: userId, item_type: kind, title, completed: false, scheduled_date: kind === "task" ? newTaskDate || null : null })
        .select("id,item_type,title,completed,scheduled_date").single();
      if (insertError) throw insertError;
      setItems((old) => [{ id: data.id, item_type: kind, name: data.title, done: data.completed, scheduled_date: data.scheduled_date ?? null }, ...old]);
      setNewNames((old) => ({ ...old, [kind]: "" }));
      if (kind === "task") setNewTaskDate("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add item."); }
    finally { setBusy(false); }
  }

  async function updateItem(item: Item, changes: Partial<Pick<Item, "name" | "done" | "scheduled_date">>) {
    if (!userId || busy) return;
    setBusy(true); setError("");
    try {
      const payload: { title?: string; completed?: boolean; scheduled_date?: string | null } = {};
      if (changes.name !== undefined) payload.title = changes.name;
      if (changes.done !== undefined) payload.completed = changes.done;
      if (changes.scheduled_date !== undefined) payload.scheduled_date = changes.scheduled_date;
      const { data, error: updateError } = await createClient().from("life_items").update(payload)
        .eq("id", item.id).eq("user_id", userId).eq("item_type", item.item_type)
        .select("id");
      if (updateError) throw updateError;
      if (!data?.length) throw new Error("Item not updated. Please try again.");
      setItems((old) => old.map((entry) => entry.id === item.id ? { ...entry, ...changes } : entry));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update item."); }
    finally { setBusy(false); }
  }
  async function editItem(item: Item) {
    const value = window.prompt("Edit name:", item.name);
    if (value === null) return;
    const name = value.trim();
    if (!name) { setError("Name cannot be empty."); return; }
    if (name !== item.name) await updateItem(item, { name });
  }
  async function changeDate(item: Item) {
    const value = window.prompt("Schedule date (YYYY-MM-DD). Leave blank to remove:", item.scheduled_date ?? "");
    if (value === null) return;
    const date = value.trim();
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime()) || dateKey(new Date(`${date}T12:00:00`)) !== date)) {
      setError("Enter a valid date in YYYY-MM-DD format."); return;
    }
    await updateItem(item, { scheduled_date: date || null });
  }
  async function deleteItem(item: Item) {
    if (!userId || busy || !window.confirm(`Delete "${item.name}"?`)) return;
    setBusy(true); setError("");
    try {
      const { data, error: deleteError } = await createClient().from("life_items").delete()
        .eq("id", item.id).eq("user_id", userId).eq("item_type", item.item_type).select("id");
      if (deleteError) throw deleteError;
      if (!data?.length) throw new Error("Item not deleted. Please try again.");
      setItems((old) => old.filter((entry) => entry.id !== item.id));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete item."); }
    finally { setBusy(false); }
  }
  async function logout() {
    const { error: logoutError } = await createClient().auth.signOut({ scope: "local" });
    if (logoutError) setError(logoutError.message);
    else window.location.assign("/login");
  }

  const filteredTasks = useMemo(() => tasks.filter((item) => {
    if (taskFilter === "today") return item.scheduled_date === today;
    if (taskFilter === "upcoming") return !!item.scheduled_date && item.scheduled_date > today;
    if (taskFilter === "overdue") return !!item.scheduled_date && item.scheduled_date < today && !item.done;
    if (taskFilter === "unscheduled") return !item.scheduled_date;
    return true;
  }).sort((a, b) => (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999")), [tasks, taskFilter, today]);
  const suggestions = [
    overdueTasks.length ? `Prioritize ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"} before adding new commitments.` : "You have no overdue tasks. Keep your momentum!",
    todayTasks.some((item) => !item.done) ? `Focus on ${todayTasks.filter((item) => !item.done).length} remaining task(s) scheduled for today.` : "Plan one meaningful task for today to make progress.",
    wellness.water < 6 ? `Hydration check: ${wellness.water}/8 glasses logged. Take a water break.` : "Great job keeping up with hydration!",
    wellness.sleep < 7 ? "Aim for a consistent bedtime and 7–9 hours of sleep." : "Keep protecting your sleep routine.",
    habits.some((item) => !item.done) ? "Pick one small unfinished habit and complete it today." : "Your habit checklist looks great!",
  ];

  function askAssistant(question: string) {
    const q = question.trim().toLowerCase();
    if (!q) return;
    const unfinished = tasks.filter((item) => !item.done);
    const focus = todayTasks.filter((item) => !item.done);
    const top = (focus.length ? focus : unfinished).slice(0, 3);
    const taskNames = top.map((item, i) => `${i + 1}. ${item.name}`).join("\n");
    const pendingGoals = goals.filter((item) => !item.done);
    let reply: string;
    if (/plan|schedule|routine|today|organis|organiz/.test(q)) {
      reply = `Here is a practical plan for today:\n${taskNames || "1. Choose one useful task to start with."}\nTake a short break between focus sessions, make time for a meal and movement, and leave room for rest.${overdueTasks.length ? ` You also have ${overdueTasks.length} overdue task(s) to review.` : ""}`;
    } else if (/goal|achiev|future|milestone/.test(q)) {
      reply = pendingGoals.length ? `Your active goals include: ${pendingGoals.slice(0, 3).map((g) => g.name).join(", ")}. Choose one and define a 15-minute action you can do today. Schedule that action as a task.` : "You have no unfinished goals. Add a goal, then break it into a small task you can finish this week.";
    } else if (/habit|consisten|discipline/.test(q)) {
      reply = habits.some((h) => !h.done) ? `Start with one unfinished habit: ${habits.find((h) => !h.done)?.name}. Make it easy, attach it to an existing routine, and check it off when complete.` : "Your habits are all checked off! Keep your routine realistic and review it tomorrow.";
    } else if (/water|hydrat|drink/.test(q)) {
      reply = `You logged ${wellness.water} glasses of water today. Keep water accessible and drink regularly according to your needs and activity. The eight-glass indicator is a general tracking target, not a medical requirement.`;
    } else if (/sleep|tired|rest|bed/.test(q)) {
      reply = `You logged ${wellness.sleep} hours of sleep. Try a consistent bedtime, reduce distractions before bed, and make time for rest. If sleep problems persist, seek professional advice.`;
    } else if (/stress|mood|anxious|wellness|exercise|walk|relax/.test(q)) {
      reply = `Your mood check-in is “${wellness.mood}” and you logged ${wellness.movement} minutes of movement. Consider a short walk, a few minutes of calm breathing, a screen break, or talking with someone you trust. Choose what feels manageable.`;
    } else if (/motivat|encourag|focus|procrastinat|productiv/.test(q)) {
      reply = `You've completed ${completed} of ${items.length} tracked items (${percent}%). Progress counts, even when it's small. ${top.length ? `Start with “${top[0].name}” for just 10 minutes.` : "Choose one meaningful task and take the first small step."}`;
    } else {
      reply = `I can help you plan your day, prioritize tasks, work toward goals, build habits, or reflect on wellness. You currently have ${unfinished.length} unfinished task(s) and ${pendingGoals.length} active goal(s). Try asking “Plan my day” or “Help with my goals.”`;
    }
    setAssistantQuestion(question);
    setAssistantReply(reply);
  }

  function ItemList({ kind, list }: { kind: Kind; list: Item[] }) {
    return <div className="space-y-2">
      {list.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">Nothing here yet. Add your first {kind}!</p>}
      {list.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
        <input aria-label={`Complete ${item.name}`} type="checkbox" checked={item.done} disabled={busy} onChange={() => void updateItem(item, { done: !item.done })} className="h-4 w-4 accent-violet-600" />
        <div className="min-w-0 flex-1">
          <p className={`break-words text-sm font-semibold ${item.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.name}</p>
          {kind === "task" && <p className={`mt-1 text-xs ${item.scheduled_date && item.scheduled_date < today && !item.done ? "text-rose-600" : "text-violet-500"}`}>
            {item.scheduled_date ? `📅 ${prettyDate(item.scheduled_date)}${item.scheduled_date === today ? " · Today" : item.scheduled_date < today && !item.done ? " · Overdue" : ""}` : "No date scheduled"}
          </p>}
        </div>
        {kind === "task" && <button disabled={busy} onClick={() => void changeDate(item)} className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">Date</button>}
        <button disabled={busy} onClick={() => void editItem(item)} className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-violet-600 hover:bg-violet-50">Edit</button>
        <button disabled={busy} onClick={() => void deleteItem(item)} className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">Delete</button>
      </div>)}
    </div>;
  }
  function AddForm({ kind }: { kind: Kind }) {
    return <form onSubmit={(event) => { event.preventDefault(); void addItem(kind); }} className="mb-4 flex flex-wrap gap-2">
      <input aria-label={`New ${kind}`} value={newNames[kind]} onChange={(event) => setNewNames((old) => ({ ...old, [kind]: event.target.value }))}
        placeholder={`Add a ${kind}...`} className="min-w-40 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500" />
      {kind === "task" && <input aria-label="Scheduled task date" type="date" value={newTaskDate} onChange={(event) => setNewTaskDate(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />}
      <button disabled={busy || !newNames[kind].trim()} type="submit" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">+ Add</button>
    </form>;
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-violet-50 text-lg font-bold text-violet-700">✨ Loading LifePilot...</main>;
  if (!userId) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center"><h1 className="text-3xl font-bold text-violet-700">LifePilot ✨</h1><p className="text-rose-600">{error || "Please sign in to continue."}</p><a href="/login" className="rounded-xl bg-violet-600 px-5 py-3 text-white">Go to login</a></main>;

  return <main className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-cyan-50 text-slate-800">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Your personal life companion</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">LifePilot <span className="text-violet-600">✦</span></h1><p className="mt-1 text-sm text-slate-500">Organize your time. Build better habits. Feel your best.</p></div>
        <div className="flex flex-wrap items-center gap-3"><div className="rounded-2xl bg-white px-4 py-3 text-sm shadow-sm"><span className="font-semibold">☀️ {today ? new Date(`${today}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "Today"}</span><p className="max-w-52 truncate text-xs text-slate-400">{email}</p></div><button onClick={() => void logout()} className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50">Log out</button></div>
      </header>
      <nav aria-label="LifePilot sections" className="mb-6 flex flex-wrap gap-2">{([ ["overview", "🏠 Overview"], ["planner", "📅 Daily Planner"], ["wellness", "🌿 Wellness"], ["insights", "✨ Smart Insights"] ] as [Tab, string][]).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === key ? "bg-violet-600 text-white shadow-md" : "bg-white text-slate-600 hover:bg-violet-100"}`}>{label}</button>)}</nav>
      {error && <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error" className="font-bold">✕</button></div>}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-violet-700 via-indigo-600 to-fuchsia-600 p-7 text-white shadow-xl sm:p-9"><div className="relative z-10"><p className="text-xs font-bold uppercase tracking-widest text-violet-200">Welcome to your dashboard</p><h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Make today count! 🚀</h2><p className="mt-3 max-w-xl text-violet-100">{quote}</p><div className="mt-5 inline-flex rounded-full bg-white/20 px-4 py-2 text-sm font-semibold">⭐ {percent}% overall progress</div></div><div aria-hidden="true" className="absolute -right-8 -top-12 h-64 w-64 rounded-full bg-white/10" /></section>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat emoji="✅" label="Tasks completed" value={`${tasks.filter((item) => item.done).length}/${tasks.length}`} detail={`${todayTasks.filter((item) => !item.done).length} remaining for today`} color="bg-violet-100" /><Stat emoji="🎯" label="Goals achieved" value={`${goals.filter((item) => item.done).length}/${goals.length}`} detail="Keep moving forward" color="bg-amber-100" /><Stat emoji="🌱" label="Habits completed" value={`${habits.filter((item) => item.done).length}/${habits.length}`} detail="Small wins matter" color="bg-emerald-100" /><Stat emoji="💧" label="Water today" value={`${wellness.water}/8`} detail="Glasses logged on this device" color="bg-sky-100" /></div>
      {tab === "overview" && <div className="grid gap-5 lg:grid-cols-2">
        <Section title="📅 Your tasks" subtitle="Schedule, edit, and complete your priorities">{AddForm({ kind: "task" })}{ItemList({ kind: "task", list: tasks.slice().sort((a, b) => (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999")).slice(0, 8) })}{tasks.length > 8 && <button className="mt-4 text-sm font-bold text-violet-600" onClick={() => setTab("planner")}>View all tasks →</button>}</Section>
        <Section title="🎯 Personal goals" subtitle="Turn ambitions into achievements">{AddForm({ kind: "goal" })}{ItemList({ kind: "goal", list: goals })}</Section>
        <Section title="🌱 Daily habits" subtitle="Keep building your positive routines">{AddForm({ kind: "habit" })}{ItemList({ kind: "habit", list: habits })}</Section>
        <Section title="📈 Your progress" subtitle="A snapshot of what you have accomplished"><div className="mb-3 flex justify-between text-sm"><span>Overall completion</span><strong>{percent}%</strong></div><div className="h-4 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${percent}%` }} /></div><div className="mt-5 grid grid-cols-3 gap-3 text-center">{([ ["Tasks", tasks], ["Goals", goals], ["Habits", habits] ] as [string, Item[]][]).map(([name, list]) => <div key={name} className="rounded-2xl bg-violet-50 p-3"><p className="text-xl font-black text-violet-700">{list.filter((item) => item.done).length}</p><p className="text-xs text-slate-500">{name} done</p></div>)}</div><button onClick={() => setTab("insights")} className="mt-5 rounded-xl bg-violet-100 px-4 py-2 text-sm font-bold text-violet-700">Get planning tips ✨</button></Section>
      </div>}
      {tab === "planner" && <div className="grid gap-5 lg:grid-cols-3"><div className="lg:col-span-2"><Section title="🗓️ Daily task planner" subtitle="View tasks by schedule, including overdue priorities">{AddForm({ kind: "task" })}<div className="mb-5 flex flex-wrap gap-2">{([ ["all", `All (${tasks.length})`], ["today", `Today (${todayTasks.length})`], ["upcoming", `Upcoming (${upcomingTasks.length})`], ["overdue", `Overdue (${overdueTasks.length})`], ["unscheduled", `No date (${unscheduledTasks.length})`] ] as [typeof taskFilter, string][]).map(([key, label]) => <button key={key} onClick={() => setTaskFilter(key)} className={`rounded-full px-3 py-2 text-xs font-bold ${taskFilter === key ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}</div>{ItemList({ kind: "task", list: filteredTasks })}</Section></div><div className="space-y-5"><Section title="⏰ Today's focus"><p className="text-4xl font-black text-violet-700">{todayTasks.filter((item) => !item.done).length}</p><p className="mt-2 text-sm text-slate-500">Tasks left to complete today</p></Section><Section title="💡 Planning tip"><p className="text-sm leading-7 text-slate-600">Start with one important task, take short breaks, and leave time for rest and social connection.</p></Section></div></div>}
      {tab === "wellness" && <div className="grid gap-5 lg:grid-cols-2">
        <Section title="💧 Hydration tracker" subtitle="Aim for approximately 8 glasses; individual needs vary"><div className="flex items-center justify-between gap-4"><button onClick={() => setWellness((old) => ({ ...old, water: Math.max(0, old.water - 1) }))} className="h-12 w-12 rounded-2xl bg-slate-100 text-2xl font-bold">−</button><div className="text-center"><p className="text-5xl font-black text-sky-600">{wellness.water}</p><p className="text-xs text-slate-500">glasses today</p></div><button onClick={() => setWellness((old) => ({ ...old, water: old.water + 1 }))} className="h-12 w-12 rounded-2xl bg-sky-500 text-2xl font-bold text-white">+</button></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, wellness.water / 8 * 100)}%` }} /></div></Section>
        <Section title="😴 Sleep tracker" subtitle="Record your hours of sleep last night"><label className="block text-sm font-semibold text-slate-600">Hours slept: <strong className="text-violet-700">{wellness.sleep}</strong></label><input type="range" min="0" max="12" step="0.5" value={wellness.sleep} onChange={(event) => setWellness((old) => ({ ...old, sleep: Number(event.target.value) }))} className="mt-5 w-full accent-violet-600" /><p className="mt-4 text-sm text-slate-500">Most adults benefit from around 7–9 hours of sleep.</p></Section>
        <Section title="😊 Mood check-in" subtitle="How are you feeling today?"><div className="flex flex-wrap gap-2">{["Great", "Good", "Okay", "Stressed", "Low"].map((mood) => <button key={mood} onClick={() => setWellness((old) => ({ ...old, mood }))} className={`rounded-xl px-4 py-3 text-sm font-bold ${wellness.mood === mood ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700"}`}>{mood}</button>)}</div><p className="mt-4 text-sm text-slate-500">Current mood: {wellness.mood}</p></Section>
        <Section title="🚶 Movement" subtitle="Track minutes of activity today"><div className="flex items-center justify-between"><button onClick={() => setWellness((old) => ({ ...old, movement: Math.max(0, old.movement - 10) }))} className="rounded-xl bg-slate-100 px-5 py-3 font-bold">−10 min</button><div className="text-center"><p className="text-4xl font-black text-emerald-600">{wellness.movement}</p><p className="text-xs text-slate-500">minutes</p></div><button onClick={() => setWellness((old) => ({ ...old, movement: old.movement + 10 }))} className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white">+10 min</button></div></Section>
        <div className="lg:col-span-2"><Section title="📔 Reflection journal" subtitle="Your private daily notes are stored in this browser, not Supabase"><textarea rows={5} value={wellness.journal} onChange={(event) => setWellness((old) => ({ ...old, journal: event.target.value }))} placeholder="What went well today? What are you grateful for?" className="w-full resize-y rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-violet-500" /><p className="mt-2 text-xs text-emerald-600">✓ Saved automatically on this device</p></Section></div>
      </div>}
      {tab === "insights" && <div className="grid gap-5 lg:grid-cols-2">
        <Section title="🤖 LifePilot Smart Assistant" subtitle="Interactive, personalized help without an API or internet-based AI service">
          <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">This is a rule-based assistant, not a generative AI model. It uses your LifePilot tasks and wellness entries to select helpful responses. No API key is needed.</p>
          <div className="mb-4 flex flex-wrap gap-2">{["Plan my day", "Motivate me", "Help with my goals", "Improve my habits", "Wellness tips", "Sleep advice"].map((question) => <button key={question} type="button" onClick={() => askAssistant(question)} className="rounded-full bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-200">{question}</button>)}</div>
          <form onSubmit={(event) => { event.preventDefault(); askAssistant(assistantQuestion); }} className="flex flex-wrap gap-2">
            <input aria-label="Ask the Smart Assistant" value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask about planning, goals, wellness..." className="min-w-40 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-violet-500" />
            <button type="submit" disabled={!assistantQuestion.trim()} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Ask</button>
          </form>
          {assistantReply ? <div role="status" aria-live="polite" className="mt-5 whitespace-pre-line rounded-2xl bg-violet-50 p-5 text-sm leading-7 text-slate-700">{assistantReply}</div> : <p className="mt-4 text-sm text-slate-500">Select a suggestion or type a question to get started.</p>}
          <h3 className="mb-3 mt-6 text-sm font-bold text-slate-700">Suggested next steps</h3>
          <div className="space-y-2">{suggestions.map((tip, index) => <p key={index} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">✨ {tip}</p>)}</div>
        </Section>
        <div className="space-y-5"><Section title="📊 Productivity snapshot" subtitle="Live counts from your Supabase account"><p className="text-sm text-slate-600">You have <strong>{tasks.length}</strong> tasks, <strong>{goals.length}</strong> goals and <strong>{habits.length}</strong> habits.</p><p className="mt-3 text-sm text-slate-600"><strong>{completed}</strong> of <strong>{items.length}</strong> items are completed.</p><p className="mt-3 text-sm text-slate-600"><strong>{overdueTasks.length}</strong> tasks are overdue.</p></Section><Section title="🔬 Technology corner" subtitle="Evergreen topics to explore — not a live news feed"><div className="space-y-3 text-sm text-slate-600"><p>🤖 <strong>Artificial intelligence:</strong> Explore how AI can support planning and creativity.</p><p>🛡️ <strong>Cybersecurity:</strong> Learn about strong passwords and multi-factor authentication.</p><p>🚀 <strong>Robotics and science:</strong> Follow new discoveries and practical innovations.</p></div></Section></div>
      </div>}
      <footer className="mt-10 border-t border-violet-100 py-6 text-center text-xs text-slate-400">LifePilot ✦ Your life, moving forward. · Submission-ready prototype · Wellness entries saved locally per device</footer>
    </div>
  </main>;
}
