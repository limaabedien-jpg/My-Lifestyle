// My Lifestyle — Admin panel (hidden link). Every action is checked again on the server.
import * as api from "../js/api.js";
import { h, icon, toast, sheet, confirmBox, busy, askPin, tk, fmtDate, barChart } from "../js/ui.js";

const app = document.getElementById("app");
try { if (JSON.parse(localStorage.getItem("al_theme")) === "light") document.documentElement.dataset.theme = "light"; } catch {}
let tab = "overview";
const UNLOCK_KEY = "al_admin_ok";

async function boot() {
  if (!api.getSession()) return app.replaceChildren(h("div.auth", h("div.card", h("h2", "Admin"), h("p.muted", "Please log in to My Lifestyle first with the admin account."), h("a.btn.primary.block", { href: "../#/login" }, "Go to login"))));
  let ok = false;
  try { ok = await api.rpc("is_admin"); } catch {}
  if (!ok) return app.replaceChildren(h("div.auth", h("div.card.empty", icon("lock"), h("h2", "Not allowed"), h("p", "This page is for My Lifestyle administrators only."), h("a.btn", { href: "../" }, "Back to My Lifestyle"))));
  // second step: PIN (Telegram code will be added when the bot is ready)
  const last = Number(sessionStorage.getItem(UNLOCK_KEY) || 0);
  if (Date.now() - last > 30 * 60000) {
    const pin = await askPin("Admin check: enter your PIN.");
    if (!pin) return app.replaceChildren(h("div.auth", h("div.card.empty", h("p", "Cancelled."), h("button.btn", { onclick: boot }, "Try again"))));
    try { if (!(await api.rpc("check_pin", { p_pin: pin }))) { toast("Wrong PIN.", "bad"); return boot(); } } catch (e) { toast(e.message, "bad"); return boot(); }
    sessionStorage.setItem(UNLOCK_KEY, Date.now());
  }
  render();
}

function render() {
  const tabs = [["overview", "Overview"], ["traffic", "Visitors"], ["capacity", "Capacity & AI"], ["shares", "Shares"], ["wishes", "Feature wishes"], ["requests", "Edit requests"], ["users", "Users"], ["logins", "Logins"], ["rules", "Rules"], ["announce", "Announce"], ["verify", "Verify report"], ["apk", "APK"], ["logs", "Logs"]];
  const body = h("div");
  app.replaceChildren(
    h("header.topbar", h("div.brandmark", h("img", { src: "../assets/icon-64.png", width: 30, alt: "", style: { borderRadius: "8px" } }), h("span", "Amar ", h("b", "Lifestyle"), h("span.muted", " · Control"))), h("a.btn.small", { href: "../" }, "Open app")),
    h("div.tabs", tabs.map(([k, l]) => h("button" + (k === tab ? ".on" : ""), { onclick: () => { tab = k; render(); } }, l))), body);
  ({ overview, traffic, capacity, shares, wishes, requests, users, logins, rules, announce, verify, apk, logs })[tab](body).catch(e => body.replaceChildren(h("div.card.bad", e.message)));
}

async function overview(b) {
  const o = await api.rpc("admin_overview");
  const tile = (k, v) => h("div.stat", h("div.k", k), h("div.v", v));
  b.append(h("div.grid3", tile("Users", o.users), tile("New (7 days)", o.new_7d), tile("Blocked", o.blocked)),
    h("div.grid3.mt", tile("Tasks today", o.tasks_today), tile("Done today", o.done_today), tile("Reports", o.reports)),
    h("p.hint.mt", "Money entries in total: " + o.entries));
}

async function requests(b) {
  const list = await api.rpc("admin_requests");
  if (!list.length) { b.append(h("div.card.small.muted", "No special edit requests yet. Users can ask for one when a money entry is locked.")); return; }
  list.forEach(r => {
    const note = h("input.input", { placeholder: "Note to the user (optional)" });
    const doDecide = async ok => {
      if (!(await confirmBox(ok ? "Approve this edit?" : "Reject this request?", ok ? `${tk(r.old_amount)} → ${tk(r.new_amount)}. It will show as “Special edit” in history and reports.` : "Nothing will change.", ok ? "Approve" : "Reject", !ok))) return;
      await api.rpc("admin_decide_request", { p_id: r.id, p_approve: ok, p_note: note.value || null }); toast(ok ? "Approved ✓" : "Rejected", ok ? "ok" : ""); render();
    };
    const a = h("button.btn.small.primary", "Approve"), rj = h("button.btn.small.danger", "Reject");
    a.onclick = busy(a, () => doDecide(true)); rj.onclick = busy(rj, () => doDecide(false));
    b.append(h("div.card",
      h("div.row.between", h("b", r.user), h("span.badge" + (r.status === "approved" ? ".ok" : r.status === "rejected" ? ".bad" : ".warn"), r.status)),
      h("div.small.muted", `${r.phone} · ${r.kind} · ${r.category} · ${r.entry_date}${r.note ? " · " + r.note : ""}`),
      h("p", { style: { margin: "8px 0" } }, h("b", `${tk(r.old_amount)} → ${tk(r.new_amount)}`)),
      h("p.small", { style: { margin: "0 0 8px" } }, "Reason: ", r.reason),
      r.status === "pending" ? [note, h("div.row.mt", { style: { gap: "8px" } }, a, rj)] : h("div.small.faint", `Decided ${new Date(r.decided_at).toLocaleString("en-GB")}${r.admin_note ? " · " + r.admin_note : ""}`)));
  });
}

const when = t => t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "never";
const EV = { login: "✅ Logged in", wrong_password: "❌ Wrong password", register: "🆕 Registered" };

async function users(b) {
  const list = await api.rpc("admin_people");
  const csv = h("button.btn.small", icon("download"), "Download all (CSV)");
  csv.onclick = () => {
    const rows = [["Name", "Phone", "Email", "Registered", "Last login", "Device", "Logins", "Telegram", "Level", "DP this month", "Blocked"],
      ...list.map(u => [u.name, u.phone, u.email, when(u.created_at), when(u.last_login), u.last_device || "", u.logins, u.telegram ? "yes" : "no", u.level, u.month_dp, u.blocked ? "yes" : "no"])];
    const text = "\ufeff" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    h("a", { download: `amar-lifestyle-users-${new Date().toISOString().slice(0, 10)}.csv`, href: URL.createObjectURL(new Blob([text], { type: "text/csv" })) }).click();
  };
  b.append(h("div.row.between", { style: { marginBottom: "10px" } }, h("b", `${list.length} user${list.length === 1 ? "" : "s"}`), csv));
  b.append(h("div.list", list.map(u => h("div.li", { style: { alignItems: "flex-start" } },
    h("div.grow", h("b", u.name, u.is_admin ? " (admin)" : "", u.blocked ? h("span.bad", " · blocked") : null),
      h("div.small", "📞 ", h("a", { href: `tel:${u.phone}` }, u.phone), "  ✉️ ", h("a", { href: `mailto:${u.email}` }, u.email)),
      h("div.small.muted", `Last login: ${when(u.last_login)}${u.last_device ? " · " + u.last_device : ""} · ${u.logins} login${u.logins === 1 ? "" : "s"}`),
      h("div.small.muted", `Joined ${when(u.created_at)} · Telegram ${u.telegram ? "✅" : "—"} · ${u.level} · ${u.month_dp} DP`)),
    h("div.row", { style: { flexDirection: "column", gap: "6px" } },
      h("button.btn.small", { onclick: () => loginsOf(u) }, "Logins"),
      h("button.btn.small", { onclick: () => dataCheck(u) }, "Data"),
      u.is_admin ? null : h("button.btn.small" + (u.blocked ? "" : ".danger"), { onclick: async () => {
        if (!(await confirmBox(u.blocked ? "Unblock user?" : "Block user?", u.blocked ? `${u.name} can use My Lifestyle again.` : `${u.name} won't be able to log in.`, u.blocked ? "Unblock" : "Block", !u.blocked))) return;
        try { await api.rpc("admin_set_blocked", { p_user: u.id, p_blocked: !u.blocked }); toast("Done ✓", "ok"); render(); } catch (e) { toast(e.message, "bad"); }
      } }, u.blocked ? "Unblock" : "Block"))))));
}

async function loginsOf(u) {
  const l = await api.rpc("admin_login_log", { p_user: u.id, p_limit: 100 });
  sheet(`Logins · ${u.name}`, h("div", h("p.hint", `${u.phone} · ${u.email}`),
    l.length ? h("div.list", l.map(x => h("div.li", h("div.grow", h("b", EV[x.event] || x.event), h("div.small.muted", `${when(x.at)} · ${x.device || ""}`))))) : h("p.muted", "No logins recorded yet.")));
}

async function logins(b) {
  const l = await api.rpc("admin_login_log", { p_limit: 200 });
  const people = Object.fromEntries((await api.rpc("admin_people")).map(u => [u.id, u]));
  b.append(h("p.hint", "Every login, wrong password and new account, newest first."));
  b.append(l.length ? h("div.list", l.map(x => h("div.li", h("div.grow", h("b", EV[x.event] || x.event, " · ", people[x.user_id]?.name || "Unknown"),
    h("div.small.muted", `${x.phone} · ${people[x.user_id]?.email || ""}`), h("div.small.muted", `${when(x.at)} · ${x.device || ""}`)))))
    : h("div.card.small.muted", "No logins recorded yet. They appear from now on."));
}

async function dataCheck(u) {
  const d = await api.rpc("admin_user_data", { p_user: u.id });
  const dl = h("button.btn.block", icon("download"), "Download all data (JSON)");
  dl.onclick = () => { const a = h("a", { download: `amar-lifestyle-${u.phone}-${new Date().toISOString().slice(0, 10)}.json`, href: URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" })) }); a.click(); };
  const fin = h("div.list", d.finance.slice(0, 50).map(f => h("div.li",
    h("div.grow", h("b", (f.kind === "income" ? "+" : "−") + tk(f.amount)), h("div.small.muted", `${f.entry_date} · ${f.category}${f.note ? " · " + f.note : ""}${f.edit_count ? ` · edited ×${f.edit_count}` : ""}`)),
    h("button.btn.small", { onclick: () => adminEdit(f, u) }, icon("edit")))));
  sheet(`Data · ${u.name}`, h("div",
    h("p.hint", "This look is recorded in the admin log."),
    h("div.grid3", h("div.stat", h("div.k", "Tasks"), h("div.v", d.tasks.length)), h("div.stat", h("div.k", "Money entries"), h("div.v", d.finance.length)), h("div.stat", h("div.k", "Diary days"), h("div.v", d.life_logs.filter(x => x.diary).length))),
    h("h3.mt", "Money entries (latest 50)"), d.finance.length ? fin : h("p.muted", "None."),
    h("h3", "Everything"), h("pre.json", JSON.stringify({ profile: d.profile, stats: d.stats }, null, 2)), dl));
}

async function adminEdit(f, u) {
  const amt = h("input.input", { type: "number", inputmode: "decimal", value: f.amount });
  const note = h("input.input", { value: f.note || "" });
  const ok = await sheet("Admin edit", [h("p.hint", "Works even on locked entries. It will show as “Special edit (approved by Admin)” in history and reports."), h("label.f", h("span", "Amount (৳)"), amt), h("label.f", h("span", "Note"), note)], {
    actions: close => [h("button.btn", { onclick: () => close(null) }, "Cancel"), h("button.btn.primary", { onclick: () => close(true) }, "Save")] });
  if (!ok) return;
  try { await api.rpc("admin_edit_finance", { p_entry: f.id, p_amount: Number(amt.value), p_note: note.value }); toast("Special edit saved ✓", "ok"); document.querySelector(".backdrop")?.remove(); dataCheck(u); }
  catch (e) { toast(e.message, "bad"); }
}

async function rules(b) {
  const rows = await api.select("app_config", "select=key,value");
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const save = async (key, value) => { try { await api.rpc("admin_set_config", { p_key: key, p_value: value }); toast("Saved ✓", "ok"); } catch (e) { toast(e.message, "bad"); } };

  const catInputs = Object.entries(cfg.categories).map(([n, v]) => [n, h("input.input", { type: "number", min: "1", value: v.dp }), h("input.input", { type: "color", value: v.color, style: { padding: "4px", width: "60px" } })]);
  const sc = h("button.btn.primary.block", "Save categories");
  sc.onclick = () => save("categories", Object.fromEntries(catInputs.map(([n, d, c]) => [n, { dp: Number(d.value) || 1, color: c.value }])));
  b.append(h("div.card", h("h3", "DP per hour by category"), catInputs.map(([n, d, c]) => h("div.row", { style: { marginBottom: "8px" } }, h("span.grow", n), h("div", { style: { width: "90px" } }, d), c)), sc));

  const lvInputs = cfg.levels.map(l => [l.name, h("input.input", { type: "number", min: "0", value: l.min })]);
  const sl = h("button.btn.primary.block", "Save levels");
  sl.onclick = () => save("levels", lvInputs.map(([n, i]) => ({ name: n, min: Number(i.value) || 0 })).sort((a, b) => a.min - b.min));
  b.append(h("div.card", h("h3", "Levels (monthly DP needed)"), lvInputs.map(([n, i]) => h("div.row", { style: { marginBottom: "8px" } }, h("span.grow", n), h("div", { style: { width: "120px" } }, i))), sl));

  const nums = [["custom_category_dp", "DP/hour for users' own categories"], ["photo_bonus_dp", "Photo proof bonus DP"], ["late_window_min", "Full DP window after a task ends (minutes)"],
    ["unlock_fraction", "Buttons open after this part of the task (0.75 = last quarter)"], ["finance_edit_grace_days", "Money edit days after the month ends"], ["streak_threshold", "Streak needs this share of tasks done (0.8 = 80%)"]];
  b.append(h("div.card", h("h3", "Other rules"), nums.map(([k, l]) => {
    const i = h("input.input", { type: "number", step: "any", value: cfg[k] });
    return h("label.f", h("span", l), h("div.row", h("div.grow", i), h("button.btn.small", { onclick: () => save(k, Number(i.value)) }, "Save")));
  })));
}

async function announce(b) {
  const title = h("input.input", { placeholder: "e.g. New feature!" });
  const body = h("textarea.input", { placeholder: "Message for all users" });
  const send = h("button.btn.primary.block", icon("bell"), "Send to everyone");
  send.onclick = busy(send, async () => {
    if (!title.value.trim() || !body.value.trim()) throw new Error("Write a title and message.");
    await api.rpc("admin_announce", { p_title: title.value.trim(), p_body: body.value.trim() }); toast("Sent ✓ — shows on everyone's Today page", "ok"); title.value = body.value = "";
  });
  const list = await api.select("announcements", "select=*&order=created_at.desc&limit=20");
  b.append(h("div.card", h("h3", "New announcement"), h("label.f", h("span", "Title"), title), h("label.f", h("span", "Message"), body), send),
    list.length ? h("div.list", list.map(a => h("div.li", h("div.grow", h("b", a.title), h("div.small.muted", a.body), h("div.small.faint", new Date(a.created_at).toLocaleString("en-GB")))))) : null);
}

async function verify(b) {
  const id = h("input.input", { placeholder: "Paste Report ID" });
  const out = h("div");
  const go = h("button.btn.primary.block", "Check");
  go.onclick = busy(go, async () => {
    const r = await api.rpc("verify_report", { p_id: id.value.trim() });
    out.replaceChildren(r ? h("div.card", h("h3.ok", "✓ Real report"), h("p", `${r.snapshot.name} · ${r.title}`), h("p.small.muted", `Income ${tk(r.snapshot.income)} · Expense ${tk(r.snapshot.expense)} · made ${new Date(r.created_at).toLocaleString("en-GB")}`), h("a.btn.block", { href: `../#/verify/${r.id}`, target: "_blank" }, "Open full report"))
      : h("div.card", h("h3.bad", "✗ Not found"), h("p", "No report with this ID — the document may be fake.")));
  });
  b.append(h("div.card", h("h3", "Check a report"), h("p.hint", "Or scan the QR code on the report with any phone camera."), id, h("div.mt", go)), out);
}

async function apk(b) {
  const inp = h("input.input", { type: "file", accept: ".apk" });
  const up = h("button.btn.primary.block", icon("download"), "Upload new APK");
  up.onclick = busy(up, async () => { if (!inp.files[0]) throw new Error("Choose the APK file."); await api.uploadApk(inp.files[0]); toast("Uploaded ✓ — the Download button now gives this version", "ok"); });
  b.append(h("div.card", h("h3", "Android app"), h("p.hint", "Upload a new APK. Users get it from More → Get the app."), inp, h("div.mt", up)));
}

// who is using the site: counts only (a random id per device, no names)
async function traffic(b) {
  const a = await api.rpc("admin_analytics", { p_days: 14 });
  const t = a.today || {};
  const stat = (k, v, sub) => h("div.stat", h("div.k", k), h("div.v", v), sub ? h("div.small.muted", sub) : null);
  b.append(h("h3", "Today"), h("div.grid3",
    stat("Visitors", t.visitors ?? 0, `${t.new_visitors ?? 0} new`),
    stat("Visits", t.sessions ?? 0, `${t.pages ?? 0} pages opened`),
    stat("Avg. time", `${t.avg_min ?? 0} min`, `${t.logged_in_pct ?? 0}% logged in`)));
  b.append(h("div.card.mt", h("h3", "Visits by hour — today"), barChart((a.by_hour || []).map(x => ({ l: x.h % 3 === 0 ? (x.h % 12 || 12) + (x.h < 12 ? "a" : "p") : "", v: x.n }))),
    a.peak_hour != null ? h("p.small.muted.mb0", `Busiest hour this week: ${(a.peak_hour % 12) || 12} ${a.peak_hour < 12 ? "AM" : "PM"}`) : null));
  b.append(h("div.card", h("h3", "Visitors per day — last 14 days"), barChart((a.by_day || []).map(x => ({ l: String(x.d).slice(8), v: x.visitors }))),
    h("div.list.mt", (a.by_day || []).slice(-7).reverse().map(x => h("div.li", h("div.grow", fmtDate(x.d, { weekday: "short", day: "numeric", month: "short" })), h("span.small", `${x.visitors} people · ${x.sessions} visits · ${x.avg_min} min avg`))))));
  const dev = Object.entries(a.devices || {}).sort((p, q) => q[1] - p[1]);
  const totalDev = dev.reduce((s, [, n]) => s + n, 0) || 1;
  b.append(h("div.card", h("h3", "Devices — last 7 days"), h("div.list", dev.map(([d, n]) => h("div.li", h("div.grow", d), h("span.small", `${n} · ${Math.round(n / totalDev * 100)}%`)))),
    h("p.small.muted.mb0", { style: { marginTop: "8px" } }, `Coming back again: ${a.returning_pct ?? 0}% of visitors this week · All-time visitors: ${a.total_visitors ?? 0}`)));
  b.append(h("p.small.faint", "Counted with a random id per device — names, phone numbers and what people write are not tracked here."));
}

// how much of the free limits is used, and roughly how many more people the app can take
async function capacity(b) {
  const c = await api.rpc("admin_capacity");
  const MB = 1048576, LIM = { db: 500 * MB, storage: 1024 * MB, fn: 500000, mau: 50000 };
  const aiCap = Number(String(c.cfg_ai_day).replace(/"/g, "")) || 1000;
  const active = Math.max(1, c.mau), dau = Math.max(1, c.dau), days = Math.max(1, (c.ai_by_day || []).length);
  const aiAvg = c.ai_30d / days / active || 0.5, aiPeak = Math.max(c.ai_peak_day, c.ai_today) / dau || 1;
  const dbPer = Math.max((c.db_bytes - 12 * MB) / Math.max(1, c.users), 0.2 * MB);
  const fnFree = LIM.fn - c.cron_fn_month;
  const est = {
    ai: [aiCap / Math.max(aiPeak, 0.1), aiCap / Math.max(aiAvg, 0.1)],
    db: [(LIM.db * 0.9) / (dbPer * 4), (LIM.db * 0.9) / dbPer],
    fn: [fnFree / (aiPeak * 30 + 10), fnFree / (aiAvg * 30 + 5)],
    mau: [LIM.mau, LIM.mau],
  };
  const lo = Math.floor(Math.min(...Object.values(est).map(x => x[0]))), hi = Math.floor(Math.min(...Object.values(est).map(x => x[1])));
  const neck = Object.entries(est).sort((p, q) => p[1][0] - q[1][0])[0][0];
  const NAME = { ai: "AI (Gemini daily limit)", db: "Database size", fn: "Server function calls", mau: "Monthly users (auth)" };
  const pct = (u, l) => Math.min(100, Math.round(u / l * 1000) / 10);
  const meter = (label, used, limit, sub) => { const p = pct(used, limit); return h("div.li", { style: { display: "block" } },
    h("div.row.between", h("b", label), h("span.small", `${p}%`)),
    h("div", { style: { height: "8px", borderRadius: "6px", background: "var(--line)", margin: "6px 0 4px", overflow: "hidden" } }, h("div", { style: { width: Math.max(p, 1) + "%", height: "100%", background: p > 80 ? "var(--red)" : p > 50 ? "var(--amber)" : "var(--brand)" } })),
    h("div.small.muted", sub)); };
  const stat = (k, v, sub) => h("div.stat", h("div.k", k), h("div.v", v), sub ? h("div.small.muted", sub) : null);
  b.append(h("div.card", { style: { borderColor: "color-mix(in srgb, var(--brand) 45%, transparent)" } },
    h("div.small.muted", "আরও কতজন ব্যবহার করতে পারবে (আনুমানিক)"),
    h("div", { style: { fontSize: "28px", fontWeight: 700, margin: "4px 0" } }, `${Math.max(0, lo - active).toLocaleString()} – ${Math.max(0, hi - active).toLocaleString()} জন`),
    h("div.small.muted", `মোট ${lo.toLocaleString()}–${hi.toLocaleString()} জন active user পর্যন্ত চলবে। প্রথমে শেষ হবে: `, h("b", NAME[neck]), "।"),
    h("p.small.faint.mb0", { style: { marginTop: "6px" } }, "এখনকার ব্যবহারের হার দেখে হিসাব — ইউজার যত বাড়বে, হিসাব তত ঠিক হবে।")));
  b.append(h("div.grid3", stat("Users", c.users, `${c.mau} active (30d)`), stat("Today", c.dau, `${c.wau} this week`), stat("AI today", c.ai_today, `${c.ai_users_today} people`)));
  b.append(h("div.section-title", h("h2", "Free limits used")), h("div.list",
    meter("✨ AI — today", c.ai_today, aiCap, `${c.ai_today} / ${aiCap} requests today · avg ${aiAvg.toFixed(1)} per person per day`),
    meter("🗄️ Database", c.db_bytes, LIM.db, `${(c.db_bytes / MB).toFixed(1)} MB / 500 MB · ~${(dbPer / MB).toFixed(2)} MB per user`),
    meter("⚙️ Server functions — this month (est.)", c.cron_fn_month + c.ai_30d, LIM.fn, `${(c.cron_fn_month + c.ai_30d).toLocaleString()} / 500,000 · reminders run every minute = ${c.cron_fn_month.toLocaleString()}`),
    meter("👥 Monthly active users", c.mau, LIM.mau, `${c.mau} / 50,000`),
    meter("📁 File storage", c.storage_bytes, LIM.storage, `${(c.storage_bytes / MB).toFixed(1)} MB / 1 GB`)));
  b.append(h("div.card.mt", h("h3", "AI requests — last 14 days"), barChart((c.ai_by_day || []).map(x => ({ l: String(x.d).slice(8), v: x.n }))),
    h("p.small.muted.mb0", "Each person can use AI up to 40 times a day.")));
  const capIn = h("input.input", { type: "number", min: "50", value: aiCap, style: { maxWidth: "140px" } });
  const save = h("button.btn.small", "Save");
  save.onclick = busy(save, async () => { await api.rpc("admin_set_config", { p_key: "cap_ai_day", p_value: Number(capIn.value) }); toast("Saved ✓", "ok"); });
  b.append(h("div.card", h("h3", "Gemini daily limit"), h("p.small.muted", "Google AI Studio → your API key → Rate limits. Put the requests-per-day number here so the estimate is right."), h("div.row", { style: { gap: "8px" } }, capIn, save)));
  b.append(h("p.small.faint", "Not counted here: download traffic (Supabase free: 5 GB/month) — check it in the Supabase dashboard → Usage. The website files themselves are served free by GitHub Pages."));
}

// who shared the app, and how many people came / joined from their links
async function shares(b) {
  const s = await api.rpc("admin_shares");
  const stat = (k, v) => h("div.stat", h("div.k", k), h("div.v", v));
  b.append(h("div.grid3", stat("Shares", s.total), stat("Visitors from links", s.visitors), stat("Joined from links", s.joined)));
  const ch = Object.entries(s.by_channel || {}).sort((p, q) => q[1] - p[1]);
  if (ch.length) b.append(h("p.small.muted.mt", "By: ", ch.map(([k, n]) => `${k === "phone" ? "phone share menu" : k} ${n}`).join(" · ")));
  b.append(h("div.section-title", h("h2", "People who shared")));
  b.append((s.people || []).length ? h("div.list", s.people.map(p => h("div.li", h("div.grow", h("b", p.name || "—"), h("div.small.muted", [p.occupation, p.last ? "last " + new Date(p.last).toLocaleDateString("en-GB") : null].filter(Boolean).join(" · "))),
    h("span.small", `${p.shares} shares · ${p.visitors} came · ${p.joined} joined`)))) : h("div.card.small.muted", "No shares yet. Users share from More → Share the app."));
  b.append(h("p.small.faint", "“Came” = different phones that opened a shared link. “Joined” = of those, how many logged in."));
}

// things users asked the AI for that the app can't do yet — ideas for the next update
async function wishes(b) {
  const l = await api.rpc("admin_feature_requests", { p_limit: 300 });
  const ROLE = { school: "School/college", student: "University", teacher: "Teacher", business: "Business", job: "Job", homemaker: "Homemaker" };
  b.append(h("p.small.muted", "When a user asks the AI for something the app can't do, it is saved here with what kind of user they are."));
  b.append(l.length ? h("div.list", l.map(x => h("div.li", { style: { alignItems: "flex-start" } }, h("div.grow",
    h("b", x.wish),
    x.asked ? h("div.small.faint", "“" + x.asked + "”") : null,
    h("div.small.muted", [x.name || "—", (x.roles || []).filter(Boolean).map(r => ROLE[r] || r).join(" + "), x.religion, new Date(x.created_at).toLocaleString("en-GB")].filter(Boolean).join(" · "))))))
    : h("div.card.small.muted", "No wishes yet."));
}

async function logs(b) {
  const l = await api.rpc("admin_logs", { p_limit: 100 });
  b.append(l.length ? h("div.list", l.map(x => h("div.li", h("div.grow", h("b", x.action), h("div.small.muted", new Date(x.at).toLocaleString("en-GB"), x.target_user ? " · user " + x.target_user.slice(0, 8) : ""), x.detail ? h("div.small.faint", JSON.stringify(x.detail)) : null))))
    : h("div.card.small.muted", "No admin actions yet."));
}

boot();
