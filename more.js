// My Lifestyle — More: routine, calendar, goals, reports, settings, about, download
import * as api from "./api.js";
import { h, icon, t, toast, sheet, confirmBox, busy, askPin, tk, todayStr, addDays, fmtDate, fmtHM, durLabel, DAYS, PALETTE, pad, colorPicker } from "./ui.js";
import { RELIGIONS, religionPicker } from "./prayer.js";
import { route, store, catColor, catNames, catDp, rerender, backbar, topbar, applyTheme, loadBasics, go, ROLES, occupationPicker, myRoles, role, setUnread } from "./app.js";
import { codeResetForm } from "./auth.js";

const li = (href, ic, title, sub) => h("a.li", { href }, h("div.ic", icon(ic)), h("div.grow", h("b", title), sub ? h("div.small.muted", sub) : null), icon("chev", "chev"));

route("more", page => {
  page.append(topbar(t("More")));
  page.append(h("button.share-card", { onclick: shareApp }, h("span.share-ic", "📤"), h("div.grow", h("b", "Share the app with friends"), h("div.small.muted", "WhatsApp, Messenger, Facebook…")), icon("chev", "chev")));
  page.append(h("div.list",
    li("#/calendar", "cal", "Calendar", "Extra classes, birthdays, meetings"),
    li("#/reports", "report", t("Reports"), "PDF with QR verification")));
  page.append(h("div.list",
    li("#/settings", "gear", t("Settings"), "PIN, theme, language, privacy"),
    li("#/download", "download", "Get the app", "Install on your phone"),
    li("#/about", "info", t("About Us")),
    h("button.li", { onclick: () => import("./tour.js").then(m => m.showTour(true)) }, h("div.ic", "📖"), h("div.grow", h("b", "How to use"), h("div.small.muted", "A short guide to every part")), icon("chev", "chev")),
    li("#/privacy", "shield", "Privacy Policy")));
  if (store.profile?.is_admin) page.append(h("div.list", li("ops-7k2q/", "shield", "Admin panel", "Only you can see this")));
  const out = h("button.btn.block.danger", icon("out"), "Log out");
  out.onclick = async () => { if (await confirmBox("Log out?", "You'll need your phone number and password to log in again.", "Log out", true)) { api.logout(); localStorage.removeItem("al_basics"); store.profile = null; go("#/login"); } };
  page.append(out, h("p.center.small.faint.mt", "My Lifestyle · made by Junayed Abedien Leon"));
}, { tab: "more" });

// ---------- share with friends: the phone's own share menu, with the link and a few lines on why
const PITCH = "My Lifestyle — a free app that keeps your day on track:\n✅ Daily routine with reminders before every task\n📝 Exam & deadline alerts that get stronger as the day comes\n৳ Track income and spending in one tap\n✨ An AI helper that plans with you (Bangla or English)\n🏅 Earn points, level up from Bronze to Diamond\nTry it 👇";
async function shareApp() {
  let code = null;
  try { code = await api.rpc("log_share", { p_channel: navigator.share ? "phone" : "menu" }); } catch { /* offline: share anyway */ }
  const url = api.SITE_URL + (code ? `?r=${code}` : "");
  if (navigator.share) {
    try { await navigator.share({ title: "My Lifestyle", text: PITCH, url }); toast("Thanks for sharing! 💚", "ok"); } catch { /* closed */ }
    return;
  }
  const msg = `${PITCH}\n${url}`, enc = encodeURIComponent;
  const log = ch => () => api.rpc("log_share", { p_channel: ch }).catch(() => {});
  sheet("Share the app", [h("p.hint", "Your link: ", h("b", url)),
    h("div.grid2", { style: { gap: "8px" } },
      h("a.btn", { href: `https://wa.me/?text=${enc(msg)}`, target: "_blank", rel: "noopener", onclick: log("whatsapp") }, "WhatsApp"),
      h("a.btn", { href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, target: "_blank", rel: "noopener", onclick: log("facebook") }, "Facebook"),
      h("a.btn", { href: `fb-messenger://share/?link=${enc(url)}`, onclick: log("messenger") }, "Messenger"),
      h("a.btn", { href: `https://t.me/share/url?url=${enc(url)}&text=${enc(PITCH)}`, target: "_blank", rel: "noopener", onclick: log("telegram") }, "Telegram")),
    h("button.btn.primary.block.mt", { onclick: () => { navigator.clipboard?.writeText(msg).then(() => toast("Copied — paste it anywhere ✓", "ok")); log("copy")(); } }, "📋 Copy message + link")]);
}

// ---------- routine (repeats for 365 days)
route("routine", async page => {
  page.append(backbar("Repeating tasks", "#/week"));
  const rows = (await api.select("routines", "select=*&order=start_time")).filter(r => r.template !== "_removed");
  const templates = [...new Set(["Normal", "Exam", ...rows.map(r => r.template)])];
  const activeT = rows.find(r => r.active)?.template || "Normal";
  page.append(h("p.hint", "Set a task once and it appears on the chosen days for a whole year. Switch between routines any time."));
  const seg = h("div.seg", { style: { marginBottom: "14px" } }, templates.map(tp => h("button" + (tp === activeT ? ".on" : ""), {
    onclick: async () => {
      if (tp === activeT) return;
      if (!(await confirmBox(`Switch to “${tp}” routine?`, `Upcoming tasks from the “${activeT}” routine will be removed. Past tasks stay.`, "Switch"))) return;
      try {
        await api.update("routines", `template=eq.${encodeURIComponent(activeT)}`, { active: false });
        await api.update("routines", `template=eq.${encodeURIComponent(tp)}`, { active: true });
        await api.remove("tasks", `routine_id=not.is.null&status=eq.pending&start_at=gt.${new Date().toISOString()}`);
        await api.rpc("ensure_tasks", { p_from: todayStr(), p_to: addDays(todayStr(), 7) });
        toast(`“${tp}” routine is on ✓`, "ok"); rerender();
      } catch (e) { toast(e.message, "bad"); }
    } }, tp + " routine")));
  page.append(seg);
  const mine = rows.filter(r => r.template === activeT);
  if (!mine.length) page.append(h("div.card.empty", icon("routine"), h("p", `No tasks in the “${activeT}” routine yet.`), h("p.small", "Example: Study 9 PM, 2 hours, every day.")));
  mine.forEach(r => page.append(h("div.task", { style: { "--c": r.color || catColor(r.category) }, onclick: () => editRoutine(r, templates) }, h("div.grow",
    h("div.row.between", h("div.t", r.title), h("span.dp", Math.max(1, Math.round(catDp(r.category) * r.duration_min / 60)) + " DP")),
    h("div.meta", `${fmtHM(r.start_time.slice(0, 5))} · ${durLabel(r.duration_min)} · ${r.category}`),
    h("div.meta", r.days.length === 7 ? "Every day" : r.days.map(d => DAYS[d]).join(", "), ` · until ${fmtDate(r.ends_on, { day: "numeric", month: "short", year: "numeric" })}`)))));
  page.append(h("button.fab", { onclick: () => editRoutine(null, templates, activeT), "aria-label": "Add routine task" }, icon("plus")));
}, { tab: "more" });

export async function editRoutine(r, templates, activeT) {
  if (!templates) {
    const rows = (await api.select("routines", "select=template,active")).filter(x => x.template !== "_removed");
    templates = [...new Set(["Normal", "Exam", ...rows.map(x => x.template)])];
    activeT = rows.find(x => x.active)?.template || "Normal";
  }
  const students = await api.select("students", "select=id,name,color&active=eq.true&order=name").catch(() => []);
  const title = h("input.input", { value: r?.title || "", placeholder: "e.g. Tuition — Leon", maxlength: "80" });
  const cat = h("select.input", catNames().map(n => h("option", { value: n, selected: r?.category === n }, `${n} · ${catDp(n)} DP/hour`)));
  // connect this routine to one or more students (name in the routine can be anything)
  let linked = [r?.student_id, ...(r?.student_ids || [])].filter(Boolean);
  const stuBox = h("div.row.wrap", { style: { gap: "6px" } });
  const drawStu = () => stuBox.replaceChildren(...students.map(s => h("button.chip" + (linked.includes(s.id) ? ".on" : ""), { type: "button", onclick: () => { linked = linked.includes(s.id) ? linked.filter(x => x !== s.id) : [...linked, s.id]; drawStu(); } }, linked.includes(s.id) ? "✓ " : "", s.name)));
  drawStu();
  const stu = { get value() { return linked[0] || ""; } };
  const stuRow = h("label.f", h("span", "Connected students (attendance & fees)"), stuBox);
  const showStu = () => { stuRow.style.display = cat.value === "Tuition" && students.length ? "" : "none"; };
  cat.onchange = showStu; showStu();
  const start = h("input.input", { type: "time", value: r?.start_time?.slice(0, 5) || "20:00" });
  const dur = h("input.input", { type: "number", min: "5", max: "720", value: r?.duration_min || 60, inputmode: "numeric" });
  let days = r?.days ? [...r.days] : [0, 1, 2, 3, 4, 5, 6];
  const dayBox = h("div.days", [6, 0, 1, 2, 3, 4, 5].map(d => h("button" + (days.includes(d) ? ".on" : ""), { type: "button", onclick: e => { days = days.includes(d) ? days.filter(x => x !== d) : [...days, d]; e.target.classList.toggle("on"); } }, DAYS[d].slice(0, 2))));
  let color = r?.color || "";
  const colors = colorPicker(color, c => color = c, { allowNone: true });
  const tmpl = h("select.input", templates.map(tp => h("option", { selected: (r?.template || activeT) === tp }, tp)));
  return sheet(r ? "Edit routine task" : "Add routine task", [
    h("label.f", h("span", "Task"), title), h("div.grid2", h("label.f", h("span", "Category"), cat), stuRow),
    h("div.grid2", h("label.f", h("span", "Start"), start), h("label.f", h("span", "Minutes"), dur)),
    h("label.f", h("span", "Days"), dayBox), h("label.f", h("span", "Colour in week chart"), colors), h("label.f", h("span", "Routine"), tmpl),
    r ? h("p.hint", "Changes apply to upcoming days. Already-created tasks for today stay as they are.") : null,
  ], {
    actions: close => {
      const save = h("button.btn.primary", t("Save"));
      save.onclick = busy(save, async () => {
        if (!title.value.trim()) throw new Error("Write the task name.");
        if (!days.length) throw new Error("Pick at least one day.");
        const m = Number(dur.value); if (!(m >= 5 && m <= 720)) throw new Error("Minutes must be 5 to 720.");
        const row = { title: title.value.trim(), category: cat.value, start_time: start.value, duration_min: m, days, color: color || null, template: tmpl.value, student_id: cat.value === "Tuition" ? linked[0] || null : null, student_ids: cat.value === "Tuition" ? linked.slice(1) : [] };
        if (r) {
          await api.update("routines", `id=eq.${r.id}`, row);
          await api.remove("tasks", `routine_id=eq.${r.id}&status=eq.pending&day=gt.${todayStr()}`);
        } else await api.insert("routines", { ...row, user_id: api.userId(), active: tmpl.value === (activeT || "Normal") });
        await api.rpc("ensure_tasks", { p_from: todayStr(), p_to: addDays(todayStr(), 7) });
        toast("Routine saved ✓", "ok"); close(true); rerender();
      });
      const b = [h("button.btn", { onclick: () => close(null) }, t("Cancel")), save];
      if (r) {
        const del = h("button.btn.danger", { "aria-label": "Delete" }, icon("trash"));
        del.onclick = busy(del, async () => {
          if (!(await confirmBox("Delete from ALL days?", `“${r.title}” will be removed from every day it repeats (${r.days.map(d => DAYS[d]).join(", ")}). To remove only one day, untick that day above and tap Save. Past days stay.`, "Delete all", true))) return;
          await api.remove("tasks", `routine_id=eq.${r.id}&status=eq.pending&start_at=gt.${new Date().toISOString()}`);
          await api.remove("routines", `id=eq.${r.id}`); close(true); rerender();
        });
        b.unshift(del);
      }
      return b;
    },
  });
}

// ---------- calendar & countdowns
route("calendar", async (page, ym) => {
  const today = todayStr();
  const [y, m] = (ym || today.slice(0, 7)).split("-").map(Number);
  const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
  const prev = `${new Date(y, m - 2, 1).getFullYear()}-${pad(new Date(y, m - 2, 1).getMonth() + 1)}`;
  const next = `${new Date(y, m, 1).getFullYear()}-${pad(new Date(y, m, 1).getMonth() + 1)}`;
  page.append(backbar("Calendar", "#/more", h("div.row", h("a.icon-btn", { href: `#/calendar/${prev}`, "aria-label": "Previous month" }, icon("back")), h("a.icon-btn", { href: `#/calendar/${next}`, "aria-label": "Next month" }, icon("chev")))));
  const events = await api.select("events", "select=*&order=date");
  const on = d => events.filter(e => e.date === d || (e.yearly && e.date.slice(5) === d.slice(5)));
  const grid = h("div", { style: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px" } },
    DAYS.map(d => h("div.small.faint.center", d.slice(0, 2))),
    [...Array(first.getDay())].map(() => h("div")),
    [...Array(daysIn)].map((_, i) => {
      const d = `${y}-${pad(m)}-${pad(i + 1)}`; const ev = on(d);
      return h("button", { style: { minHeight: "48px", borderRadius: "10px", border: "1px solid " + (d === today ? "var(--brand)" : "var(--line)"), background: ev.length ? "color-mix(in srgb, var(--amber) 12%, var(--card))" : "var(--card)", cursor: "pointer", padding: "4px" },
        onclick: () => ev.length ? sheet(fmtDate(d, { weekday: "long", day: "numeric", month: "long" }), h("div", ev.map(e => evRow(e)))) : addEvent(d) },
        h("div", { style: { fontWeight: d === today ? 700 : 500 } }, i + 1), ev.length ? h("div.small", ev.map(e => ({ birthday: "🎂", meeting: "🤝", countdown: "⏳", other: "📌", class: "🏫" })[e.kind]).join("")) : null);
    }));
  page.append(h("div.card", h("h3", new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })), grid, h("p.hint.mt.mb0", "Tap an empty day to add something.")));
  const up = events.filter(e => e.date >= today || e.yearly).sort((a, b) => nextDate(a, today).localeCompare(nextDate(b, today))).slice(0, 15);
  page.append(h("div.section-title", h("h2", "Coming up")));
  page.append(up.length ? h("div.list", up.map(e => evRow(e, today))) : h("div.card.small.muted", "Nothing yet. Add an extra class, a birthday or a meeting."));
  page.append(h("button.fab", { onclick: () => addEvent(today), "aria-label": "Add event" }, icon("plus")));
}, { tab: "more" });
function nextDate(e, today) {
  if (!e.yearly) return e.date;
  let d = today.slice(0, 4) + e.date.slice(4);
  if (d < today) d = (Number(today.slice(0, 4)) + 1) + e.date.slice(4);
  return d;
}
function evRow(e, today = todayStr()) {
  const d = nextDate(e, today);
  const left = Math.round((new Date(d) - new Date(today)) / 864e5);
  return h("div.li", h("div.ic", { birthday: "🎂", meeting: "🤝", countdown: "⏳", other: "📌", class: "🏫" }[e.kind]),
    h("div.grow", h("b", e.title), h("div.small.muted", fmtDate(d, { day: "numeric", month: "short", year: "numeric" }), e.time ? " · " + fmtHM(e.time.slice(0, 5)) : "", e.yearly ? " · every year" : "")),
    h("span.badge" + (left <= 3 ? ".warn" : ""), left === 0 ? "Today" : left > 0 ? `${left}d` : "Past"),
    h("button.icon-btn", { "aria-label": "Delete", onclick: async ev => { ev.stopPropagation(); if (await confirmBox("Delete?", e.title, "Delete", true)) { await api.remove("events", `id=eq.${e.id}`); if (e.task_id) await api.remove("tasks", `id=eq.${e.task_id}&status=eq.pending`).catch(() => {}); document.querySelector(".backdrop")?.remove(); rerender(); } } }, icon("trash")));
}
async function addEvent(day) {
  const students = await api.select("students", "select=id,name&active=eq.true&order=name").catch(() => []);
  const title = h("input.input", { placeholder: "e.g. Extra class — Physics" });
  let kind = "class";
  const date = h("input.input", { type: "date", value: day < todayStr() ? todayStr() : day });
  const time = h("input.input", { type: "time" });
  const mins = h("select.input", [30, 45, 60, 90, 120, 150, 180].map(m => h("option", { value: m, selected: m === 60 }, durLabel(m))));
  const cats = catNames();
  const cat = h("select.input", cats.map(n => h("option", { value: n, selected: n === "Tuition" }, `${n} · ${catDp(n)} DP/hour`)));
  const stu = h("select.input", h("option", { value: "" }, "— none —"), students.map(x => h("option", { value: x.id }, x.name)));
  const yearly = h("input", { type: "checkbox", checked: false, id: "yr" });
  const classBox = h("div", h("div.grid2", h("label.f", h("span", "Length"), mins), h("label.f", h("span", "Category"), cat)),
    students.length ? h("label.f", h("span", "Student (optional — attendance is added when done)"), stu) : null,
    h("p.hint", "এই ক্লাসটা ওই দিনের টাস্ক হিসেবে Today-তে আসবে — DP আর নোটিফিকেশন সহ।"));
  const yrRow = h("label.check", { for: "yr" }, yearly, h("span", "Repeat every year"));
  const show = () => { classBox.style.display = kind === "class" ? "" : "none"; yrRow.style.display = kind === "class" ? "none" : ""; title.placeholder = { class: "e.g. Extra class — Physics", birthday: "e.g. Ammu's birthday", meeting: "e.g. Club meeting", other: "e.g. Form fill-up" }[kind]; };
  const seg = h("div.seg", [["class", "🏫 Extra class"], ["birthday", "🎂 Birthday"], ["meeting", "🤝 Meeting"], ["other", "📌 Other"]].map(([k, l]) => h("button" + (k === kind ? ".on" : ""), { type: "button", style: { fontSize: "12.5px" }, onclick: e => { kind = k; yearly.checked = k === "birthday"; seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === e.currentTarget)); show(); } }, l)));
  show();
  return sheet("Add to calendar", [h("label.f", h("span", "Type"), seg), h("label.f", h("span", "Title"), title),
    h("div.grid2", h("label.f", h("span", "Date"), date), h("label.f", h("span", "Time"), time)),
    classBox, yrRow], {
    actions: close => { const s = h("button.btn.primary", t("Save")); s.onclick = busy(s, async () => {
      if (!title.value.trim()) throw new Error("Write a title.");
      let task_id = null;
      if (kind === "class") {
        if (!time.value) throw new Error("Pick the start time.");
        if (date.value < todayStr()) throw new Error("Pick today or a later day.");
        const st = new Date(`${date.value}T${time.value}:00+06:00`), en = new Date(st.getTime() + Number(mins.value) * 60000);
        if (st < new Date()) throw new Error("This time has already passed.");
        task_id = await api.rpc("add_task", { p_title: title.value.trim(), p_category: cat.value, p_start: st.toISOString(), p_end: en.toISOString(), p_pinned: false, p_student: stu.value || null });
      }
      await api.insert("events", { user_id: api.userId(), title: title.value.trim(), kind, date: date.value, time: time.value || null, yearly: kind !== "class" && yearly.checked, task_id: typeof task_id === "string" ? task_id : null });
      toast(kind === "class" ? "Extra class added — it will show in Today on that day ✓" : "Saved ✓", "ok"); close(true); rerender(); });
      return [h("button.btn", { onclick: () => close(null) }, t("Cancel")), s]; },
  });
}

// ---------- goals: year → month → week
route("goals", async page => {
  page.append(backbar(t("Goals")));
  const goals = await api.select("goals", "select=*&order=created_at");
  page.append(h("p.hint", "Break a big goal into small steps: a year goal → month goals → week goals."));
  const tree = parent => goals.filter(g => g.parent_id === parent);
  const row = (g, depth) => h("div", h("div.li", { style: { paddingLeft: 14 + depth * 22 + "px" } },
    h("input", { type: "checkbox", checked: g.done, style: { width: "22px", height: "22px", accentColor: "var(--brand)" }, "aria-label": "Done", onchange: async e => { await api.update("goals", `id=eq.${g.id}`, { done: e.target.checked }); } }),
    h("div.grow", h("b", { style: { textDecoration: g.done ? "line-through" : "" } }, g.title), h("div.small.muted", `${g.span} · ${g.period}`)),
    g.span !== "week" ? h("button.btn.small", { onclick: () => addGoal(g) }, icon("plus"), g.span === "year" ? "Month" : "Week") : null,
    h("button.icon-btn", { "aria-label": "Delete", onclick: async () => { if (await confirmBox("Delete goal?", "Smaller goals under it are deleted too.", "Delete", true)) { await api.remove("goals", `id=eq.${g.id}`); rerender(); } } }, icon("trash"))),
    tree(g.id).map(c => row(c, depth + 1)));
  const top = tree(null);
  page.append(top.length ? h("div.list", top.map(g => row(g, 0))) : h("div.card.empty", icon("goal"), h("p", "No goals yet.")));
  page.append(h("button.btn.primary.block", { onclick: () => addGoal(null) }, icon("plus"), "Add a year goal"));
}, { tab: "more" });
function addGoal(parent) {
  const span = parent ? (parent.span === "year" ? "month" : "week") : "year";
  const now = todayStr();
  const wk = (() => { const d = new Date(now); const j = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-W${pad(Math.ceil(((d - j) / 864e5 + j.getDay() + 1) / 7))}`; })();
  const period = h("input.input", { value: span === "year" ? now.slice(0, 4) : span === "month" ? now.slice(0, 7) : wk });
  const title = h("input.input", { placeholder: span === "year" ? "e.g. CGPA 3.75" : span === "month" ? "e.g. Finish Circuit chapter 1–3" : "e.g. Solve 40 problems" });
  sheet(`Add ${span} goal`, [parent ? h("p.hint", "Under: " + parent.title) : null, h("label.f", h("span", "Goal"), title), h("label.f", h("span", span === "year" ? "Year" : span === "month" ? "Month (YYYY-MM)" : "Week"), period)], {
    actions: close => { const s = h("button.btn.primary", t("Save")); s.onclick = busy(s, async () => {
      if (!title.value.trim()) throw new Error("Write the goal.");
      await api.insert("goals", { user_id: api.userId(), title: title.value.trim(), span, parent_id: parent?.id || null, period: period.value }); close(true); rerender(); });
      return [h("button.btn", { onclick: () => close(null) }, t("Cancel")), s]; },
  });
}

// ---------- settings (each section folds open on tap)
function fold(ic, title, sub, body) {
  return h("details.fold", h("summary", h("span.ic", icon(ic)), h("span.grow", h("div", title), sub ? h("div.small.muted", { style: { fontWeight: 400 } }, sub) : null), icon("chev", "chev")), h("div.fold-body", body));
}
route("settings", async (page, open) => {
  page.append(backbar(t("Settings")));
  const p = store.profile;
  const name = h("input.input", { value: p.name });
  const sleep = h("input.input", { type: "time", value: p.sleep_time.slice(0, 5) });
  const sv = h("button.btn.primary.block", t("Save"));
  sv.onclick = busy(sv, async () => { await api.update("profiles", `id=eq.${p.id}`, { name: name.value.trim() || p.name, sleep_time: sleep.value, occupation: occ[0] || null, roles: occ.slice(0, 2), religion: rel }); await loadBasics(); api.LS.del?.("al_tt_tabs"); toast("Profile saved ✓", "ok"); rerender(); });
  let occ = myRoles(p);
  const occBox = occupationPicker(occ, k => occ = k);
  let rel = p.religion || null;
  const relBox = religionPicker(rel, k => rel = k);
  page.append(fold("me", "Profile", p.name + (role() ? " · " + role().label : "") + (RELIGIONS[p.religion] ? " · " + RELIGIONS[p.religion].split(" · ")[0] : ""), [h("label.f", h("span", "Name"), name),
    h("label.f", h("span", "What do you do? (change any time)"), occBox),
    h("label.f", h("span", "Religion (change any time · Muslim → prayer times)"), relBox),
    h("label.f", h("span", "Bedtime (night report comes 30 min before)"), sleep),
    h("p.small.muted", `Phone: ${p.phone} · Email: ${p.email}`), sv]));
  if (open === "profile") { const f = page.querySelector("details.fold"); if (f) { f.open = true; setTimeout(() => f.scrollIntoView({ block: "start", behavior: "smooth" }), 50); } }

  const seg = (opts, cur, on) => { const s = h("div.seg", opts.map(([v, l]) => h("button" + (v === cur ? ".on" : ""), { type: "button", onclick: async e => { s.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === e.target)); await on(v); } }, l))); return s; };
  page.append(fold("sun", "Look", "Theme and language", [
    h("label.f", h("span", "Theme"), seg([["dark", "🌙 Dark"], ["light", "☀️ Light"]], p.theme, async v => { applyTheme(v); await api.update("profiles", `id=eq.${p.id}`, { theme: v }); p.theme = v; })),
    h("label.f.mb0", h("span", "Language"), seg([["en", "English"], ["bn", "বাংলা"]], p.lang, async v => { await api.update("profiles", `id=eq.${p.id}`, { lang: v }); api.LS.set("al_lang", v); p.lang = v; rerender(); }))]));

  const hasPin = await api.rpc("has_pin");
  const pinBtn = h("button.btn.block", icon("shield"), hasPin ? "Change PIN" : "Set PIN");
  pinBtn.onclick = busy(pinBtn, async () => {
    let old = null;
    if (hasPin) { old = await askPin("Enter your current PIN"); if (!old) return; }
    const n1 = await askPin("Choose a new 4-digit PIN"); if (!n1) return;
    const n2 = await askPin("Type the new PIN again"); if (!n2) return;
    if (n1 !== n2) throw new Error("PINs didn't match. Try again.");
    await api.rpc("set_pin", { p_new: n1, p_old: old }); toast("PIN saved ✓", "ok"); rerender();
  });
  const forgotPin = h("button.linkbtn.small", "Forgot PIN?");
  forgotPin.onclick = () => sheet("Forgot PIN", close => codeResetForm("pin", null, () => { close(); rerender(); }));
  page.append(fold("shield", "PIN", hasPin ? "PIN is set" : "Not set yet", [h("p.hint", "Needed to edit money entries, open the full tuition sheet, download a backup and make reports. Adding new money or students never needs it."), pinBtn, hasPin ? h("div.center", forgotPin) : null]));

  // nobody can see anyone else's points or profile, so there is nothing to hide here

  const catName = h("input.input", { placeholder: "e.g. Coding" });
  const catDpIn = h("input.input", { type: "number", min: "1", max: "50", value: store.cfg.custom_category_dp ?? 5, inputmode: "numeric", style: { width: "90px" }, "aria-label": "DP per hour" });
  const why = h("p.small.muted.mb0");
  const aiDp = h("button.btn.small", "🤖 AI suggest");
  aiDp.onclick = busy(aiDp, async () => { if (!catName.value.trim()) throw new Error("Write a name first."); why.textContent = "Thinking…"; const r = await api.ai("dp", { name: catName.value.trim() }); catDpIn.value = r.dp; why.textContent = `AI: ${r.dp} DP/hour — ${r.reason}`; });
  let ccol = PALETTE[4];
  const cbox = colorPicker(ccol, c => ccol = c);
  const addCat = h("button.btn.block", icon("plus"), "Add category");
  addCat.onclick = busy(addCat, async () => { if (!catName.value.trim()) throw new Error("Write a name."); await api.insert("user_categories", { user_id: p.id, name: catName.value.trim(), color: ccol, dp: Math.min(50, Math.max(1, Number(catDpIn.value) || 5)) }); await loadBasics(); toast("Category added ✓", "ok"); rerender(); });
  page.append(fold("flag", "Task categories", `${catNames().length} categories`, [
    h("div.small", catNames().map(n => h("div.row.between", { style: { padding: "5px 0" } }, h("span", h("i", { style: { display: "inline-block", width: "10px", height: "10px", borderRadius: "3px", background: catColor(n), marginRight: "8px" } }), n), h("span.muted", `${catDp(n)} DP/hour`)))),
    h("label.f.mt", h("span", "New category"), catName),
    h("label.f", h("span", "DP per hour (harder work = more DP)"), h("div.row", catDpIn, aiDp)), why, cbox, h("div.mt", addCat)]));

  page.append(...await alertFolds(p));
  const exp = h("button.btn.block", icon("download"), "Download my data (backup)");
  exp.onclick = busy(exp, async () => {
    const { pinGate } = await import("./pin.js"); if (!(await pinGate("backup", "ব্যাকআপ ডাউনলোড করতে PIN দিন"))) return;
    const tables = ["profiles", "tasks", "routines", "dp_ledger", "finance_entries", "finance_history", "budgets", "recurring_costs", "dues", "savings_goals", "students", "attendance", "tuition_payments", "life_logs", "bad_habits", "habit_logs", "events", "goals", "reports"];
    const out = {};
    for (const tb of tables) out[tb] = await api.select(tb, "select=*");
    if (out.profiles?.[0]) delete out.profiles[0].pin_hash;
    const a = h("a", { download: `amar-lifestyle-backup-${todayStr()}.json`, href: URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" })) });
    a.click(); toast("Backup downloaded ✓", "ok");
  });
  page.append(fold("download", "Backup", "Download your data", [h("p.hint", "Your data is backed up on our server every day. You can also keep your own copy."), exp]));
}, { tab: "more" });

// ---------- about us
export function aboutContent() {
  const cred = (ic, txt) => h("div.cred", icon(ic), h("span", txt));
  return h("div.grid-wide",
    h("div.card", { style: { padding: 0, overflow: "hidden" } },
      h("div.founder", h("img", { src: "assets/founder.jpg", alt: "Junayed Abedien Leon", loading: "lazy" })),
      h("div", { style: { padding: "14px" } },
        h("h2", { style: { fontSize: "20px", margin: "0 0 2px" } }, "Junayed Abedien Leon"),
        h("div.muted", "Founder & CEO, My Lifestyle"),
        h("p", { style: { margin: "10px 0" } }, "Building tools that help people stay disciplined and grow every day."),
        cred("student", "Student & Creator"),
        cred("book", "Passionate about self-improvement and technology"))),
    h("div",
      h("div.card",
        h("h3", "Why I built My Lifestyle"),
        h("p", "I believe real discipline comes from planning every day and finishing tasks on time. Keeping a routine even when no one is watching builds strong character."),
        h("p", "I struggled to maintain my own schedule, so I built My Lifestyle to bring everything under one roof — routines, tasks, money tracking and progress."),
        h("p.mb0", "I use it every day myself, and now I'm making it free for everyone. Because whoever leads a disciplined life can achieve whatever they want.")),
      h("div.list",
        h("div.li", h("div.ic", icon("user")), h("div.grow", h("b", "Junayed Abedien Leon"), h("div.small.muted", "Founder of My Lifestyle")))));
}
route("about", page => {
  page.append(h("header.topbar", h("div.row", h("a.icon-btn", { href: api.getSession() ? "#/more" : "#/home", "aria-label": "Back" }, icon("back")), h("h1", t("About Us")))));
  page.append(aboutContent());
}, { public: true });

// ---------- download / install
route("download", async page => {
  page.append(backbar("Get the app"));
  let hasApk = false;
  try { const r = await fetch(api.apkUrl(), { method: "HEAD" }); hasApk = r.ok; } catch {}
  page.append(h("div.card", h("h3", "📱 Add to your phone's home screen"), h("p.hint", "Works on every phone, opens like an app and works offline."),
    h("ol.small", { style: { paddingLeft: "18px", margin: 0 } },
      h("li", h("b", "Android (Chrome): "), "tap ⋮ → “Add to Home screen” / “Install app”."),
      h("li", h("b", "iPhone / iPad (Safari): "), "tap Share ⬆ → “Add to Home Screen”."))));
  page.append(h("div.card", h("h3", "🗂️ Today's tasks — home screen widget"), h("p.hint", "A separate small icon on your home screen that opens straight to today's task list — big, simple, with what's running now and what's next."),
    h("a.btn.primary.block", { href: "tasks/" }, "Open it → then add to Home Screen"),
    h("p.small.muted.mb0", { style: { marginTop: "8px" } }, "Android: long-press the My Lifestyle icon → “Today's tasks” also works.")));
  page.append(h("div.card", h("h3", "🤖 Download for Android"),
    hasApk ? [h("p.hint", "The Android app adds Focus Mode and reminders without internet."), h("a.btn.primary.block", { href: api.apkUrl(), download: "amar-lifestyle.apk" }, icon("download"), "Download APK")]
      : h("p.hint.mb0", "Coming soon. The Android app will add Focus Mode and reminders without internet.")));
}, { tab: "more" });

// ---------- reports
route("reports", async page => {
  page.append(backbar(t("Reports"), "#/more"));
  const list = await api.select("reports", "select=id,title,period_start,period_end,created_at&order=created_at.desc");
  const today = todayStr();
  const thisM = today.slice(0, 7) + "-01";
  const lastM = (() => { const [y, m] = today.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; })();
  const endOf = s => { const [y, m] = s.split("-").map(Number); return `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`; };
  const from = h("input.input", { type: "date", value: thisM }), to = h("input.input", { type: "date", value: today, max: today });
  const quick = h("div.seg", [["This month", thisM, today], ["Last month", lastM, endOf(lastM)]].map(([l, a, b]) => h("button", { type: "button", onclick: e => { from.value = a; to.value = b; quick.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === e.target)); } }, l)));
  const make = h("button.btn.primary.block", icon("report"), "Make report");
  make.onclick = busy(make, async () => {
    const pin = await askPin("Enter your PIN to make a report."); if (!pin) return;
    const title = `Report ${fmtDate(from.value, { day: "numeric", month: "short", year: "numeric" })} – ${fmtDate(to.value, { day: "numeric", month: "short", year: "numeric" })}`;
    const id = await api.rpc("create_report", { p_title: title, p_start: from.value, p_end: to.value, p_pin: pin });
    go(`#/report/${id}`);
  });
  page.append(h("div.card", h("h3", "New report"), h("p.hint", "Includes income, expenses (with every edit shown), tasks and DP. Each report has its own ID and a QR code anyone can scan to check it's real."),
    quick, h("div.grid2.mt", h("label.f", h("span", "From"), from), h("label.f", h("span", "To"), to)), make));
  if (list.length) page.append(h("div.section-title", h("h2", "My reports")), h("div.list", list.map(r => h("a.li", { href: `#/report/${r.id}` }, h("div.ic", icon("report")), h("div.grow", h("b", r.title), h("div.small.muted", "Made " + new Date(r.created_at).toLocaleString("en-GB"))), icon("chev", "chev")))));
}, { tab: "more" });

export function reportView(rep, verifyMode = false) {
  const s = rep.snapshot;
  const verifyUrl = `${api.SITE_URL}#/verify/${rep.id}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(verifyUrl)}`;
  const edited = s.entries.filter(e => e.edits > 0);
  return h("div.report",
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" } },
      h("div", h("img", { src: "assets/logo-light.png", alt: "My Lifestyle", style: { width: "190px" } }),
        h("div", { style: { fontSize: "18px", fontWeight: 700, marginTop: "10px" } }, rep.title),
        h("div", { style: { color: "#555" } }, `Name: ${s.name}`),
        h("div", { style: { color: "#555" } }, `Report ID: ${rep.id}`),
        h("div", { style: { color: "#555" } }, `Generated: ${new Date(rep.created_at).toLocaleString("en-GB")}`)),
      h("div", { style: { textAlign: "center" } }, h("img", { src: qr, alt: "QR code to verify this report", width: 120, height: 120 }), h("div", { style: { fontSize: "10px", color: "#555", marginTop: "4px" } }, "Scan to verify"))),
    verifyMode ? h("div", { style: { margin: "14px 0", padding: "10px", background: "#ECFDF5", border: "1px solid #10B981", borderRadius: "8px", color: "#065F46", fontWeight: 600 } }, "✓ Verified: this report matches the original saved in My Lifestyle.") : null,
    h("table", h("tbody",
      h("tr", h("th", "Total income"), h("td", tk(s.income)), h("th", "Total expense"), h("td", tk(s.expense))),
      h("tr", h("th", "Saved"), h("td", tk(s.income - s.expense)), h("th", "Edited entries"), h("td", String(edited.length))),
      h("tr", h("th", "Tasks done"), h("td", `${s.tasks_done} / ${s.tasks_total}`), h("th", "DP earned"), h("td", String(s.dp))))),
    h("div", { style: { fontWeight: 700, marginTop: "14px" } }, "Money entries"),
    h("table", h("thead", h("tr", h("th", "Date"), h("th", "Type"), h("th", "Category / note"), h("th", { style: { textAlign: "right" } }, "Amount"))),
      h("tbody", s.entries.length ? s.entries.map(e => h("tr",
        h("td", fmtDate(e.date, { day: "numeric", month: "short" })), h("td", e.kind === "income" ? "Income" : "Expense"),
        h("td", e.category, e.note ? ` — ${e.note}` : "",
          e.edits > 0 ? h("div.edited", `${e.admin_edited ? "Special edit (approved by Admin)" : "Edited"}: originally ${tk(e.original)}, ${e.edits} edit${e.edits > 1 ? "s" : ""}${e.last_edit ? ", last on " + new Date(e.last_edit).toLocaleDateString("en-GB") : ""}`) : null),
        h("td", { style: { textAlign: "right", whiteSpace: "nowrap" } }, (e.kind === "income" ? "+" : "−") + tk(e.amount), e.edits > 0 ? " *" : ""))) : h("tr", h("td", { colspan: "4" }, "No entries in this period.")))),
    edited.length ? h("div", { style: { fontSize: "11px", color: "#555" } }, "* Edited after it was first entered. Full edit history is kept in My Lifestyle and cannot be changed.") : null,
    Object.keys(s.hours || {}).length ? [h("div", { style: { fontWeight: 700, marginTop: "14px" } }, "Time spent (completed tasks)"),
      h("table", h("tbody", Object.entries(s.hours).map(([c, v]) => h("tr", h("td", c), h("td", { style: { textAlign: "right" } }, v + " hours")))))] : null,
    h("div.sig",
      h("div", h("div.name", "Junayed Abedien Leon"), h("div", { style: { borderTop: "1px solid #999", paddingTop: "4px", fontWeight: 600 } }, "Junayed Abedien Leon"), h("div", "CEO, My Lifestyle"),
        h("div", { style: { fontSize: "10.5px", color: "#555", marginTop: "4px", maxWidth: "320px" } }, "This is a digitally generated document and does not require a handwritten signature.")),
      h("div", { style: { fontSize: "10.5px", color: "#555", textAlign: "right" } }, "Verify at:", h("br"), verifyUrl)));
}

route("report", async (page, id) => {
  page.append(backbar("Report", "#/reports", h("button.btn.small.primary.noprint", { onclick: () => window.print() }, icon("download"), "Save PDF")));
  const rows = await api.select("reports", `select=*&id=eq.${id}`);
  if (!rows.length) throw new Error("Report not found.");
  page.append(h("p.hint.noprint", "Tap “Save PDF”, then choose “Save as PDF” in the print screen."), reportView(rows[0]));
}, { tab: "more" });

route("verify", async (page, id) => {
  page.append(h("header.topbar.noprint", h("div.brandmark", (() => { const i = new Image(); i.src = "assets/icon-64.png"; i.width = 30; i.style.borderRadius = "8px"; i.alt = ""; return i; })(), h("span", "Amar ", h("b", "Lifestyle"))), h("span.small.muted", "Report check")));
  let rep = null;
  try {
    const r = await fetch(`${api.SB_URL}/rest/v1/rpc/verify_report`, { method: "POST", headers: { apikey: api.SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: id }) });
    rep = r.ok ? await r.json() : null;
  } catch {}
  if (!rep) { page.append(h("div.card", { style: { borderColor: "var(--red)" } }, h("h2.bad", "✗ Not found"), h("p", "No report with this ID exists in My Lifestyle. The document may be fake or the link may be wrong."))); return; }
  page.append(h("p.hint.noprint", "Compare these numbers with the paper or PDF you have. If anything differs, the document was changed."), reportView(rep, true));
}, { public: true });

// phone notifications + Telegram — used in Settings and on the Notifications page
async function alertFolds(p) {
  // phone notifications
  const nt = { tasks: true, unlock: true, events: true, night: true, ...(p.notify || {}) };
  const pst = await api.pushState().catch(() => "unsupported");
  const nBody = [];
  if (pst === "on") {
    const test = h("button.btn.small", "Send a test");
    test.onclick = busy(test, async () => { const n = await api.pushTest(); toast(n ? "Test sent — check your notifications ✓" : "No phone found. Turn notifications off and on again.", n ? "ok" : "bad"); });
    const off = h("button.btn.small.danger", "Turn off on this phone");
    off.onclick = busy(off, async () => { await api.disablePush(); toast("Notifications off on this phone"); rerender(); });
    const nl = { tasks: "30 & 15 min before each task, at start, and every 30 min during study", unlock: "When Completed can be marked", events: "Meetings and birthdays", night: "Night report (30 min before bedtime)" };
    nBody.push(h("p.hint", "✅ On for this phone. They come even when the app is closed (internet needed)."),
      Object.entries(nl).map(([k, l]) => h("label.check", { style: { justifyContent: "space-between", alignItems: "center" } }, h("span", l),
        h("input", { type: "checkbox", checked: !!nt[k], onchange: async e => { nt[k] = e.target.checked; await api.update("profiles", `id=eq.${p.id}`, { notify: nt }); p.notify = nt; } }))),
      h("div.row", { style: { gap: "8px" } }, test, off));
  } else {
    const on = h("button.btn.primary.block", icon("bell"), "Turn on notifications");
    on.onclick = busy(on, async () => { await api.enablePush(); toast("Notifications on ✓", "ok"); await api.pushTest().catch(() => {}); rerender(); });
    nBody.push(h("p.hint", pst === "blocked" ? "Notifications are blocked for this site. Allow them in your browser's site settings, then tap below."
      : pst === "unsupported" ? "On iPhone/iPad: first add the app to the Home Screen (Share → Add to Home Screen), open it from there, then tap below."
      : "Reminders for tasks, tuition, meetings, birthdays and your night report — even when the app is closed."), on);
  }
  const f1 = fold("bell", "Notifications", pst === "on" ? "On" : "Off", nBody);

  // Telegram: only for password reset
  const hasTg = await api.rpc("has_telegram").catch(() => false);
  const tgBody = [];
  if (hasTg) {
    const off = h("button.btn.block.danger", "Disconnect Telegram");
    off.onclick = busy(off, async () => { await api.rpc("telegram_unlink"); toast("Disconnected"); rerender(); });
    const tgOn = { ...(p.notify || {}) }.tg !== false;
    tgBody.push(h("p.hint", "✅ Connected. Reset codes come here, and important reminders (15 min before, at start, exams, night report) also come with Telegram's sound."),
      h("label.check", { style: { justifyContent: "space-between", alignItems: "center" } }, h("span", "Send reminders to Telegram"),
        h("input", { type: "checkbox", checked: tgOn, onchange: async e => { const nt = { ...(p.notify || {}), tg: e.target.checked }; await api.update("profiles", `id=eq.${p.id}`, { notify: nt }); p.notify = nt; } })), off);
  } else {
    const con = h("button.btn.primary.block", "Connect Telegram");
    con.onclick = busy(con, async () => {
      const code = await api.rpc("telegram_link_code");
      window.open(`https://t.me/${api.TG_BOT}?start=${code}`, "_blank");
      toast("Tap START in Telegram, then come back here.", "ok");
    });
    tgBody.push(h("p.hint", "Forgot your password or PIN? Get a code here. Important reminders also come to Telegram with its own sound."), con,
      h("button.linkbtn.small", { onclick: () => rerender() }, "I've pressed START — refresh"));
  }
  const f2 = fold("lock", "Telegram", hasTg ? "Connected" : "Not connected", tgBody);
  return [f1, f2];

}

// ---------- Notifications page: turn on, Telegram, and the latest important notifications
route("notifications", async page => {
  page.append(topbar("Alerts", "Notifications · Telegram · Home Screen"));
  const { isStandalone, installBody } = await import("./install.js");
  if (!isStandalone()) { const f = fold("download", "Home Screen", "Not added yet", installBody()); f.open = true; page.append(f); }
  const folds = await alertFolds(store.profile);
  folds.forEach(f => { if (/Off|Not connected/.test(f.textContent.slice(0, 80))) f.open = true; });
  page.append(...folds);
  const list = await api.select("inbox", "select=id,title,body,url,level,created_at,read&order=created_at.desc&limit=60").catch(() => []);
  page.append(h("div.section-title", h("h2", "Recent")));
  if (!list.length) { page.append(h("div.card.empty", h("p", "No notifications yet. Turn them on above."))); return; }
  page.append(h("div.list", list.map(n => h("a.li", { href: n.url || "#/today", style: { alignItems: "flex-start", opacity: n.read ? .7 : 1 } },
    h("div.ic", n.level === "urgent" ? "🚨" : "🔔"),
    h("div.grow", h("b", n.title), n.body ? h("div.small.muted", n.body) : null, h("div.small.faint", new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }))),
    n.read ? null : h("span.badge.warn", "New")))));
  const unread = list.filter(n => !n.read).map(n => n.id);
  if (unread.length) api.update("inbox", `id=in.(${unread.join(",")})`, { read: true }).then(() => setUnread(0)).catch(() => {});
}, { tab: "alerts" });
