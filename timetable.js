// My Lifestyle — timetables under Routine: University classes, Coaching classes, Meal plan.
// These only show the day's plan (no DP). Meals also remind you on the Today page.
import * as api from "./api.js";
import { h, icon, toast, sheet, busy, confirmBox, todayStr, fmtHM, dhakaNow, pickPhoto } from "./ui.js";
import { route, store, rerender, backbar } from "./app.js";
import { shrink } from "./assistant.js";
import { isMuslim } from "./prayer.js";
import { deadlines } from "./exams.js";

export const KINDS = {
  university: { label: "University", icon: "🎓", hint: "Your university class timetable. Tap a day to see its classes. They also show in Today (no DP) — tap ✕ there on a day you don't go." },
  coaching: { label: "Coaching", icon: "🏫", hint: "Your coaching / private batch classes." },
  meal: { label: "Meals", icon: "🍽️", hint: "Your own meal times. The Today page reminds you a little before each one." },
  custom: { label: "My tab", icon: "📌", hint: "Your own timetable." },
};
// the extra tabs this person has added under Routine (Weekly is always first)
let TABS = api.LS.get("al_tt_tabs") || [];
export async function loadTabs() {
  try { TABS = await api.select("timetable_tabs", "select=*&order=created_at"); api.LS.set("al_tt_tabs", TABS); } catch { /* offline: keep last */ }
  return TABS;
}
export const hasTab = kind => TABS.some(t => t.kind === kind);
export const visibleKinds = () => [...new Set(TABS.map(t => t.kind))];
const tabKey = t => t.kind === "custom" ? t.id : t.kind;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Sat first, like Bangladesh
const hm = t => (t || "").slice(0, 5);
const range = it => it.start_time ? `${fmtHM(hm(it.start_time))}${it.end_time ? " – " + fmtHM(hm(it.end_time)) : ""}` : "";

// examples shown when a tab is empty (anyone can start from these and change them)
const DEMO = {
  university: [
    { days: [6], start_time: "09:45", end_time: "11:30", title: "PHY 101", detail: "Room 2002 · Teacher" },
    { days: [6], start_time: "11:30", end_time: "13:15", title: "MATH 101", detail: "Room 4002" },
    { days: [0], start_time: "08:00", end_time: "09:45", title: "CSE 101", detail: "Room 5002" },
    { days: [1], start_time: "14:00", end_time: "15:45", title: "CSE 102 (lab)", detail: "LAB-4701" },
  ],
  coaching: [
    { days: [6, 3], start_time: "16:00", end_time: "17:00", title: "Physics", detail: "Batch / teacher" },
    { days: [6, 3], start_time: "17:00", end_time: "18:00", title: "Chemistry", detail: "" },
    { days: [1, 4], start_time: "16:00", end_time: "17:00", title: "Higher Math", detail: "" },
  ],
  meal: [
    { days: [], start_time: "08:00", end_time: "08:30", title: "Breakfast", detail: "Write what you plan to eat" },
    { days: [], start_time: "13:00", end_time: "14:00", title: "Lunch", detail: "" },
    { days: [], start_time: "17:00", end_time: "17:30", title: "Snack", detail: "" },
    { days: [], start_time: "20:30", end_time: "21:00", title: "Dinner", detail: "" },
    { days: [], start_time: null, end_time: null, title: "Keep with you", detail: "Water bottle · fruit" },
  ],
};

// tab bar shown on top of Routine (Weekly) and every timetable tab
export async function routineTabsAsync(active) { await loadTabs(); return routineTabs(active); }
export function routineTabs(active) {
  const tabs = [["week", "📅 Weekly", "#/week"], ["exams", deadlines().tab, "#/exams"], ...(isMuslim() ? [["prayer", "🕌 Prayer", "#/prayer"]] : []), ...TABS.map(t => [tabKey(t), `${t.icon} ${t.name}`, `#/schedule/${tabKey(t)}`])];
  return h("div.seg", { style: { marginBottom: "12px", overflowX: "auto" } },
    tabs.map(([k, l, href]) => h("button" + (k === active ? ".on" : ""), { onclick: () => { location.hash = href; }, style: { whiteSpace: "nowrap" } }, l)),
    h("button", { onclick: addTabSheet, style: { whiteSpace: "nowrap" }, "aria-label": "Add a tab" }, "＋"));
}
function addTabSheet() {
  const name = h("input.input", { placeholder: "e.g. Gym plan · Exam routine" });
  const pick = async (kind, nm, ic) => {
    const r = await api.insert("timetable_tabs", { user_id: api.userId(), kind, name: nm, icon: ic, merge: kind === "university" ? "today" : "none" });
    const row = (Array.isArray(r) ? r[0] : r) || {};
    await loadTabs(); location.hash = `#/schedule/${kind === "custom" ? row.id || "" : kind}`;
    if (kind !== "meal" && row.id) setTimeout(() => mergeSheet(TABS.find(t => t.id === row.id) || row, rerender), 400);
  };
  const opt = (kind, nm, ic, sub) => {
    if (kind !== "custom" && hasTab(kind)) return null;
    const b = h("button.li", { style: { textAlign: "left" } }, h("div.ic", ic), h("div.grow", h("b", nm), h("div.small.muted", sub)));
    b.onclick = busy(b, async () => { await pick(kind, nm, ic); document.querySelector(".backdrop")?.click(); });
    return b;
  };
  sheet("Add a tab to Routine", [
    h("p.hint", "📷 টিপ: রুটিনের ছবি তুলে AI-কে দিলে AI নিজেই পুরো রুটিন বানিয়ে দেবে — ট্যাব খুলে “From a photo (AI)” চাপুন।"),
    h("div.list", opt("university", "University", "🎓", "Class timetable — also shows in Today (no DP)"), opt("coaching", "Coaching", "🏫", "Coaching / batch classes"), opt("meal", "Meals", "🍽️", "Meal times with a reminder on Today")),
    h("label.f.mt", h("span", "Or your own tab"), name),
  ], {
    actions: close => {
      const add = h("button.btn.primary", "Add my tab");
      add.onclick = busy(add, async () => { if (!name.value.trim()) throw new Error("Write a name."); await pick("custom", name.value.trim(), "📌"); close(true); });
      return [h("button.btn", { onclick: () => close(null) }, "Cancel"), add];
    },
  });
}

const onDay = (it, dow) => !it.days?.length || it.days.includes(dow);

// keep the weekly routine in step with tabs set to "Weekly" (today's tasks are never touched)
export async function syncWeekly() {
  try {
    const old = await api.rpc("sync_timetable_routines");
    if (Array.isArray(old) && old.length) {
      await api.remove("tasks", `routine_id=in.(${old.join(",")})&status=eq.pending&day=gt.${todayStr()}`);
      const tm = new Date(todayStr() + "T00:00:00Z"); tm.setUTCDate(tm.getUTCDate() + 1);
      const from = tm.toISOString().slice(0, 10); tm.setUTCDate(tm.getUTCDate() + 7);
      await api.rpc("ensure_tasks", { p_from: from, p_to: tm.toISOString().slice(0, 10) });
      toast("Weekly routine updated from your timetable ✓", "ok");
    }
  } catch (e) { toast("Couldn't update the weekly routine: " + e.message, "bad"); }
}
const MERGE = [["weekly", "📅 Weekly-তে যোগ", "এই ক্লাসগুলো আপনার সাপ্তাহিক রুটিনের টাস্ক হবে (DP সহ)"], ["today", "🗓️ শুধু Today-তে", "প্রতিদিন Today তালিকায় দেখাবে, DP ছাড়া, যেকোনো দিন বাদ দেওয়া যাবে"], ["none", "📁 আলাদা থাকুক", "শুধু এই ট্যাবেই থাকবে"]];
// ask how this tab should join the daily plan
function mergeSheet(tab, after) {
  sheet(`“${tab.name}” — রুটিনের সাথে মেলাবেন?`, [h("p.hint", "এই ট্যাবের ক্লাসগুলো কি আপনার সাপ্তাহিক রুটিনে যোগ হবে? পরে এই ট্যাব থেকেই বদলানো যাবে।"),
    h("div.list", MERGE.map(([k, l, sub]) => { const b = h("button.li", { style: { textAlign: "left" } }, h("div.grow", h("b", l, tab.merge === k ? " ✓" : ""), h("div.small.muted", sub)));
      b.onclick = busy(b, async () => { await api.update("timetable_tabs", `id=eq.${tab.id}`, { merge: k }); tab.merge = k; await loadTabs(); await syncWeekly(); document.querySelector(".backdrop")?.click(); after?.(); });
      return b; }))], { actions: close => [h("button.btn", { onclick: () => close(null) }, "Later")] });
}

route("schedule", async (page, key = "university", dayArg) => {
  await loadTabs();
  const tab = TABS.find(t => tabKey(t) === key) || (KINDS[key] && key !== "custom" ? { kind: key, name: KINDS[key].label, icon: KINDS[key].icon, virtual: true } : null);
  page.append(backbar("Routine", "#/week"), routineTabs(key));
  if (!tab) { page.append(h("div.card.empty", h("p", "This tab was removed."))); return; }
  const kind = tab.kind, K = KINDS[kind];
  const items = await api.select("timetable_items", `select=*&kind=eq.${kind}${kind === "custom" ? `&tab_id=eq.${tab.id}` : ""}&order=start_time.nullslast,title`);
  const todayDow = dhakaNow().getDay();
  const dow = dayArg !== undefined && dayArg !== "" ? Number(dayArg) : todayDow;
  page.append(h("p.hint", K.hint));
  const tools = h("div.row.wrap", { style: { gap: "8px", marginBottom: "10px" } },
    h("button.btn.small", { onclick: () => photoImport(tab) }, "📷 From a photo (AI)"),
    h("button.btn.small.primary", { onclick: () => itemSheet(tab, null, kind === "meal" ? [] : [dow]) }, icon("plus"), "Add"));
  page.append(tools);
  if (kind !== "meal" && !tab.virtual) {
    const cur = MERGE.find(m => m[0] === (tab.merge || "none"));
    page.append(h("button.card.small", { onclick: () => mergeSheet(tab, rerender), style: { width: "100%", textAlign: "left", cursor: "pointer", padding: "8px 12px" } },
      "রুটিনের সাথে: ", h("b", cur[1]), h("span.muted", " — ", cur[2], " · বদলাতে চাপুন")));
  }
  const removeTab = h("button.linkbtn.small", { style: { color: "var(--red)", marginTop: "16px" } }, "Remove this tab");
  removeTab.onclick = async () => {
    if (tab.virtual) return;
    if (!(await confirmBox(`Remove “${tab.name}” tab?`, kind === "custom" ? "Everything in this tab is deleted." : "The tab is hidden. Its items stay saved and come back if you add the tab again.", "Remove", true))) return;
    try { await api.remove("timetable_tabs", `id=eq.${tab.id}`); await loadTabs(); await syncWeekly(); location.hash = "#/week"; } catch (e) { toast(e.message, "bad"); }
  };
  setTimeout(() => page.append(h("div.center", removeTab)), 0);

  if (!items.length) {
    const demo = DEMO[kind] || DEMO.coaching;
    page.append(h("div.card", { style: { opacity: .75, borderStyle: "dashed" } },
      h("b", "Example — you can make yours like this:"),
      h("div.list.mt", demo.map(d => h("div.li", h("div.grow", h("b", d.title), h("div.small.muted", [d.days.length ? d.days.map(x => DAYS[x]).join(", ") : (d.start_time ? "Every day" : "Note"), range(d), d.detail].filter(Boolean).join(" · ")))))),
      h("div.row.mt", { style: { gap: "8px" } },
        (() => { const b = h("button.btn.small", "Use this example"); b.onclick = busy(b, async () => { await api.insert("timetable_items", demo.map(d => ({ ...d, kind, tab_id: kind === "custom" ? tab.id : null, user_id: api.userId() }))); if (tab.merge === "weekly") await syncWeekly(); toast("Example added — tap any item to change it ✓", "ok"); rerender(); }); return b; })())));
    return;
  }

  if (kind !== "meal") {
    // day chips (Sat → Fri), today marked
    page.append(h("div.row", { style: { gap: "6px", overflowX: "auto", marginBottom: "10px", paddingBottom: "2px" } }, ORDER.map(d => {
      const n = items.filter(it => onDay(it, d) && it.start_time).length;
      return h("a.btn.small" + (d === dow ? ".primary" : ""), { href: `#/schedule/${key}/${d}`, style: { flexShrink: 0, minWidth: "54px", position: "relative" } },
        DAYS[d], d === todayDow ? " •" : "", n ? h("span.small", { style: { opacity: .7, marginLeft: "3px" } }, n) : null);
    })));
  }
  const list = items.filter(it => it.start_time && (kind === "meal" || onDay(it, dow)));
  const nowMin = (() => { const n = dhakaNow(); return n.getHours() * 60 + n.getMinutes(); })();
  const mins = t => { const [a, b] = hm(t).split(":").map(Number); return a * 60 + b; };
  const live = it => dow === todayDow && it.start_time && mins(it.start_time) <= nowMin && nowMin < mins(it.end_time || it.start_time) + (it.end_time ? 0 : 30);
  const nextIt = dow === todayDow ? list.find(it => mins(it.start_time) > nowMin) : null;
  page.append(h("h3", { style: { margin: "4px 2px 8px" } }, kind === "meal" ? "Every day" : (dow === todayDow ? "Today · " : "") + ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow]));
  if (!list.length) page.append(h("div.card.empty", h("p", kind === "meal" ? "No meal times yet." : "No classes this day 🎉")));
  else page.append(h("div.list", list.map(it => h("button.li", { onclick: () => itemSheet(tab, it), style: { alignItems: "flex-start", textAlign: "left", ...(live(it) ? { borderColor: "var(--brand)", background: "color-mix(in srgb, var(--brand) 10%, var(--card))" } : {}) } },
    h("div", { style: { minWidth: "92px", fontWeight: 700, fontSize: "13px", color: live(it) ? "var(--brand)" : "var(--muted)" } }, fmtHM(hm(it.start_time)), it.end_time ? h("div.small.faint", "– " + fmtHM(hm(it.end_time))) : null),
    h("div.grow", h("b", it.title, live(it) ? h("span.badge.ok", { style: { marginLeft: "6px" } }, "Now") : it === nextIt ? h("span.badge", { style: { marginLeft: "6px" } }, "Next") : null),
      it.detail ? h("div.small.muted", it.detail) : null)))));
  const notes = items.filter(it => !it.start_time);
  notes.forEach(n => page.append(h("button.card", { onclick: () => itemSheet(tab, n), style: { width: "100%", textAlign: "left", marginTop: "10px", cursor: "pointer" } }, h("b", n.title), h("div.small.muted", { style: { marginTop: "4px" } }, n.detail || ""))));
}, { tab: "week" });

function itemSheet(tab, it, presetDays = []) {
  const kind = tab.kind;
  const title = h("input.input", { value: it?.title || "", placeholder: kind === "meal" ? "e.g. Breakfast" : "e.g. PHY 105" });
  const detail = h("textarea.input", { placeholder: kind === "meal" ? "e.g. 2 Eggs · 2 Roti · 1 Banana" : "e.g. Room 5002 · Teacher", style: { minHeight: "60px" } }, it?.detail || "");
  const start = h("input.input", { type: "time", value: hm(it?.start_time) });
  const end = h("input.input", { type: "time", value: hm(it?.end_time) });
  let days = [...(it?.days || presetDays)];
  const dayBox = h("div.row.wrap", { style: { gap: "6px" } });
  const drawDays = () => dayBox.replaceChildren(...ORDER.map(d => h("button.btn.small" + (days.includes(d) ? ".primary" : ""), { type: "button", onclick: () => { days = days.includes(d) ? days.filter(x => x !== d) : [...days, d]; drawDays(); } }, DAYS[d])));
  drawDays();
  const weekly = tab.merge === "weekly";
  const mine = h("input", { type: "checkbox", id: "ttmine", checked: it ? it.mine !== false : true });
  const code = h("input.input", { value: it?.code || "", placeholder: "e.g. CCP (optional)", maxlength: "20" });
  sheet(it ? "Edit" : `Add to ${tab.name}`, [
    h("label.f", h("span", kind === "meal" ? "Meal / note" : "Class"), title),
    h("div.grid2", h("label.f", h("span", "Start"), start), h("label.f", h("span", "End"), end)),
    h("label.f", h("span", kind === "meal" ? "Days (none = every day)" : "Days"), dayBox),
    h("label.f", h("span", kind === "meal" ? "What to eat / notes" : "Room, teacher, notes"), detail),
    kind === "meal" ? h("p.hint", "Leave the time empty to make a note (like “Keep with you”).") : null,
    weekly ? h("label.check", { for: "ttmine" }, mine, h("span", "My class — put it in my weekly routine")) : null,
    weekly ? h("label.f", h("span", "Name in the weekly routine (short code)"), code) : null,
  ], {
    actions: close => {
      const save = h("button.btn.primary", "Save");
      save.onclick = busy(save, async () => {
        if (!title.value.trim()) throw new Error("Write a name.");
        if (kind !== "meal" && !days.length) throw new Error("Pick at least one day.");
        const row = { title: title.value.trim(), detail: detail.value.trim() || null, start_time: start.value || null, end_time: end.value || null, days };
        if (weekly) { row.mine = mine.checked; row.code = code.value.trim() || null; }
        if (it) await api.update("timetable_items", `id=eq.${it.id}`, row); else await api.insert("timetable_items", { ...row, kind, tab_id: kind === "custom" ? tab.id : null, user_id: api.userId() });
        if (weekly) await syncWeekly();
        close(true); rerender();
      });
      const out = [h("button.btn", { onclick: () => close(null) }, "Cancel"), save];
      if (it) {
        const del = h("button.btn.danger", { "aria-label": "Delete" }, icon("trash"));
        del.onclick = busy(del, async () => { if (!(await confirmBox("Delete this?", it.title, "Delete", true))) return; await api.remove("timetable_items", `id=eq.${it.id}`); if (weekly) await syncWeekly(); close(true); rerender(); });
        out.unshift(del);
      }
      return out;
    },
  });
}

// photo of a timetable → AI reads it → you tick what to keep
function photoImport(tab) {
  const kind = tab.kind;
  pickPhoto("রুটিনের ছবি দিন").then(async f => {
    if (!f) return;
    const out = h("div", h("p.small.muted", "🤖 Reading the photo…"));
    let items = [];
    const s = sheet("📷 From a photo", [h("p.hint", "AI reads the photo. Check, untick what you don't want, then save."), out], {
      actions: close => {
        const save = h("button.btn.primary", { disabled: true, id: "ttsave" }, "Save selected");
        save.onclick = busy(save, async () => {
          const rows = items.filter(x => x.on).map(x => ({ kind, tab_id: kind === "custom" ? tab.id : null, user_id: api.userId(), title: x.title, detail: x.detail || null, start_time: /^\d{2}:\d{2}$/.test(x.start || "") ? x.start : null, end_time: /^\d{2}:\d{2}$/.test(x.end || "") ? x.end : null, days: (x.days || []).map(d => DAYS.indexOf(String(d).slice(0, 3))).filter(d => d >= 0) }));
          if (!rows.length) throw new Error("Tick at least one.");
          await api.insert("timetable_items", rows); if (tab.merge === "weekly") await syncWeekly(); toast(`Saved ${rows.length} ✓`, "ok"); close(true); rerender();
        });
        return [h("button.btn", { onclick: () => close(null) }, "Cancel"), save];
      },
    });
    try {
      const img = await shrink(f);
      const r = await api.ai("timetable", { kind: kind === "custom" ? "coaching" : kind, image: { mime: img.mime, data: img.data } });
      items = (r.items || []).filter(x => x.title).map(x => ({ ...x, on: true }));
      if (!items.length) { out.replaceChildren(h("p.small.bad", "Couldn't read a timetable from this photo. Try a clearer photo.")); return; }
      if (r.question) out.append(h("p.small.warn", r.question));
      out.replaceChildren(h("div.list", items.map(x => h("label.li", { style: { alignItems: "flex-start" } },
        h("input", { type: "checkbox", checked: true, style: { width: "20px", height: "20px", accentColor: "var(--brand)", flexShrink: 0 }, onchange: e => x.on = e.target.checked }),
        h("div.grow", h("b", x.title), h("div.small.muted", [(x.days || []).length ? x.days.join(", ") : (x.start ? "Every day" : "Note"), x.start ? fmtHM(x.start) + (x.end ? " – " + fmtHM(x.end) : "") : "", x.detail].filter(Boolean).join(" · ")))))));
      document.getElementById("ttsave")?.removeAttribute("disabled");
    } catch (e) { out.replaceChildren(h("p.small.bad", e.message)); }
    void s;
  });
}

// Today page: meal reminder from 30 minutes before until the meal ends
export async function mealNow(data = false) {
  await loadTabs();
  if (!hasTab("meal")) return null;
  const items = await api.select("timetable_items", "select=*&kind=eq.meal&start_time=not.is.null&order=start_time");
  const n = dhakaNow(), now = n.getHours() * 60 + n.getMinutes(), dow = n.getDay();
  const m = t => { const [a, b] = hm(t).split(":").map(Number); return a * 60 + b; };
  const it = items.find(x => onDay(x, dow) && now >= m(x.start_time) - 30 && now <= m(x.end_time || x.start_time) + (x.end_time ? 0 : 20));
  if (!it) return null;
  const soon = now < m(it.start_time);
  if (data) return { title: it.title, when: soon ? `in ${m(it.start_time) - now} min` : "now" };
  return h("a.card", { href: "#/schedule/meal", style: { display: "block", color: "inherit", borderColor: "color-mix(in srgb, var(--amber) 55%, transparent)", background: "linear-gradient(160deg, color-mix(in srgb, var(--amber) 10%, var(--card)), var(--card))" } },
    h("div.row.between", h("b", "🍽️ ", it.title), h("span.small", { style: { color: "var(--amber)" } }, soon ? `in ${m(it.start_time) - now} min` : "now")),
    h("div.small.muted", range(it)), it.detail ? h("div", { style: { marginTop: "4px" } }, it.detail) : null);
}

// ---------- university classes in the daily routine (no DP, no penalty; remove any day)
const CLASS_COLOR = "#60A5FA";
export async function classesBetween(from, to) {
  await loadTabs();
  const todayTabs = TABS.filter(t => t.merge === "today");
  if (!todayTabs.length) return [];
  const [items, skips] = await Promise.all([
    api.select("timetable_items", "select=*&start_time=not.is.null"),
    api.select("timetable_skips", `select=item_id,day&day=gte.${from}&day=lte.${to}`),
  ]);
  const inTab = it => todayTabs.some(t => t.kind === it.kind && (it.kind !== "custom" || t.id === it.tab_id));
  const out = [];
  for (let d = from; d <= to; d = addDay(d)) {
    const dow = new Date(d + "T00:00:00").getDay();
    items.filter(it => it.start_time && it.kind !== "meal" && inTab(it) && onDay(it, dow) && !skips.some(k => k.item_id === it.id && k.day === d)).forEach(it => {
      const s = new Date(`${d}T${hm(it.start_time)}:00+06:00`), e = it.end_time ? new Date(`${d}T${hm(it.end_time)}:00+06:00`) : new Date(s.getTime() + 3600e3);
      const ic = KINDS[it.kind]?.icon || "📌";
      out.push({ id: `cls:${it.id}:${d}`, isClass: true, item: it, day: d, title: ic + " " + it.title, category: "Class", start_at: s.toISOString(), end_at: e.toISOString(), status: "class", color: CLASS_COLOR, detail: it.detail });
    });
  }
  return out;
}
const addDay = d => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
export function classSheet(c) {
  sheet("🎓 " + c.item.title, [h("p.mb0", fmtHM(hm(c.item.start_time)), c.item.end_time ? " – " + fmtHM(hm(c.item.end_time)) : "", " · ", new Date(c.day + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })),
    c.detail ? h("p.small.muted", c.detail) : null, h("p.hint", "Class from your timetable. No DP, nothing is cut if you skip it.")], {
    actions: close => {
      const rm = h("button.btn.danger", icon("trash"), "Not going — remove for this day");
      rm.onclick = busy(rm, async () => { await api.insert("timetable_skips", { user_id: api.userId(), item_id: c.item.id, day: c.day }); toast("Removed for this day ✓", "ok"); close(true); rerender(); });
      return [h("a.btn", { href: "#/schedule/university", onclick: () => close(null) }, "Timetable"), rm];
    },
  });
}
// a simple card for the Today list
export function classCard(c) {
  const x = h("button.icon-btn", { "aria-label": "Not going today", title: "Not going today", style: { width: "34px", height: "34px" } }, icon("x"));
  x.onclick = busy(x, async e => { e?.stopPropagation?.(); await api.insert("timetable_skips", { user_id: api.userId(), item_id: c.item.id, day: c.day }); toast("Removed for today ✓", "ok"); rerender(); });
  const now = Date.now(), live = now >= new Date(c.start_at) && now < new Date(c.end_at);
  return h("div.task", { style: { "--c": CLASS_COLOR, cursor: "pointer" }, onclick: e => { if (!x.contains(e.target)) classSheet(c); } },
    h("div.row.between", { style: { alignItems: "flex-start", gap: "8px" } },
      h("div.grow", h("b", "🎓 ", c.item.title, live ? h("span.badge.ok", { style: { marginLeft: "6px" } }, "Now") : null),
        h("div.small.muted", `${fmtHM(hm(c.item.start_time))}${c.item.end_time ? " – " + fmtHM(hm(c.item.end_time)) : ""} · Class (no DP)${c.detail ? " · " + c.detail : ""}`),
        h("div.small.faint", "No DP · tap ✕ if you're not going")), x));
}
