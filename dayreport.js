// My Lifestyle — the day in one page: work, DP, money, prayers, habits, and the AI's verdict
import * as api from "./api.js";
import { h, icon, todayStr, addDays, fmtDate, durLabel, tk as money, busy, ring } from "./ui.js";
import { route, store, catColor } from "./app.js";
import { isMuslim } from "./prayer.js";

const mins = t => Math.max(0, Math.round((new Date(t.end_at) - new Date(t.start_at)) / 60000));
route("day", async (page, dayArg) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayArg || "") ? dayArg : todayStr();
  page.append(h("header.topbar",
    h("div.row", { style: { gap: "10px" } }, h("a.icon-btn", { href: "#/today", "aria-label": "Back" }, icon("back")),
      h("div", h("h1", day === todayStr() ? "Today's report" : "Day report"), h("div.sub", fmtDate(day, { weekday: "long", day: "numeric", month: "long" })))),
    h("div.row", { style: { gap: "6px" } }, h("a.btn.small", { href: `#/day/${addDays(day, -1)}` }, "‹ Prev day"),
      day < todayStr() ? h("a.btn.small", { href: `#/day/${addDays(day, 1)}` }, "Next ›") : null)));
  const [tasks, ledger, fin, prayers, hlogs, habits, life] = await Promise.all([
    api.select("tasks", `select=title,category,status,start_at,end_at,dp_awarded,done_pct,is_timer&day=eq.${day}&order=start_at`),
    api.select("dp_ledger", `select=dp,coins,reason&day=eq.${day}`).catch(() => []),
    api.select("finance_entries", `select=kind,category,amount,note&entry_date=eq.${day}`).catch(() => []),
    isMuslim() ? api.select("prayer_logs", `select=prayer,status&day=eq.${day}`).catch(() => []) : Promise.resolve(null),
    api.select("habit_logs", `select=habit_id&day=eq.${day}`).catch(() => []),
    api.select("bad_habits", "select=id,name,price").catch(() => []),
    api.select("life_logs", `select=water,slept_at,woke_at,mood&day=eq.${day}`).catch(() => []),
  ]);
  const real = tasks.filter(t => !t.is_timer);
  const done = real.filter(t => ["completed", "late_completed"].includes(t.status));
  const notDone = real.filter(t => ["not_completed", "missed"].includes(t.status));
  const pending = real.filter(t => t.status === "pending");
  const share = done.reduce((s, t) => s + (t.done_pct || 100) / 100, 0);
  const pct = real.length ? share / real.length : 0;
  const workMin = tasks.filter(t => ["completed", "late_completed"].includes(t.status)).reduce((s, t) => s + mins(t) * (t.done_pct || 100) / 100, 0);
  const dp = ledger.reduce((s, r) => s + r.dp, 0), coins = ledger.reduce((s, r) => s + r.coins, 0);
  const inc = fin.filter(r => r.kind === "income").reduce((s, r) => s + +r.amount, 0), exp = fin.filter(r => r.kind === "expense").reduce((s, r) => s + +r.amount, 0);
  const byCat = {}; tasks.filter(t => ["completed", "late_completed"].includes(t.status)).forEach(t => byCat[t.category] = (byCat[t.category] || 0) + mins(t) * (t.done_pct || 100) / 100);
  const expCat = {}; fin.filter(r => r.kind === "expense").forEach(r => expCat[r.category] = (expCat[r.category] || 0) + +r.amount);
  const prayed = prayers ? prayers.filter(p => p.status === "prayed").length : null;
  const habitSum = {}; hlogs.forEach(l => habitSum[l.habit_id] = (habitSum[l.habit_id] || 0) + 1);
  const habitLines = Object.entries(habitSum).map(([id, n]) => { const hb = habits.find(x => x.id === id); return hb ? { name: hb.name, n, cost: n * (+hb.price || 0) } : null; }).filter(Boolean);

  // headline
  page.append(h("div.hero", ring(pct, `${Math.round(pct * 100)}%`, ""),
    h("div.grow", h("div", h("b.mid", `${done.length}/${real.length}`), h("span.small.muted", " tasks done")),
      h("div.small.muted", `${durLabel(Math.round(workMin))} of work · ${dp >= 0 ? "+" : ""}${dp} DP · ${coins} coins`))));
  page.append(h("div.grid3",
    h("div.stat", h("div.k", "Income"), h("div.v.ok", money(inc))),
    h("div.stat", h("div.k", "Spent"), h("div.v.bad", money(exp))),
    prayed !== null ? h("div.stat", h("div.k", "🕌 Prayers"), h("div.v", `${prayed}/5`)) : h("div.stat", h("div.k", "Streak"), h("div.v", "🔥"))));

  // AI verdict
  const aiBox = h("div.card.ai-tips", { style: { marginTop: "12px" } }, h("p.small.muted", "✨ AI is looking at your day…"));
  page.append(aiBox);
  const key = "al_dayai_" + day;
  const facts = [
    `Date ${day}. Tasks: ${done.length} done, ${notDone.length} not done, ${pending.length} not marked, of ${real.length}. Completion ${Math.round(pct * 100)}%.`,
    `Work time by category (minutes): ${JSON.stringify(Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, Math.round(v)])))}.`,
    `Done: ${done.map(t => t.title + (t.done_pct && t.done_pct < 100 ? ` (${t.done_pct}%)` : "")).join(", ") || "none"}. Not done: ${notDone.map(t => t.title).join(", ") || "none"}. Not marked: ${pending.map(t => t.title).join(", ") || "none"}.`,
    `DP ${dp}, coins ${coins}. Income ৳${inc}, spent ৳${exp} ${JSON.stringify(expCat)}.`,
    prayed !== null ? `Prayers prayed: ${prayed}/5.` : "",
    habitLines.length ? `Bad habits: ${habitLines.map(x => `${x.name} ×${x.n}${x.cost ? ` (৳${x.cost})` : ""}`).join(", ")}.` : "",
    life[0] ? `Water ${life[0].water || 0} glasses.` : "",
  ].filter(Boolean).join(" ");
  const drawAi = txt => aiBox.replaceChildren(h("b", "✨ AI on your day"), h("div", { style: { whiteSpace: "pre-wrap", marginTop: "6px", lineHeight: 1.6 } }, txt), (() => {
    const b = h("button.linkbtn.small", { style: { marginTop: "6px" } }, "↻ Ask again"); b.onclick = busy(b, () => runAi(true)); return b; })());
  const runAi = async force => {
    const c = api.LS.get(key);
    if (c && !force && c.facts === facts) return drawAi(c.text);
    try {
      const r = await api.ai("ask", { question: `আমার এই দিনের রিপোর্ট দেখে বাংলায় মূল্যায়ন করো (কোনো action দিও না, actions: []). ফরম্যাট: প্রথম লাইনে এক কথায় রায় (দারুণ / ভালো / মোটামুটি / খারাপ দিন) আর কেন। তারপর "✅ ভালো যা করেছ:" ২-৩টা পয়েন্ট, "⚠️ যেখানে ভুল হয়েছে:" ১-৩টা পয়েন্ট (সত্যি কথা, নরমভাবে), "🎯 কাল যা করবে:" ২টা নির্দিষ্ট কাজ, শেষে এক লাইনের অনুপ্রেরণা। ভালো দিন হলে প্রশংসা করো, খারাপ হলে পরিষ্কার বলো কোথায় ভুল। DATA: ${facts}`, ctx: {}, history: [], today: todayStr() });
      const text = (r.answer || "").trim() || "—";
      api.LS.set(key, { facts, text }); drawAi(text);
    } catch (e) { aiBox.replaceChildren(h("p.small.muted", e.offline ? "AI needs internet." : e.message)); }
  };
  if (real.length || fin.length) runAi(false); else aiBox.replaceChildren(h("p.small.muted", "No tasks or money this day yet."));

  // details
  const sec = (title, kids) => page.append(h("div.card", h("h3", title), kids));
  if (Object.keys(byCat).length) sec("Work time", h("div.list", Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, m]) => h("div.li", h("i", { style: { width: "10px", height: "10px", borderRadius: "3px", background: catColor(c) } }), h("div.grow", c), h("b", durLabel(Math.round(m)))))));
  if (real.length) sec("Tasks", h("div.list", real.map(t => h("div.li",
    h("span.mark" + (["completed", "late_completed"].includes(t.status) ? ".ok" : ["not_completed", "missed"].includes(t.status) ? ".bad" : ""), { style: t.status === "pending" ? { background: "var(--line2)" } : {} }, ["completed", "late_completed"].includes(t.status) ? "✓" : t.status === "pending" ? "·" : "✕"),
    h("div.grow", t.title, t.done_pct && t.done_pct < 100 ? h("span.small.muted", ` · ${t.done_pct}%`) : null),
    h("span.small" + (t.dp_awarded < 0 ? ".bad" : ".muted"), t.dp_awarded ? `${t.dp_awarded > 0 ? "+" : ""}${t.dp_awarded} DP` : "")))));
  if (fin.length) sec("Money", h("div.list", fin.map(r => h("div.li", h("div.grow", r.category, r.note ? h("span.small.muted", " · " + r.note) : null), h("b" + (r.kind === "income" ? ".ok" : ".bad"), (r.kind === "income" ? "+" : "−") + money(+r.amount))))));
  if (habitLines.length) sec("Habits", h("div.list", habitLines.map(x => h("div.li", h("div.grow", x.name), h("b", `×${x.n}`), x.cost ? h("span.small.muted", " · " + money(x.cost)) : null))));
}, { tab: "today" });
