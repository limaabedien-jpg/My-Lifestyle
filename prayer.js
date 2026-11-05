// My Lifestyle — prayer (namaz) times for Muslim users: calculated on the phone, no internet needed.
// Method: University of Islamic Sciences, Karachi (Fajr & Isha 18°), Asr Hanafi — the method Islamic Foundation Bangladesh uses.
import * as api from "./api.js";
import { h, toast, sheet, busy, todayStr, addDays, fmtHM, barChart } from "./ui.js";
import { route, store, rerender, loadBasics } from "./app.js";

export const RELIGIONS = {
  muslim: "☪️ Muslim · মুসলিম", hindu: "🕉️ Hindu · হিন্দু", buddhist: "☸️ Buddhist · বৌদ্ধ", christian: "✝️ Christian · খ্রিস্টান", other: "Other / বলতে চাই না",
};
export const isMuslim = () => store.profile?.religion === "muslim";
export function religionPicker(current, onPick) {
  const box = h("div.row.wrap", { style: { gap: "6px" } });
  const draw = cur => box.replaceChildren(...Object.entries(RELIGIONS).map(([k, l]) =>
    h("button.btn.small" + (k === cur ? ".primary" : ""), { type: "button", onclick: () => { draw(k); onPick(k); } }, l)));
  draw(current);
  return box;
}
export async function saveReligion(k) {
  await api.update("profiles", `id=eq.${store.profile.id}`, { religion: k });
  store.profile.religion = k;
  api.LS.set("al_basics", { ...(api.LS.get("al_basics") || {}), profile: store.profile });
}

export const PRAYERS = [
  ["fajr", "Fajr", "ফজর"], ["dhuhr", "Dhuhr", "যোহর"], ["asr", "Asr", "আসর"], ["maghrib", "Maghrib", "মাগরিব"], ["isha", "Isha", "এশা"],
];
const BN = Object.fromEntries(PRAYERS.map(p => [p[0], p[1]])); // shown in English
const DHAKA = { lat: 23.8103, lng: 90.4125, name: "Dhaka" };
export const place = () => store.profile?.prayer_loc?.lat ? store.profile.prayer_loc : DHAKA;

// ---- sun maths (praytimes.org formulas)
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
function sun(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - RA };
}
// times for one date (yyyy-mm-dd) → { fajr, sunrise, dhuhr, asr, maghrib, isha } as Date objects
export function timesFor(day, loc = place()) {
  const [y, m, d] = day.split("-").map(Number);
  let Y = y, M = m; if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
  const jd0 = Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5 - loc.lng / 360;
  const lat = loc.lat;
  const noon = t => fix(12 - sun(jd0 + t / 24).eqt, 24);
  const angleTime = (angle, t, before) => {
    const { decl } = sun(jd0 + t / 24);
    const T = deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat))))) / 15;
    return noon(t) + (before ? -T : T);
  };
  const asrTime = t => { const { decl } = sun(jd0 + t / 24); const a = -deg(Math.atan(1 / (2 + Math.tan(rad(Math.abs(lat - decl)))))); return angleTime(a, t, false); };
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
  for (let i = 0; i < 2; i++) t = {
    fajr: angleTime(18, t.fajr, true), sunrise: angleTime(0.833, t.sunrise, true), dhuhr: noon(t.dhuhr),
    asr: asrTime(t.asr), maghrib: angleTime(0.833, t.maghrib, false), isha: angleTime(18, t.isha, false),
  };
  const out = {};
  for (const [k, v] of Object.entries(t)) {
    const local = v + 6 - loc.lng / 15; // hours in Dhaka time (UTC+6)
    out[k] = new Date(Date.UTC(y, m - 1, d, 0, Math.round(local * 60)) - 6 * 3600e3);
  }
  return out;
}
// Safety margins (ihtiyat), so a salah is never shown before its waqt or as valid after it:
// each waqt STARTS a few minutes after the calculated moment and ENDS a little before the next one.
const SAFE_START = { fajr: 2, dhuhr: 3, asr: 2, maghrib: 3, isha: 2 };
const plus = (d, m) => new Date(d.getTime() + m * 60000);
const adj = () => place().adj || {};
// each waqt: when it starts and ends
export function waqts(day) {
  const t = timesFor(day), nx = timesFor(addDays(day, 1)), a = adj();
  const st = k => plus(t[k], SAFE_START[k] + (Number(a[k]) || 0));
  return [
    { key: "fajr", start: st("fajr"), end: plus(t.sunrise, -3) },
    { key: "dhuhr", start: st("dhuhr"), end: plus(t.asr, -1) },
    { key: "asr", start: st("asr"), end: plus(t.maghrib, -1) },
    { key: "maghrib", start: st("maghrib"), end: plus(t.isha, -1) },
    { key: "isha", start: st("isha"), end: plus(nx.fajr, -1) },
  ].map(w => ({ ...w, bn: BN[w.key], en: PRAYERS.find(p => p[0] === w.key)[1] }));
}
const tm = d => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });
const left = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const C = "#10B981";
const pdp = (k = "dhuhr") => Number(k === "fajr" ? store.cfg.prayer_dp_fajr ?? 10 : store.cfg.prayer_dp ?? 8), pen = k => pdp(k);

export async function prayerLogs(from, to) {
  try { return await api.select("prayer_logs", `select=day,prayer,status,dp&day=gte.${from}&day=lte.${to}`); } catch { return []; }
}
// can this day still be marked? today, or yesterday until 6 AM (for Isha after midnight)
const canMark = day => day === todayStr() || (day === addDays(todayStr(), -1) && dhakaHour() < 6);
const dhakaHour = () => (new Date().getUTCHours() + 6) % 24;
// two answers: prayed / not prayed
function answerBtns(day, w, status, after, mini = false) {
  if (status === "unmarked") return h("span.small", { style: { color: "var(--red)" } }, `Not marked · −${pen(w.key)} DP`);
  if (!canMark(day)) return h("span.small.faint", status === "prayed" ? "✓ Prayed" : status === "not_prayed" ? "Not prayed" : "—");
  const send = st => async e => {
    e?.stopPropagation?.();
    const r = await api.rpc("mark_prayer", { p_day: day, p_prayer: w.key, p_status: st });
    toast(st === "prayed" ? `${w.bn} ✓ Alhamdulillah · +${r.dp} DP` : "Noted — next time, in sha Allah. (No DP cut)", st === "prayed" ? "ok" : "");
    after();
  };
  const yes = h("button.btn.small" + (status === "prayed" ? ".primary" : ""), { type: "button", title: "Prayed" }, mini ? `✓ +${pdp(w.key)}` : status === "prayed" ? "✓ Prayed" : `Prayed +${pdp(w.key)}`);
  const no = h("button.btn.small" + (status === "not_prayed" ? ".danger" : ""), { type: "button", title: "Not prayed" }, mini ? "✕" : "Not prayed");
  yes.onclick = busy(yes, send("prayed")); no.onclick = busy(no, send("not_prayed"));
  return h("div.row", { style: { gap: "6px", flexShrink: 0 } }, yes, no);
}

// Today page: only the waqt that is running now (small card above the task list)
export async function prayerNow() {
  if (!isMuslim()) return null;
  const today = todayStr(), now = Date.now();
  let day = today, w = waqts(today).find(x => now >= x.start && now < x.end);
  if (!w) { const y = waqts(addDays(today, -1))[4]; if (now >= y.start && now < y.end) { w = y; day = addDays(today, -1); } }
  if (!w) return null;
  const st = (await prayerLogs(day, day)).find(r => r.prayer === w.key)?.status;
  // one small row; once answered it shrinks to a single line
  const ic = h("span.s-ic", "🕌");
  if (st === "prayed") return h("a.srow", { href: "#/prayer" }, ic, h("div.s-main", h("div.ell", w.bn, " ", h("span", { style: { color: "var(--green)" } }, "✓ Prayed"))), h("span.s-tag", left(w.end - now)));
  if (st === "not_prayed") return h("a.srow", { href: "#/prayer" }, ic, h("div.s-main", h("div.ell", w.bn, " ", h("span", { style: { color: "var(--red)" } }, "✕ Not prayed")), h("div.s-sub.ell", { style: { color: "var(--amber)" } }, `সময় আছে আর ${left(w.end - now)} — এখনো পড়ে নিতে পারেন`)));
  return h("div.srow.prayer", ic, h("a.s-main", { href: "#/prayer", style: { color: "inherit" } }, h("div.ell", h("b", w.bn), " time now"), h("div.s-sub", `${left(w.end - now)} left`)), answerBtns(day, w, st, rerender, true));
}
// one line for the night report
export async function prayerCount(day) {
  if (!isMuslim()) return null;
  return (await prayerLogs(day, day)).filter(r => r.status === "prayed").length;
}

// ---------- Routine → 🕌 Prayer tab
route("prayer", async page => {
  const { routineTabsAsync } = await import("./timetable.js");
  page.append(h("header.topbar", h("div", h("h1", "Routine"), h("div.sub", "Prayer times · " + place().name))), await routineTabsAsync("prayer"));
  if (!isMuslim()) {
    page.append(h("div.card", h("p", "This part is for Muslim profiles. Choose your religion in Settings → Profile.")));
    return;
  }
  const today = todayStr(), yday = addDays(today, -1);
  const from = addDays(today, -183);
  const logs = await prayerLogs(from, today);
  const stOf = new Map(logs.map(r => [r.day + ":" + r.prayer, r.status]));
  const set = new Set(logs.filter(r => r.status === "prayed").map(r => r.day + ":" + r.prayer));
  const W = waqts(today), now = Date.now();
  const cur = W.find(w => now >= w.start && now < w.end) || (now < W[0].start ? { ...waqts(yday)[4] } : null);
  const next = W.find(w => w.start > now) || waqts(addDays(today, 1))[0];
  const todayN = W.filter(w => set.has(today + ":" + w.key)).length;

  page.append(h("div.hero", { style: { flexDirection: "column", alignItems: "stretch", gap: "4px" } },
    cur ? h("div", h("span.small.muted", "Prayer time now"), h("div.big", "🕌 ", cur.bn), h("div.small.muted", `Ends ${tm(cur.end)} · ${left(cur.end - now)} left`)) : h("div.big", "🕌 No fard prayer time right now"),
    h("div.small", "Next: ", h("b", next.bn), ` ${tm(next.start)} (in ${left(next.start - now)})`),
    h("div.small", "Prayed today: ", h("b", `${todayN}/5`))));

  const listFor = (day, ws) => h("div.list", ws.map(w => {
    const status = stOf.get(day + ":" + w.key), started = Date.now() >= w.start, live = started && Date.now() < w.end;
    return h("div.li", { style: live ? { borderColor: "#10B981" } : {} },
      h("div", { style: { minWidth: "72px", fontWeight: 700 } }, w.bn, h("div.small.faint", w.en)),
      h("div.grow.small", tm(w.start), " – ", tm(w.end), live ? h("span.badge.ok", { style: { marginLeft: "6px" } }, "Now") : null),
      started || status ? answerBtns(day, w, status, rerender) : h("span.small.faint", "—"));
  }));
  page.append(h("h3", { style: { margin: "14px 2px 8px" } }, "Today"), listFor(today, W));
  if (canMark(yday)) {
    const yN = PRAYERS.filter(p => set.has(yday + ":" + p[0])).length;
    const yBtn = h("button.linkbtn.small", { style: { marginTop: "8px" } }, `Yesterday: ${yN}/5 — can be marked until 6 AM`);
    yBtn.onclick = () => sheet("Yesterday's prayers", [listFor(yday, waqts(yday))], { actions: close => [h("button.btn", { onclick: () => { close(null); rerender(); } }, "Done")] });
    page.append(yBtn);
  }
  page.append(h("div.card.small.mt", h("b", "Points"), h("p.small.muted.mb0", { style: { marginTop: "4px" } },
    `Prayed: Fajr +${pdp("fajr")} DP, other prayers +${pdp()} DP (prayer time with preparation is valued like a demanding task) · Not prayed: 0 (nothing is cut) · Not marked at all: at 6 AM next morning the same DP is cut (Fajr −${pen("fajr")}, others −${pen()}). You can mark a prayer only after its time starts.`)));

  // graphs
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const cnt = d => PRAYERS.filter(p => set.has(d + ":" + p[0])).length;
  page.append(h("div.card.mt", h("h3", "Prayers per day — last 30 days"), barChart(days.map(d => ({ l: d.slice(8), v: cnt(d), c: cnt(d) === 5 ? "#10B981" : undefined })), { color: "#6EE7B7" })));
  let full = 0; for (let i = days.length - 1; i >= 0; i--) { if (cnt(days[i]) === 5) full++; else if (days[i] !== today) break; }
  const mo = today.slice(0, 7), moDays = days.filter(d => d.startsWith(mo)).length || 1;
  page.append(h("div.card", h("h3", "This month — each prayer"),
    h("div.list", PRAYERS.map(([k, , bn]) => { const n = logs.filter(r => r.status === "prayed" && r.prayer === k && r.day.startsWith(mo)).length; return h("div.li", h("b", { style: { minWidth: "70px" } }, bn), h("div.grow", h("div.bar", h("i", { style: { width: Math.min(100, n / moDays * 100) + "%", background: "#10B981" } }))), h("span.small", `${n}/${moDays}`)); })),
    h("p.small.muted.mb0", `All 5 in a row: ${full} day${full === 1 ? "" : "s"} 🔥`)));
  const months = Array.from({ length: 6 }, (_, i) => { const x = new Date(today.slice(0, 7) + "-01T00:00:00Z"); x.setUTCMonth(x.getUTCMonth() - 5 + i); return x.toISOString().slice(0, 7); });
  const possible = m => { const dIn = m === mo ? Number(today.slice(8)) : new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate(); return dIn * 5; };
  page.append(h("div.card", h("h3", "Monthly — % of prayers prayed"),
    barChart(months.map(m => ({ l: new Date(m + "-01").toLocaleDateString("en-GB", { month: "short" }), v: Math.round(logs.filter(r => r.status === "prayed" && r.day.startsWith(m)).length / possible(m) * 100) })), { color: "#10B981", fmt: v => v + "%" })));

  // location
  const locBtn = h("button.btn.small", "📍 Use my location");
  locBtn.onclick = busy(locBtn, async () => {
    const pos = await new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => rej(new Error("Couldn't get your location. Allow location in Settings.")), { timeout: 15000 }) : rej(new Error("This phone has no location.")));
    const loc = { ...(store.profile.prayer_loc || {}), lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4), name: "My location" };
    await api.update("profiles", `id=eq.${store.profile.id}`, { prayer_loc: loc }); await loadBasics(); toast("Times now use your location ✓", "ok"); rerender();
  });
  const adjBtn = h("button.btn.small", "🕌 Match my mosque");
  adjBtn.onclick = () => adjustSheet();
  page.append(h("div.card.small", h("p.small.muted", { style: { margin: "0 0 8px" } },
    `Times for ${place().name} (${place().lat}, ${place().lng}) · Islamic Foundation Bangladesh method (Fajr and Isha 18°, Asr Hanafi). For safety each prayer time starts 2–3 minutes after the calculated time and ends 1–3 minutes before the next, so a prayer is never shown before its time. If in doubt, follow your mosque.`),
    h("div.row.wrap", { style: { gap: "8px" } }, locBtn, adjBtn)));
}, { tab: "week" });

// move each start time by a few minutes to match the local mosque
function adjustSheet() {
  const a = adj();
  const ins = PRAYERS.map(([k, , bn]) => [k, bn, h("input.input", { type: "number", min: "-15", max: "30", step: "1", value: a[k] || 0, style: { width: "90px" } })]);
  sheet("Match my mosque", [h("p.hint", "Move each start time later (+) or earlier (−) by a few minutes. Change only to match your mosque or calendar."),
    h("div.list", ins.map(([k, bn, inp]) => h("div.li", h("b.grow", bn), inp, h("span.small.muted", " min"))))], {
    actions: close => {
      const sv = h("button.btn.primary", "Save");
      sv.onclick = busy(sv, async () => {
        const n = {}; for (const [k, , inp] of ins) { const v = Math.round(Number(inp.value) || 0); if (v < -15 || v > 30) throw new Error("Use −15 to +30 minutes."); if (v) n[k] = v; }
        await api.update("profiles", `id=eq.${store.profile.id}`, { prayer_loc: { ...(store.profile.prayer_loc || DHAKA), adj: n } });
        await loadBasics(); toast("Saved ✓", "ok"); close(true); rerender();
      });
      return [h("button.btn", { onclick: () => close(null) }, "Cancel"), sv];
    },
  });
}
