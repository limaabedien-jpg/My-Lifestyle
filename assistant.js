// My Lifestyle — Ask AI: answer questions AND do things in the app by text, voice or photo.
// The AI only proposes. The user sees exactly what will change, and nothing happens until they tap "Yes".
import * as api from "./api.js";
import { h, icon, toast, sheet, busy, todayStr, addDays, dhakaIso, fmtDate, fmtHM, durLabel, PALETTE, tk as money, askPin, pickPhoto } from "./ui.js";
import { store, catNames, catDp, rerender, loadBasics, role } from "./app.js";
import { voiceRecorder } from "./voice.js";
import { waqts, isMuslim } from "./prayer.js";
import { pickColor } from "./ui.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BN_DAYS = { Sat: "শনি", Sun: "রবি", Mon: "সোম", Tue: "মঙ্গল", Wed: "বুধ", Thu: "বৃহস্পতি", Fri: "শুক্র" };
const hm = iso => new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString().slice(11, 16);
const HHMM = /^\d{2}:\d{2}$/, DATE = /^\d{4}-\d{2}-\d{2}$/, MONTH = /^\d{4}-\d{2}$/, HEX = /^#[0-9a-f]{6}$/i;
const INCOME_DEFAULT = ["Tuition", "Salary", "Video work", "Gift", "Other income"];
const KIND_BN = { ct: "CT", lab: "ল্যাব রিপোর্ট", assignment: "অ্যাসাইনমেন্ট", exam: "পরীক্ষা", paper: "প্রশ্নপত্র", checking: "খাতা দেখা", result: "রেজাল্ট", delivery: "ডেলিভারি", payment: "পেমেন্ট", meeting: "মিটিং", report: "রিপোর্ট", presentation: "প্রেজেন্টেশন", appointment: "অ্যাপয়েন্টমেন্ট", fee: "ফি", shopping: "বাজার", occasion: "অনুষ্ঠান", other: "অন্যান্য" };
const expCats = () => store.cfg.expense_categories || ["Rent", "Bills", "Food", "Transport", "Study", "Shopping", "Fun", "Other"];
const incCats = () => role()?.income || INCOME_DEFAULT;

// everything the AI may need to know to act (ids included so it can point at the right thing)
async function gather() {
  const today = todayStr();
  const month = today.slice(0, 8) + "01";
  const prev = (() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 8) + "01"; })();
  const [exams, events, goals, dues, entries, budgets] = await Promise.all([
    api.select("exams", `select=id,kind,title,course,due_at,done&or=(done.eq.false,due_at.gt.${new Date(Date.now() - 7 * 864e5).toISOString()})&order=due_at`).catch(() => []),
    api.select("events", `select=id,title,kind,date,time,yearly&or=(date.gte.${today},yearly.eq.true)&order=date&limit=40`).catch(() => []),
    api.select("goals", "select=id,title,span,period,done&done=eq.false&limit=40").catch(() => []),
    api.select("dues", "select=id,person,amount,direction,note&settled=eq.false").catch(() => []),
    api.select("finance_entries", `select=id,kind,category,amount,note,entry_date&entry_date=gte.${prev}&order=entry_date.desc&limit=80`).catch(() => []),
    api.select("budgets", `select=category,amount&month=eq.${month}`).catch(() => []),
  ]);
  const [tasks, routines, students, pays, habits, bills, billPays] = await Promise.all([
    api.select("tasks", `select=id,title,category,day,start_at,end_at,status,routine_id,student_id,color&day=gte.${addDays(today, -1)}&day=lte.${addDays(today, 7)}&status=neq.running&order=start_at`),
    api.select("routines", "select=id,title,category,days,start_time,duration_min,student_id,color,template&active=eq.true"),
    api.select("students", "select=id,name,monthly_fee,active,color,created_at&order=name"),
    api.select("tuition_payments", `select=student_id,month&month=gte.${addDays(today, -190).slice(0, 7)}-01`),
    api.select("bad_habits", "select=id,name&archived=eq.false"),
    api.select("bills", "select=id,title,amount,category,due_day,monthly,start_month&active=eq.true"),
    api.select("bill_payments", `select=bill_id&month=eq.${month}`),
  ]);
  const billsNow = bills.filter(b => b.monthly ? b.start_month <= month : b.start_month === month);
  const sName = id => students.find(s => s.id === id)?.name || null;
  const forAi = {
    app_updates: "Newest layout (use this over older notes): bottom menu is Today · Routine · Money · Me · 🔔 Alerts · More. Alerts = turn notifications on, connect Telegram (reset codes + important reminders with Telegram's sound), Home Screen install steps, and every past notification. More = 📤 Share the app with friends, Calendar, Reports, Settings, Get the app (Today's tasks home-screen icon), How to use. PIN is asked to change money entries or a student's fee, open the full tuition sheet (Tuition → All payments) and download a backup; adding new money or students never needs it. Today shows prayer, exams, bills, events and setup hints together in one small box under Up next.",
    tasks: tasks.map(t => ({ id: t.id, title: t.title, category: t.category, date: t.day, weekday: DAYS[new Date(t.day + "T00:00:00").getDay()], start: hm(t.start_at), end: hm(t.end_at), status: t.status, repeats: !!t.routine_id, student: sName(t.student_id) })),
    routines: routines.map(r => ({ id: r.id, title: r.title, category: r.category, days: r.days.map(d => DAYS[d]), start: r.start_time.slice(0, 5), minutes: r.duration_min, student: sName(r.student_id), color: r.color })),
    students: students.map(s => ({ id: s.id, name: s.name, monthly_fee: +s.monthly_fee, active: s.active, paid_months: pays.filter(p => p.student_id === s.id).map(p => p.month.slice(0, 7)).sort() })),
    habits: habits.map(x => ({ id: x.id, name: x.name })),
    bills_this_month: billsNow.map(b => ({ id: b.id, title: b.title, amount: +b.amount, due_day: b.due_day, monthly: b.monthly, paid: billPays.some(p => p.bill_id === b.id) })),
    task_categories: Object.fromEntries(catNames().map(c => [c, catDp(c)])),
    expense_categories: expCats(), income_categories: incCats(),
    deadlines: exams.map(e => ({ id: e.id, kind: e.kind, title: e.title, course: e.course, due: new Date(new Date(e.due_at).getTime() + 6 * 3600e3).toISOString().slice(0, 16).replace("T", " "), done: e.done })),
    events: events.map(e => ({ id: e.id, title: e.title, kind: e.kind, date: e.date, time: e.time?.slice(0, 5) || null, yearly: e.yearly })),
    goals: goals.map(g => ({ id: g.id, title: g.title, span: g.span })),
    dues: dues.map(d => ({ id: d.id, person: d.person, amount: +d.amount, direction: d.direction })),
    money_entries: entries.map(e => ({ id: e.id, kind: e.kind, category: e.category, amount: +e.amount, note: e.note, date: e.entry_date })),
    budgets_this_month: Object.fromEntries(budgets.map(b => [b.category, +b.amount])),
  };
  return { tasks, routines, students, habits, bills: billsNow, billPaid: new Set(billPays.map(p => p.bill_id)), month, forAi, exams, events, goals, dues, entries };
}

// one plain line for each proposed change, made from the real data (not from the AI's words)
function describe(a, c) {
  const T = id => c.tasks.find(x => x.id === id), R = id => c.routines.find(x => x.id === id), S = id => c.students.find(x => x.id === id);
  const when = (d, t) => `${fmtDate(d, { weekday: "short", day: "numeric", month: "short" })} ${fmtHM(t)}`;
  const tline = t => `${t.title} · ${when(t.day, hm(t.start_at))}`;
  const days = ds => (ds || []).map(d => BN_DAYS[d] || d).join(", ");
  switch (a.type) {
    case "add_task": if (!a.title || !DATE.test(a.date || "") || !HHMM.test(a.start || "")) return null;
      return { ic: "➕", area: "task+", text: `নতুন টাস্ক: ${a.title} · ${when(a.date, a.start)} · ${durLabel(a.minutes || 60)} · ${a.category || "Work / Personal"}${a.student_id && S(a.student_id) ? " · " + S(a.student_id).name : ""}` };
    case "remove_task": { const t = T(a.task_id); if (!t || t.status !== "pending") return null; return { ic: "🗑️", area: "task-", text: `বাদ: ${tline(t)}` }; }
    case "move_task": { const t = T(a.task_id); if (!t || t.status !== "pending" || !HHMM.test(a.new_start || "")) return null;
      return { ic: "🕒", area: "task~", text: `সময় বদল: ${tline(t)} → ${when(DATE.test(a.new_date || "") ? a.new_date : t.day, a.new_start)}` }; }
    case "mark_task": { const t = T(a.task_id); if (!t || !["completed", "not_completed"].includes(a.result)) return null;
      return { ic: a.result === "completed" ? "✅" : "❌", area: "mark", text: `${a.result === "completed" ? "Completed" : "Not completed"} মার্ক: ${tline(t)}` }; }
    case "add_routine": if (!a.title || !HHMM.test(a.start || "") || !(a.days || []).length) return null;
      return { ic: "🔁", area: "routine+", text: `প্রতি সপ্তাহে: ${a.title} · ${days(a.days)} · ${fmtHM(a.start)} · ${durLabel(a.minutes || 60)}${a.student_id && S(a.student_id) ? " · " + S(a.student_id).name : ""}` };
    case "edit_routine": { const r = R(a.routine_id); if (!r) return null;
      const ch = [a.title && `নাম → ${a.title}`, a.start && `সময় → ${fmtHM(a.start)}`, a.minutes && `সময়কাল → ${durLabel(a.minutes)}`, a.days && `দিন → ${days(a.days)}`, a.category && `ক্যাটাগরি → ${a.category}`, a.color && "রঙ বদল", a.student_id !== undefined && `স্টুডেন্ট → ${S(a.student_id)?.name || "কেউ না"}`].filter(Boolean);
      return ch.length ? { ic: "✏️", area: "routine~", text: `রুটিন বদল: ${r.title} (${r.days.map(d => BN_DAYS[DAYS[d]]).join(", ")} ${fmtHM(r.start_time.slice(0, 5))}) — ${ch.join(", ")}` } : null; }
    case "remove_routine": { const r = R(a.routine_id); if (!r) return null; return { ic: "🗑️", area: "routine-", text: `রুটিন থেকে পুরো বাদ: ${r.title} (${r.days.map(d => BN_DAYS[DAYS[d]]).join(", ")} ${fmtHM(r.start_time.slice(0, 5))})` }; }
    case "add_category": if (!a.name) return null; return { ic: "🏷️", area: "cat", text: `নতুন ক্যাটাগরি: ${a.name} · ${Math.min(20, Math.max(1, +a.dp || 5))} DP/ঘণ্টা` };
    case "add_student": if (!a.name) return null; return { ic: "🎓", area: "student", text: `নতুন স্টুডেন্ট: ${a.name} · মাসিক ${money(+a.monthly_fee || 0)}` };
    case "edit_student": { const s = S(a.student_id); if (!s) return null;
      const ch = [a.name && `নাম → ${a.name}`, a.monthly_fee != null && `ফি → ${money(+a.monthly_fee)}`, a.active === false && "পড়ানো বন্ধ", a.active === true && "আবার চালু"].filter(Boolean);
      return ch.length ? { ic: "✏️", area: "student", text: `স্টুডেন্ট বদল: ${s.name} — ${ch.join(", ")}` } : null; }
    case "record_fee": { const s = S(a.student_id); if (!s || !MONTH.test(a.month || "")) return null;
      return { ic: "💵", area: "fee", amount: +a.amount || +s.monthly_fee, text: `ফি পাওয়া: ${s.name} · ${fmtDate(a.month + "-01", { month: "long", year: "numeric" })} · ${money(+a.amount || +s.monthly_fee)} (আজকের আয়ে যোগ হবে)` }; }
    case "add_money": if (!["income", "expense"].includes(a.kind) || !(+a.amount > 0)) return null;
      return { ic: a.kind === "income" ? "💰" : "💸", area: a.kind, amount: +a.amount, text: `${a.kind === "income" ? "আয়" : "খরচ"}: ${money(+a.amount)} · ${a.category || "Other"}${a.note ? " · " + a.note : ""} · ${fmtDate(DATE.test(a.date || "") ? a.date : todayStr())}` };
    case "add_event": if (!a.title || !DATE.test(a.date || "")) return null;
      return { ic: { birthday: "🎂", meeting: "🤝", countdown: "⏳" }[a.kind] || "📌", area: "event", text: `ক্যালেন্ডার: ${a.title} · ${fmtDate(a.date)}${a.time && HHMM.test(a.time) ? " " + fmtHM(a.time) : ""}${a.yearly ? " · প্রতি বছর" : ""}` };
    case "add_goal": if (!a.title) return null; return { ic: "🎯", area: "goal", text: `লক্ষ্য (${{ year: "বছর", month: "মাস", week: "সপ্তাহ" }[a.span] || "বছর"}): ${a.title}` };
    case "habit": { const name = c.habits.find(x => x.id === a.habit_id)?.name || a.name; if (!name || !(+a.count > 0 || +a.price > 0)) return null;
      return { ic: "🚫", area: "habit", text: `অভ্যাস: ${name}${+a.count > 0 ? ` · আজ +${+a.count}` : ""}${+a.price > 0 ? ` · দাম ৳${+a.price}/টা` : ""}${c.habits.some(x => x.id === a.habit_id) ? "" : " (নতুন যোগ হবে)"}` }; }
    case "add_bill": if (!a.title || !(+a.amount >= 0)) return null;
      return { ic: "🧾", area: "bill", text: `বিল লিখে রাখা (এখনো দেওয়া হয়নি): ${a.title} · ${money(+a.amount)}${a.monthly === false ? " · শুধু এই মাস" : " · প্রতি মাসে"}${a.due_day ? ` · ${a.due_day} তারিখের মধ্যে` : ""}` };
    case "pay_bill": { const b = c.bills.find(x => x.id === a.bill_id); if (!b || c.billPaid.has(b.id)) return null;
      return { ic: "✅", area: "expense", amount: +a.amount || +b.amount, text: `বিল দেওয়া হয়েছে: ${b.title} · ${money(+a.amount || +b.amount)} (আজকের খরচে যোগ হবে)` }; }
    case "add_due": if (!a.person || !(+a.amount > 0)) return null;
      return { ic: "🤝", area: "due", text: `${a.direction === "i_owe" ? "আমি দেব" : "আমি পাব"}: ${a.person} · ${money(+a.amount)}` };
    case "add_deadline": if (!a.title || !DATE.test(a.date || "")) return null;
      return { ic: "📝", area: "deadline", text: `${KIND_BN[a.kind] || "ডেডলাইন"}: ${a.title}${a.course ? " · " + a.course : ""} · ${fmtDate(a.date, { weekday: "short", day: "numeric", month: "short" })} ${fmtHM(HHMM.test(a.time || "") ? a.time : "10:00")} (রিমাইন্ডার চালু হবে)` };
    case "edit_deadline": { const e = c.exams.find(x => x.id === a.deadline_id); if (!e) return null;
      const ch = [a.title && `নাম → ${a.title}`, DATE.test(a.date || "") && `তারিখ → ${fmtDate(a.date)}`, HHMM.test(a.time || "") && `সময় → ${fmtHM(a.time)}`, a.done === true && "শেষ ✓ (রিমাইন্ডার বন্ধ)", a.done === false && "আবার চালু"].filter(Boolean);
      return ch.length ? { ic: "✏️", area: "deadline", text: `${e.title} — ${ch.join(", ")}` } : null; }
    case "remove_deadline": { const e = c.exams.find(x => x.id === a.deadline_id); return e ? { ic: "🗑️", area: "deadline", text: `ডেডলাইন বাদ: ${e.title}` } : null; }
    case "remove_event": { const e = c.events.find(x => x.id === a.event_id); return e ? { ic: "🗑️", area: "event", text: `ক্যালেন্ডার থেকে বাদ: ${e.title} · ${fmtDate(e.date)}` } : null; }
    case "goal_done": case "remove_goal": { const g = c.goals.find(x => x.id === a.goal_id); return g ? { ic: a.type === "goal_done" ? "🎯" : "🗑️", area: "goal", text: `${a.type === "goal_done" ? "লক্ষ্য পূরণ ✓" : "লক্ষ্য বাদ"}: ${g.title}` } : null; }
    case "settle_due": { const d = c.dues.find(x => x.id === a.due_id); return d ? { ic: "✅", area: "due", text: `মিটে গেছে: ${d.person} · ${money(+d.amount)}` } : null; }
    case "remove_bill": { const b = c.bills.find(x => x.id === a.bill_id); return b ? { ic: "🗑️", area: "bill", text: `বিল লিস্ট থেকে বাদ: ${b.title}` } : null; }
    case "set_budget": if (!a.category || !(+a.amount >= 0)) return null;
      return { ic: "📊", area: "budget", text: `এই মাসের বাজেট: ${a.category} · ${money(+a.amount)}` };
    case "edit_money": { const e = c.entries.find(x => x.id === a.entry_id); if (!e || !(+a.amount >= 0)) return null;
      return { ic: "✏️", area: "money~", text: `টাকার হিসাব বদল (PIN লাগবে, পুরোনো অঙ্ক ইতিহাসে থাকবে): ${e.category} ${fmtDate(e.entry_date)} · ${money(+e.amount)} → ${money(+a.amount)}${a.note ? " · " + a.note : ""}` }; }
    case "mark_prayer": { if (!isMuslim()) return null; const w = waqts(todayStr()).find(x => x.key === a.prayer); if (!w || Date.now() < w.start || !["prayed", "not_prayed"].includes(a.status)) return null;
      return { ic: "🕌", area: "prayer", text: `${w.en}: ${a.status === "prayed" ? "Prayed ✓" : "Not prayed"}` }; }
    case "set_bedtime": return HHMM.test(a.time || "") ? { ic: "🌙", area: "setting", text: `ঘুমের সময়: ${fmtHM(a.time)} (রাতের রিপোর্ট ৩০ মিনিট আগে)` } : null;
  }
  return null;
}

function summary(items) {
  const n = k => items.filter(x => x.d.area === k).length;
  const sum = k => items.filter(x => x.d.area === k).reduce((s, x) => s + (x.d.amount || 0), 0);
  return [
    (n("task+") || n("task-") || n("task~") || n("mark")) && `📅 টাস্ক: ${[n("task+") && "+" + n("task+") + " নতুন", n("task-") && "−" + n("task-") + " বাদ", n("task~") && n("task~") + "টা সময় বদল", n("mark") && n("mark") + "টা মার্ক"].filter(Boolean).join(", ")}`,
    (n("routine+") || n("routine~") || n("routine-")) && `🔁 প্রতি সপ্তাহের রুটিন: ${[n("routine+") && "+" + n("routine+") + " নতুন", n("routine~") && n("routine~") + "টা বদল", n("routine-") && "−" + n("routine-") + " বাদ"].filter(Boolean).join(", ")}`,
    (sum("income") + sum("fee")) && `💰 আয় বাড়বে: ${money(sum("income") + sum("fee"))}`,
    sum("expense") && `💸 খরচ বাড়বে: ${money(sum("expense"))}`,
    (n("student") || n("fee")) && `🎓 টিউশন: ${[n("student") && n("student") + "টা স্টুডেন্ট যোগ/বদল", n("fee") && n("fee") + "টা মাসের ফি"].filter(Boolean).join(", ")}`,
    n("bill") && `🧾 +${n("bill")} বিল লিস্টে (দেওয়া না হওয়া পর্যন্ত খরচ ধরা হবে না)`,
    n("deadline") && `📝 ${n("deadline")}টা ডেডলাইন (CT/ল্যাব/পরীক্ষা)`, n("budget") && `📊 ${n("budget")}টা বাজেট`, n("money~") && `✏️ ${n("money~")}টা টাকার হিসাব বদল (PIN)`, n("setting") && "⚙️ সেটিং বদল",
    n("cat") && `🏷️ +${n("cat")} ক্যাটাগরি`, n("event") && `🗓️ +${n("event")} ক্যালেন্ডারে`, n("goal") && `🎯 +${n("goal")} লক্ষ্য`, n("habit") && `🚫 ${n("habit")}টা অভ্যাসের হিসাব`, n("due") && `🤝 +${n("due")} পাওনা/দেনা`,
  ].filter(Boolean);
}

async function run(a, c) {
  const T = id => c.tasks.find(x => x.id === id);
  const activeTemplate = c.routines.find(r => r.template)?.template || "Normal";
  const dayNums = ds => (ds || []).map(d => DAYS.indexOf(String(d).slice(0, 3))).filter(d => d >= 0);
  const okCat = x => catNames().includes(x) ? x : "Work / Personal";
  const addOne = async (title, category, date, start, minutes, student, color) => {
    const s = dhakaIso(date, start);
    const id = await api.rpc("add_task", { p_title: title, p_category: okCat(category), p_start: s, p_end: new Date(new Date(s).getTime() + minutes * 60000).toISOString(), p_student: student || null });
    if (color && id) await api.update("tasks", `id=eq.${id}`, { color });
  };
  const len = (t, m) => Number(m) || Math.round((new Date(t.end_at) - new Date(t.start_at)) / 60000);
  switch (a.type) {
    case "add_task": { const col = HEX.test(a.color || "") ? a.color : pickColor(a.title, c.routines); c.routines.push({ title: a.title, color: col }); return addOne(a.title, a.category, a.date, a.start, Math.min(720, Math.max(5, +a.minutes || 60)), a.student_id, col); }
    case "remove_task": case "move_task": {
      const t = T(a.task_id);
      if (t.routine_id) { try { await api.insert("routine_skips", { routine_id: t.routine_id, day: t.day, user_id: api.userId() }); } catch { /* already */ } }
      await api.remove("tasks", `id=eq.${t.id}&status=eq.pending`);
      if (a.type === "move_task") await addOne(t.title, t.category, DATE.test(a.new_date || "") ? a.new_date : t.day, a.new_start, len(t, a.minutes), t.student_id, t.color || c.routines.find(r => r.id === t.routine_id)?.color);
      return;
    }
    case "mark_task": return api.rpc("complete_task", { p_task: a.task_id, p_result: a.result });
    case "add_routine": {
      const st = c.students.find(s => s.id === a.student_id);
      const col = HEX.test(a.color || "") ? a.color : pickColor(a.title, c.routines); c.routines.push({ title: a.title, color: col });
      await api.insert("routines", { user_id: api.userId(), title: a.title, category: okCat(a.category), start_time: a.start, duration_min: Math.min(720, Math.max(5, +a.minutes || 60)), days: dayNums(a.days), color: col, template: activeTemplate, student_id: st?.id || null, active: true });
      return;
    }
    case "edit_routine": {
      const row = {};
      if (a.title) row.title = a.title; if (a.category) row.category = okCat(a.category); if (HHMM.test(a.start || "")) row.start_time = a.start;
      if (+a.minutes) row.duration_min = Math.min(720, Math.max(5, +a.minutes)); if ((a.days || []).length) row.days = dayNums(a.days);
      if (HEX.test(a.color || "")) row.color = a.color; if (a.student_id !== undefined) row.student_id = c.students.some(s => s.id === a.student_id) ? a.student_id : null;
      await api.update("routines", `id=eq.${a.routine_id}`, row);
      await api.remove("tasks", `routine_id=eq.${a.routine_id}&status=eq.pending&start_at=gt.${new Date().toISOString()}`);
      return;
    }
    case "remove_routine":
      await api.remove("tasks", `routine_id=eq.${a.routine_id}&status=eq.pending&end_at=gt.${new Date().toISOString()}`);
      await api.update("routines", `id=eq.${a.routine_id}`, { active: false, template: "_removed" });
      return;
    case "add_category": return api.insert("user_categories", { user_id: api.userId(), name: a.name.trim(), color: HEX.test(a.color || "") ? a.color : PALETTE[Math.floor(Math.random() * PALETTE.length)], dp: Math.min(20, Math.max(1, Math.round(+a.dp || 5))) });
    case "add_student": return api.insert("students", { user_id: api.userId(), name: a.name.trim(), monthly_fee: +a.monthly_fee || 0, color: HEX.test(a.color || "") ? a.color : PALETTE[Math.floor(Math.random() * PALETTE.length)] });
    case "edit_student": {
      const row = {}; if (a.name) row.name = a.name.trim(); if (a.monthly_fee != null) row.monthly_fee = +a.monthly_fee; if (typeof a.active === "boolean") row.active = a.active;
      return api.update("students", `id=eq.${a.student_id}`, row);
    }
    case "record_fee": { const s = c.students.find(x => x.id === a.student_id); return api.rpc("record_tuition_payment", { p_student: s.id, p_month: a.month + "-01", p_amount: +a.amount || +s.monthly_fee }); }
    case "add_money": { const amt = +a.amount; return api.insert("finance_entries", { user_id: api.userId(), kind: a.kind, category: a.category || (a.kind === "income" ? "Other income" : "Other"), amount: amt, original_amount: amt, note: a.note || null, entry_date: DATE.test(a.date || "") ? a.date : todayStr() }); }
    case "add_event": return api.insert("events", { user_id: api.userId(), title: a.title, kind: ["birthday", "meeting", "class"].includes(a.kind) ? a.kind : "other", date: a.date, time: HHMM.test(a.time || "") ? a.time : null, yearly: !!a.yearly });
    case "add_goal": {
      const span = ["year", "month", "week"].includes(a.span) ? a.span : "year", now = todayStr();
      const wk = (() => { const d = new Date(now); const j = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-W${String(Math.ceil(((d - j) / 864e5 + j.getDay() + 1) / 7)).padStart(2, "0")}`; })();
      return api.insert("goals", { user_id: api.userId(), title: a.title, span, parent_id: null, period: span === "year" ? now.slice(0, 4) : span === "month" ? now.slice(0, 7) : wk });
    }
    case "habit": {
      let id = c.habits.find(x => x.id === a.habit_id)?.id;
      if (!id) { const r = await api.insert("bad_habits", { user_id: api.userId(), name: a.name.trim() }); id = (Array.isArray(r) ? r[0] : r)?.id; if (!id) id = (await api.select("bad_habits", `select=id&name=eq.${encodeURIComponent(a.name.trim())}`))[0]?.id; }
      if (+a.price > 0) await api.update("bad_habits", `id=eq.${id}`, { price: +a.price }).catch(() => {});
      for (let i = 0; i < Math.min(50, +a.count || 0); i++) await api.insert("habit_logs", { user_id: api.userId(), habit_id: id, day: todayStr() });
      return;
    }
    case "add_bill": return api.insert("bills", { user_id: api.userId(), title: a.title.trim(), amount: +a.amount || 0, category: expCats().includes(a.category) ? a.category : "Bills", due_day: +a.due_day >= 1 && +a.due_day <= 31 ? +a.due_day : null, monthly: a.monthly !== false, start_month: c.month });
    case "pay_bill": return api.rpc("pay_bill", { p_bill: a.bill_id, p_month: c.month, p_amount: +a.amount || null });
    case "add_due": return api.insert("dues", { user_id: api.userId(), person: a.person, amount: +a.amount, direction: a.direction === "i_owe" ? "i_owe" : "they_owe", note: a.note || null });
    case "add_deadline": return api.insert("exams", { user_id: api.userId(), kind: KIND_BN[a.kind] ? a.kind : "other", title: a.title.slice(0, 120), course: a.course || null, due_at: new Date(`${a.date}T${HHMM.test(a.time || "") ? a.time : "10:00"}:00+06:00`).toISOString(), note: a.note || null });
    case "edit_deadline": { const e = c.exams.find(x => x.id === a.deadline_id); const row = {};
      if (a.title) row.title = a.title; if (typeof a.done === "boolean") row.done = a.done;
      if (DATE.test(a.date || "") || HHMM.test(a.time || "")) { const cur = new Date(new Date(e.due_at).getTime() + 6 * 3600e3).toISOString(); row.due_at = new Date(`${DATE.test(a.date || "") ? a.date : cur.slice(0, 10)}T${HHMM.test(a.time || "") ? a.time : cur.slice(11, 16)}:00+06:00`).toISOString(); }
      return api.update("exams", `id=eq.${e.id}`, row); }
    case "remove_deadline": return api.remove("exams", `id=eq.${a.deadline_id}`);
    case "remove_event": { const e = c.events.find(x => x.id === a.event_id); await api.remove("events", `id=eq.${e.id}`); return; }
    case "goal_done": return api.update("goals", `id=eq.${a.goal_id}`, { done: true });
    case "remove_goal": return api.remove("goals", `id=eq.${a.goal_id}`);
    case "settle_due": return api.update("dues", `id=eq.${a.due_id}`, { settled: true });
    case "remove_bill": return api.update("bills", `id=eq.${a.bill_id}`, { active: false });
    case "set_budget": return api.upsert("budgets", [{ user_id: api.userId(), month: c.month, category: a.category, amount: +a.amount }], "user_id,month,category");
    case "edit_money": {
      if (c.pin === undefined) c.pin = await askPin("টাকার হিসাব বদলাতে PIN দিন");
      if (!c.pin) throw new Error("PIN দেওয়া হয়নি");
      return api.rpc("edit_finance", { p_entry: a.entry_id, p_amount: +a.amount, p_note: a.note ?? c.entries.find(x => x.id === a.entry_id)?.note ?? null, p_pin: c.pin });
    }
    case "mark_prayer": return api.rpc("mark_prayer", { p_day: todayStr(), p_prayer: a.prayer, p_status: a.status });
    case "set_bedtime": await api.update("profiles", `id=eq.${store.profile.id}`, { sleep_time: a.time }); await loadBasics(); return;
  }
}

// small photo: max 1280px JPEG
export async function shrink(file) {
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("Couldn't open the photo.")); i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  return { mime: "image/jpeg", data: cv.toDataURL("image/jpeg", 0.82).split(",")[1], url: cv.toDataURL("image/jpeg", 0.5) };
}

const YES = /^\s*(হ্যাঁ|হ্যা|হা|হুম|জি|ঠিক আছে|করো|করে দাও|yes|y|ok|okay|ha|haa|hmm|do it)\s*[.!।]*\s*$/i;

export function askSheet(opts = {}) {
  const q = h("textarea.input", { placeholder: "যেমন: আজ Leon নাই, বাদ দাও", maxlength: "800", style: { minHeight: "56px" } });
  const out = h("div");
  const history = [];
  let photo = null, pending = null;
  const thumb = h("div");
  const fileIn = h("span");
  const takePhoto = async () => {
    const f = await pickPhoto("AI-কে ছবি দিন"); if (!f) return;
    try { photo = await shrink(f); thumb.replaceChildren(h("div.row", { style: { gap: "8px", marginTop: "8px" } }, h("img", { src: photo.url, style: { width: "56px", height: "56px", objectFit: "cover", borderRadius: "10px" } }), h("span.small.muted.grow", "ছবি যোগ হয়েছে — এখন লিখে/বলে বলুন কী করতে হবে"), h("button.btn.small.ghost", { type: "button", onclick: () => { photo = null; thumb.replaceChildren(); } }, "✕"))); }
    catch (e) { toast(e.message, "bad"); }
  };
  const photoBtn = h("button.btn.small", { type: "button", onclick: () => takePhoto() }, "📷 ছবি (ক্যামেরা / গ্যালারি)");
  if (opts.text) setTimeout(() => { q.value = opts.text; }, 0);
  if (opts.photo) setTimeout(() => takePhoto(), 450);

  const showPlan = (r, c) => {
    const low = x => String(x || "").trim().toLowerCase();
    const dup = a => (a.type === "add_category" && catNames().some(n => low(n) === low(a.name))) || (a.type === "add_student" && c.students.some(st => low(st.name) === low(a.name)));
    const acts = (r.actions || []).filter(a => !dup(a));
    const items = acts.map(a => ({ a, d: describe(a, c), on: true })).filter(x => x.d);
    const bad = acts.length - items.length;
    const box = h("div");
    if (r.answer) box.append(h("div.card", { style: { marginTop: "10px", whiteSpace: "pre-wrap" } }, r.answer));
    if (bad) box.append(h("p.small.warn", `⚠️ ${bad}টা জিনিস বোঝা যায়নি বা করা সম্ভব না, ওগুলো বাদ রাখলাম।`));
    if (!items.length) { pending = null; out.replaceChildren(box); return; }
    const sumBox = h("div.small", { style: { padding: "8px 10px", borderRadius: "10px", background: "var(--bg2)", margin: "8px 0" } });
    const drawSum = () => sumBox.replaceChildren(h("b", "এতে যা বদলাবে:"), ...summary(items.filter(x => x.on)).map(l => h("div", l)));
    const list = h("div.list", items.map(x => h("label.li", { style: { alignItems: "flex-start", cursor: "pointer" } },
      h("input", { type: "checkbox", checked: true, style: { width: "20px", height: "20px", accentColor: "var(--brand)", marginTop: "2px", flexShrink: 0 }, onchange: e => { x.on = e.target.checked; drawSum(); } }),
      h("div.grow", h("div", x.d.ic, " ", x.d.text), x.a.label && x.a.label !== x.d.text ? h("div.small.faint", x.a.label) : null))));
    drawSum();
    const log = h("div.small", { style: { marginTop: "8px" } });
    const yes = h("button.btn.primary", "✅ হ্যাঁ, করো");
    const no = h("button.btn", "বাতিল");
    const doIt = async () => {
      const FIRST = ["add_category", "add_student", "edit_student"];
      const chosen = items.filter(x => x.on).sort((p, q) => (FIRST.includes(q.a.type) ? 1 : 0) - (FIRST.includes(p.a.type) ? 1 : 0));
      if (!chosen.length) { toast("অন্তত একটা টিক দিন।", "bad"); return; }
      pending = null; yes.disabled = no.disabled = true; list.querySelectorAll("input").forEach(i => i.disabled = true);
      let ok = 0, needTasks = false, needBasics = false;
      for (const x of chosen) {
        const line = h("div", "⏳ ", x.d.text); log.append(line);
        try { await run(x.a, c); ok++; line.replaceChildren("✓ ", x.d.text); line.style.color = "var(--green)"; }
        catch (e) { line.replaceChildren("✗ ", x.d.text, " — ", e.message || "হয়নি"); line.style.color = "var(--red)"; }
        if (/routine|task/.test(x.d.area)) needTasks = true; if (x.d.area === "cat") needBasics = true;
      }
      try { if (needTasks) await api.rpc("ensure_tasks", { p_from: todayStr(), p_to: addDays(todayStr(), 7) }); if (needBasics) await loadBasics(); } catch { /* next open fixes it */ }
      log.append(h("div", { style: { marginTop: "6px", fontWeight: 700 } }, `${ok}/${chosen.length}টা হয়ে গেছে ✓`));
      yes.remove(); no.remove();
      toast(`${ok}টা কাজ হয়ে গেছে ✓`, "ok"); rerender();
    };
    yes.onclick = busy(yes, doIt);
    no.onclick = () => { pending = null; out.replaceChildren(h("p.small.muted", "বাতিল করা হয়েছে, কিছু বদলায়নি।")); };
    pending = doIt;
    box.append(h("div.card", { style: { marginTop: "10px", borderColor: "color-mix(in srgb, var(--brand) 45%, transparent)" } },
      h("b", "🤖 আপনি কি এগুলো করতে বলছেন?"), h("p.small.muted", { style: { margin: "4px 0 8px" } }, "যেটা চান না, টিক তুলে দিন। “হ্যাঁ, করো” না চাপা পর্যন্ত কিছুই বদলাবে না।"),
      list, sumBox, h("div.row", { style: { gap: "8px", justifyContent: "flex-end" } }, no, yes), log));
    out.replaceChildren(box);
  };

  const ask = async ({ text, audio }) => {
    if (!audio && !photo && pending && YES.test(text || "")) { q.value = ""; await pending(); return; }
    out.replaceChildren(h("p.small.muted", photo ? "🤖 ছবি দেখছে…" : "🤖 ভাবছে…"));
    const c = await gather();
    const r = await api.ai("ask", { question: text || "", audio: audio || null, image: photo ? { mime: photo.mime, data: photo.data } : null, ctx: c.forAi, history: history.slice(-6), today: todayStr() });
    if (r.heard) q.value = r.heard;
    history.push({ role: "user", text: r.heard || text || (photo ? "[photo]" : "") }, { role: "ai", text: (r.answer || "").slice(0, 400) + ((r.actions || []).length ? ` [proposed ${(r.actions || []).length} changes]` : "") });
    photo = null; thumb.replaceChildren();
    showPlan(r, c);
  };
  const voice = voiceRecorder(audio => ask({ audio }), { label: "বলুন — প্রশ্ন বা কাজ" });
  // quick questions: tap to ask
  const QUICK = ((api.LS.get("al_coach") || {}).questions || []).slice(0, 4).filter(Boolean);
  if (QUICK.length < 2) QUICK.push("আজ আমার রুটিনে কী কী আছে?", "এই সপ্তাহে কোথায় পিছিয়ে আছি?");
  const chips = h("div.row.wrap", { style: { gap: "6px", margin: "8px 0 4px" } }, QUICK.map(x => {
    const b = h("button.chip", { type: "button" }, x);
    b.onclick = busy(b, async () => { q.value = x; await ask({ text: x }); });
    return b;
  }));
  return sheet("✨ AI", [
    coachBox(),
    chips,
    voice, h("div", { style: { height: "8px" } }), q, h("div.row", { style: { gap: "8px", marginTop: "6px" } }, photoBtn, fileIn), thumb, out], {
    actions: close => {
      const go = h("button.btn.primary", "Send");
      go.onclick = busy(go, async () => {
        if (!q.value.trim() && !photo) throw new Error("লিখুন, বলুন বা ছবি দিন।");
        await ask({ text: q.value.trim() });
      });
      return [h("button.btn", { onclick: () => close() }, "Close"), go];
    },
  });
}

// AI suggestions (coach): last advice shows at once, then refreshes
function coachBox() {
  const box = h("div.ai-tips");
  const draw = r => {
    const alerts = r.alerts || [], tips = r.tips || [];
    const re = h("button.linkbtn.small", "↻ New advice");
    re.onclick = busy(re, () => load(true));
    box.replaceChildren(...[
      r.summary ? h("p.small", { style: { margin: "0 0 6px" } }, r.summary) : null,
      ...alerts.map(a => h("div.ai-alert" + (a.level === "high" ? ".high" : ""), h("b.small", "⚠️ ", a.title), h("div.small", a.text))),
      ...tips.slice(0, 3).map(t => h("div.ai-tip", h("b.small", "💡 ", t.title), h("div.small.muted", t.text))),
      h("div", { style: { textAlign: "right" } }, re)].filter(Boolean));
  };
  const load = async refresh => {
    try { const r = await api.ai("coach", { refresh }); api.LS.set("al_coach", r); draw(r); }
    catch (e) { if (!api.LS.get("al_coach")) box.replaceChildren(h("p.small.muted", e.offline ? "AI needs internet." : e.message)); }
  };
  const c = api.LS.get("al_coach");
  if (c) draw(c); else box.replaceChildren(h("p.small.muted", "✨ Suggestions loading…"));
  load(false);
  return box;
}
