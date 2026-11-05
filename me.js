// My Lifestyle — profile, stats, badges, heatmap, life tracking
import * as api from "./api.js";
import { h, icon, t, toast, sheet, busy, todayStr, addDays, fmtDate, barChart, donut, PALETTE } from "./ui.js";
import { route, store, catColor, rerender, backbar, ROLES, myRoles } from "./app.js";
import { RELIGIONS } from "./prayer.js";

export function badgesFrom(s) {
  const study = Number(s.hours30?.["Study + Class"] || 0);
  const out = [];
  if (s.streak >= 7) out.push(["🔥", "7-day streak"]);
  if (s.streak >= 30) out.push(["🏅", "30-day streak"]);
  if (s.streak >= 100) out.push(["👑", "100-day streak"]);
  if (study >= 10) out.push(["📚", "10 study hours (30 days)"]);
  if (study >= 50) out.push(["🎓", "50 study hours (30 days)"]);
  if (study >= 100) out.push(["🧠", "100 study hours (30 days)"]);
  if (Number(s.year_dp) >= 10000) out.push(["💎", "10,000 DP this year"]);
  return out;
}

export function heatmap(map) {
  const today = todayStr();
  let start = addDays(today, -364);
  start = addDays(start, -new Date(start + "T00:00:00").getDay());
  const cells = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const n = map?.[d] || 0;
    cells.push(h("i" + (n ? `.l${Math.min(4, n)}` : ""), { title: `${fmtDate(d)}: ${n} task${n === 1 ? "" : "s"} done` }));
  }
  const box = h("div.heat", cells);
  setTimeout(() => box.scrollLeft = box.scrollWidth, 50);
  return box;
}

export function statCharts(s) {
  const parts = Object.entries(s.hours30 || {}).map(([c, v]) => ({ l: c, v: Number(v), c: catColor(c), fmt: v + "h" }));
  return [
    h("div.card", h("h3", "DP — last 30 days"), barChart(s.daily.map(d => ({ l: d.day.slice(8), v: d.dp })))),
    parts.length ? h("div.card", h("h3", "Where your time went (30 days)"), donut(parts, { center: parts.reduce((a, p) => a + p.v, 0).toFixed(0) + "h" })) : null,
    s.months?.length ? h("div.card", h("h3", "DP by month (this year)"), barChart(s.months.map(m => ({ l: new Date(m.month + "-01").toLocaleDateString("en-GB", { month: "short" }), v: m.dp })), { color: "var(--amber)" })) : null,
    h("div.card", h("h3", "Your year"), h("p.hint", "Each square is a day. Greener = more tasks done."), heatmap(s.heatmap)),
  ];
}

route("me", async page => {
  const s = await api.rpc("my_stats");
  const p = store.profile;
  const lv = s.level;
  const prog = lv.next_min ? (s.month_dp - lv.cur_min) / (lv.next_min - lv.cur_min) : 1;
  page.append(h("header.topbar", h("div", h("h1", p.name), h("div.sub", [myRoles(p).map(k => ROLES[k].icon + " " + ROLES[k].label).join(" + ") || null, RELIGIONS[p.religion] && p.religion !== "other" ? RELIGIONS[p.religion].split(" · ")[0] : null].filter(Boolean).map(x => x + " · ").join(""), "Member since " + fmtDate(p.created_at.slice(0, 10), { month: "long", year: "numeric" }), " · ", h("a", { href: "#/settings/profile" }, "Edit profile"))),
    h("a.icon-btn", { href: "#/settings", "aria-label": t("Settings") }, icon("gear"))));
  page.append(h("div.hero", { style: { flexDirection: "column", alignItems: "stretch" } },
    h("div.row.between", h("span.level-pill", icon("medal"), `${lv.name} · this month`), h("span.badge", "Year rank: ", s.year_level.name)),
    h("div", h("span.big", s.month_dp), h("span.muted", " DP this month")),
    h("div.bar", h("i", { style: { width: Math.max(0, Math.min(1, prog)) * 100 + "%" } })),
    h("div.small.muted", lv.next ? `${lv.next_min - s.month_dp} DP more to reach ${lv.next}. New season starts on the 1st.` : "Diamond — the top level! 💎")));
  page.append(h("div.grid3",
    h("div.stat", h("div.k", "🔥 " + t("Streak")), h("div.v", s.streak + "d")),
    h("div.stat", h("div.k", "🪙 " + t("Coins")), h("div.v", s.coins_total)),
    h("div.stat", h("div.k", "Year DP"), h("div.v", s.year_dp))));
  const badges = badgesFrom(s);
  page.append(h("div.card.mt", h("h3", "Badges"), badges.length ? h("div.row.wrap", { style: { gap: "8px" } }, badges.map(([e, l]) => h("span.badge", e + " " + l)))
    : h("p.hint.mb0", "Earn badges with a 7-day streak, 10 study hours and more.")));
  page.append(...statCharts(s).filter(Boolean));
  page.append(h("div.list",
    h("a.li", { href: "#/life" }, h("div.ic", icon("heart")), h("div.grow", h("b", "Sleep, water, habits & diary")), icon("chev", "chev"))));
}, { tab: "me" });

// ---------- life tracking
route("life", async page => {
  const today = todayStr();
  page.append(backbar("Daily life", "#/me"));
  const [logs, habits, hlogs] = await Promise.all([
    api.select("life_logs", `select=*&day=gte.${addDays(today, -13)}&order=day.desc`),
    api.select("bad_habits", "select=*&archived=eq.false&order=created_at"),
    api.select("habit_logs", "select=*&order=day.desc&limit=500"),
  ]);
  const L = logs.find(l => l.day === today) || { user_id: api.userId(), day: today, water: 0 };
  const save = async patch => { Object.assign(L, patch); const r = await api.offlineSafe({ kind: "upsert", table: "life_logs", onConflict: "user_id,day", rows: [{ user_id: api.userId(), day: today, water: L.water || 0, slept_at: L.slept_at || null, woke_at: L.woke_at || null, mood: L.mood || null, diary: L.diary || null }] }); if (r?.queued) toast("Saved offline ✓"); };

  // water
  const wv = h("span.big", L.water || 0);
  const plus = h("button.btn.primary", icon("plus"), "1 glass");
  plus.onclick = busy(plus, async () => { await save({ water: (L.water || 0) + 1 }); wv.textContent = L.water; });
  const minus = h("button.btn", "−");
  minus.onclick = busy(minus, async () => { if (L.water > 0) { await save({ water: L.water - 1 }); wv.textContent = L.water; } });
  page.append(h("div.card", h("h3", "💧 Water today"), h("div.row.between", h("div", wv, h("span.muted", " glasses")), h("div.row", minus, plus))));

  // sleep
  const sa = h("input.input", { type: "time", value: L.slept_at?.slice(0, 5) || "" });
  const wa = h("input.input", { type: "time", value: L.woke_at?.slice(0, 5) || "" });
  const sb = h("button.btn.block", t("Save"));
  sb.onclick = busy(sb, async () => { await save({ slept_at: sa.value || null, woke_at: wa.value || null }); toast("Sleep saved ✓", "ok"); });
  const lastN = logs.filter(l => l.slept_at && l.woke_at).slice(0, 7);
  const hrs = l => { const [a, b] = [l.slept_at, l.woke_at].map(x => { const [H, M] = x.split(":").map(Number); return H * 60 + M; }); return ((b - a + 1440) % 1440) / 60; };
  page.append(h("div.card", h("h3", "😴 Sleep"), h("p.hint", "When did you sleep last night and wake up today?"),
    h("div.grid2", h("label.f", h("span", "Slept at"), sa), h("label.f", h("span", "Woke at"), wa)), sb,
    lastN.length ? h("p.small.muted.mt.mb0", `Average last ${lastN.length} nights: ${(lastN.reduce((a, l) => a + hrs(l), 0) / lastN.length).toFixed(1)} hours`) : null));

  // mood + diary
  const moods = [["great", "😀"], ["okay", "😐"], ["bad", "😞"]];
  const mrow = h("div.seg", moods.map(([k, e]) => h("button" + (L.mood === k ? ".on" : ""), { type: "button", style: { fontSize: "22px" }, "aria-label": k, onclick: async ev => { await save({ mood: k }); mrow.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === ev.currentTarget)); } }, e)));
  const diary = h("textarea.input", { placeholder: "How was your day? (only you can see this)", maxlength: "2000" }, L.diary || "");
  const db = h("button.btn.block.mt", t("Save"));
  db.onclick = busy(db, async () => { await save({ diary: diary.value }); toast("Diary saved ✓", "ok"); });
  page.append(h("div.card", h("h3", "📝 Mood & diary"), mrow, h("div.mt", diary), db));

  // bad habits — tap + each time it happens (e.g. each cigarette); − only undoes a tap from the last 2 minutes
  const hb = h("div.card", h("div.row.between", h("h3.mb0", "🚫 Bad habits"), h("button.btn.small", { onclick: () => habitSheet() }, icon("plus"), "Add")),
    h("p.hint.mt", "Tap ＋ each time it happens (for smoking: once per cigarette). A mistake can be undone within 2 minutes. Tap a habit's name for graphs and money spent."));
  habits.forEach(hab => {
    const mine = hlogs.filter(x => x.habit_id === hab.id);
    const todayN = mine.filter(x => x.day === today).length;
    const last = mine[0]?.day;
    const clean = last ? Math.round((new Date(today) - new Date(last)) / 864e5) : Math.round((new Date(today) - new Date(hab.created_at.slice(0, 10))) / 864e5);
    const month = mine.filter(x => x.day.slice(0, 7) === today.slice(0, 7)).length;
    const u = n => unitText(hab, n);
    const plus = h("button.btn.small", { "aria-label": "Add one" }, "＋1");
    plus.onclick = busy(plus, async () => { await api.insert("habit_logs", { user_id: api.userId(), habit_id: hab.id, day: today }); rerender(); });
    const recent = mine.find(y => y.day === today && Date.now() - new Date(y.created_at) < UNDO_MS);
    const minus = h("button.btn.small.ghost", { "aria-label": "Undo last", disabled: !recent, title: recent ? "Undo the last tap" : "Only a tap from the last 2 minutes can be undone" }, "−");
    minus.onclick = busy(minus, async () => { if (recent) await api.remove("habit_logs", `id=eq.${recent.id}`); rerender(); });
    const fresh = Date.now() - new Date(hab.created_at) < UNDO_MS;
    hb.append(h("div.row.between", { style: { padding: "10px 0", borderTop: "1px solid var(--line)", gap: "8px" } },
      h("a.grow", { href: `#/habit/${hab.id}`, style: { color: "inherit" } }, h("b", hab.name, " ", h("span.small.faint", "📊")),
        h("div.small", { style: { color: todayN ? "var(--red)" : "var(--green)" } }, todayN ? `Today: ${u(todayN)}` + (hab.price ? ` · ${money(todayN * hab.price)}` : "") : "Today: none 👍"),
        h("div.small.muted", `${todayN ? "" : clean + " day" + (clean === 1 ? "" : "s") + " clean · "}this month: ${u(month)}` + (hab.price ? ` · ${money(month * hab.price)}` : ""))),
      fresh ? h("button.btn.small.ghost", { "aria-label": "Edit", onclick: () => habitSheet(hab) }, icon("edit")) : null,
      h("div.row", { style: { gap: "6px" } }, minus, plus)));
  });
  page.append(hb);
}, { tab: "me" });

const UNDO_MS = 2 * 60 * 1000;
const SMOKE = /smok|cigar|sigar|সিগার|ধূমপান|বিড়ি|বিড়ি/i;
const money = n => "৳" + Math.round(n).toLocaleString("en-IN");
function unitText(hab, n) { const u = SMOKE.test(hab.name) ? ["cigarette", "cigarettes"] : ["time", "times"]; return `${n} ${n === 1 ? u[0] : u[1]}`; }

// add a habit; a new one can be renamed or deleted only in its first 2 minutes. Price can be set any time.
function habitSheet(hab) {
  const n = h("input.input", { placeholder: "e.g. Smoking · Sleeping after 1 AM", value: hab?.name || "" });
  const price = h("input.input", { type: "number", inputmode: "decimal", min: "0", placeholder: "e.g. 18", value: hab?.price ?? "" });
  const canEdit = !hab || Date.now() - new Date(hab.created_at) < UNDO_MS;
  if (!canEdit) n.disabled = true;
  sheet(hab ? "Edit habit" : "Add bad habit", [h("label.f", h("span", "Habit"), n),
    h("label.f", h("span", "Price each time (optional, ৳) — e.g. one cigarette"), price),
    h("p.hint", hab ? (canEdit ? "You can rename or delete it within 2 minutes of adding." : "The name is locked now (only the price can change).") : "After saving you have 2 minutes to fix or delete it.")], {
    actions: close => {
      const s = h("button.btn.primary", t("Save"));
      s.onclick = busy(s, async () => {
        if (!n.value.trim()) throw new Error("Write the habit.");
        const row = { price: price.value === "" ? null : Math.max(0, Number(price.value)) };
        if (canEdit) row.name = n.value.trim();
        if (hab) await api.update("bad_habits", `id=eq.${hab.id}`, row); else await api.insert("bad_habits", { user_id: api.userId(), ...row });
        close(true); rerender();
      });
      const b = [h("button.btn", { onclick: () => close(null) }, t("Cancel")), s];
      if (hab && canEdit) {
        const del = h("button.btn.danger", { "aria-label": "Delete" }, icon("trash"));
        del.onclick = busy(del, async () => {
          if (Date.now() - new Date(hab.created_at) >= UNDO_MS) throw new Error("2 minutes are over — it can't be deleted now.");
          await api.update("bad_habits", `id=eq.${hab.id}`, { archived: true }); close(true); location.hash = "#/life";
        });
        b.unshift(del);
      }
      return b;
    },
  });
}

// ---------- one habit: counts and money, by day / week / month
route("habit", async (page, id) => {
  const today = todayStr();
  const [habs, logs] = await Promise.all([
    api.select("bad_habits", `select=*&id=eq.${id}`),
    api.select("habit_logs", `select=day,created_at&habit_id=eq.${id}&day=gte.${addDays(today, -365)}&order=day`),
  ]);
  const hab = habs[0];
  if (!hab || hab.archived) { page.append(backbar("Habit", "#/life"), h("div.card.empty", h("p", "Not found."))); return; }
  page.append(backbar(hab.name, "#/life", h("button.btn.small", { onclick: () => habitSheet(hab) }, hab.price ? "৳ " + hab.price + " each" : "Set price")));
  const cnt = {}; logs.forEach(l => cnt[l.day] = (cnt[l.day] || 0) + 1);
  const P = +hab.price || 0;
  const sumDays = (from, to) => Object.entries(cnt).filter(([d]) => d >= from && d <= to).reduce((a, [, v]) => a + v, 0);
  const wkStart = addDays(today, -6), mStart = today.slice(0, 8) + "01";
  const tN = cnt[today] || 0, wN = sumDays(wkStart, today), mN = sumDays(mStart, today), yN = logs.length;
  const stat = (k, n) => h("div.stat", h("div.k", k), h("div.v", n), P ? h("div.small.muted", money(n * P)) : null);
  page.append(h("div.grid2", stat("Today", tN), stat("Last 7 days", wN), stat("This month", mN), stat("Last 12 months", yN)));
  if (!P) page.append(h("p.hint", "Set a price (top right) to see how much money it costs."));
  const days = [...Array(30)].map((_, i) => addDays(today, i - 29));
  page.append(h("div.card", h("h3", "Per day — last 30 days"), barChart(days.map(d => ({ l: d.slice(8), v: cnt[d] || 0 })), { color: "var(--red)" })));
  const weeks = [...Array(12)].map((_, i) => addDays(today, -7 * (11 - i) - 6));
  const wSum = w => sumDays(w, addDays(w, 6));
  page.append(h("div.card", h("h3", "Per week — last 12 weeks"), barChart(weeks.map(w => ({ l: w.slice(5).replace("-", "/"), v: wSum(w) })), { color: "var(--amber)" })));
  const months = [...Array(12)].map((_, i) => { const d = new Date(today.slice(0, 7) + "-01T00:00:00"); d.setMonth(d.getMonth() - (11 - i)); return d.toISOString().slice(0, 7); });
  const mSum = m => Object.entries(cnt).filter(([d]) => d.slice(0, 7) === m).reduce((a, [, v]) => a + v, 0);
  const lbl = m => new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short" });
  page.append(h("div.card", h("h3", "Per month"), barChart(months.map(m => ({ l: lbl(m), v: mSum(m) })), { color: "var(--red)" })));
  if (P) {
    page.append(h("div.card", h("h3", "💸 Money spent — per week"), barChart(weeks.map(w => ({ l: w.slice(5).replace("-", "/"), v: wSum(w) * P })), { color: "var(--amber)", fmt: money })));
    page.append(h("div.card", h("h3", "💸 Money spent — per month"), barChart(months.map(m => ({ l: lbl(m), v: mSum(m) * P })), { color: "var(--red)", fmt: money }),
      h("p.small.muted.mb0", `Last 12 months: ${money(yN * P)}. At this month's pace that's about ${money(mN / Number(today.slice(8)) * 30 * P)} a month.`)));
  }
}, { tab: "me" });


