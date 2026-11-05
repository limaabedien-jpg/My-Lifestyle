// My Lifestyle — money: income, expenses, budgets, history, tuition, dues, savings
import * as api from "./api.js";
import { pinGate, lockedCard } from "./pin.js";
import { h, icon, t, toast, sheet, confirmBox, busy, askPin, tk, todayStr, addDays, fmtDate, donut, PALETTE, pad, colorPicker, barChart } from "./ui.js";
import { route, store, rerender, backbar, role, showTuition } from "./app.js";

const INCOME_DEFAULT = ["Tuition", "Salary", "Video work", "Gift", "Other income"];
const incomeCats = () => role()?.income || INCOME_DEFAULT;
// the day a student joined, in Bangladesh time (not UTC)
const joinDay = st => st?.created_at ? new Date(new Date(st.created_at).getTime() + 6 * 3600e3).toISOString().slice(0, 10) : todayStr();
const expCats = () => store.cfg.expense_categories || ["Rent", "Bills", "Food", "Transport", "Study", "Shopping", "Fun", "Other"];
const monthStart = s => s.slice(0, 7) + "-01";
const monthEnd = m => { const [y, mo] = m.split("-").map(Number); return `${y}-${pad(mo)}-${pad(new Date(y, mo, 0).getDate())}`; };
const shiftMonth = (m, n) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; };
export function lockAt(dateStr) {
  const grace = Number(store.cfg.finance_edit_grace_days ?? 30);
  const nm = shiftMonth(monthStart(dateStr), 1);
  return new Date(new Date(`${nm}T00:00:00+06:00`).getTime() + grace * 864e5);
}
const isLocked = d => new Date() >= lockAt(d);
const firstOpenDate = () => { const today = todayStr(); const prev = shiftMonth(monthStart(today), -1); return isLocked(prev) ? monthStart(today) : prev; };
const monthLabel = m => new Date(m + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const catCol = (c, i) => PALETTE[(expCats().indexOf(c) + 12) % 12] || PALETTE[i % 10];

route("money", async (page, tab = "overview", month) => {
  const m = month || monthStart(todayStr());
  const me = monthEnd(m);
  page.append(h("header.topbar",
    h("div", h("h1", t("Money")), h("div.sub", monthLabel(m))),
    h("div.row", h("a.icon-btn", { href: `#/money/${tab}/${shiftMonth(m, -1)}`, "aria-label": "Previous month" }, icon("back")),
      h("a.icon-btn", { href: `#/money/${tab}/${shiftMonth(m, 1)}`, "aria-label": "Next month" }, icon("chev")))));
  const tabs = [["overview", "Overview"], ["entries", "Entries"], showTuition() ? ["tuition", "Tuition"] : null, ["plans", "Dues & Goals"]].filter(Boolean);
  page.append(h("div.seg", { style: { marginBottom: "14px" } }, tabs.map(([k, l]) => h("button" + (k === tab ? ".on" : ""), { onclick: () => location.hash = `#/money/${k}/${m}` }, l))));
  const body = h("div"); page.append(body);
  page.append(h("button.fab", { onclick: () => addEntry(), "aria-label": "Add money entry" }, icon("plus")));
  if (tab === "overview") await overview(body, m, me);
  else if (tab === "entries") await entries(body, m, me);
  else if (tab === "tuition") await tuition(body, m);
  else await plans(body);
}, { tab: "money" });

// ---------- bills to pay: written in advance, counted as spent only when ticked
async function billsCard(body, m, savedNow) {
  const [bills, pays] = await Promise.all([
    api.select("bills", "select=*&active=eq.true&order=due_day.nullslast,created_at"),
    api.select("bill_payments", `select=*&month=eq.${m}`),
  ]);
  const list = bills.filter(b => b.monthly ? b.start_month <= m : b.start_month === m);
  const cur = todayStr().slice(0, 8) + "01";
  const paidOf = b => pays.find(p => p.bill_id === b.id);
  const total = list.reduce((a, b) => a + (paidOf(b) ? +paidOf(b).amount : +b.amount), 0);
  const paid = list.filter(paidOf).reduce((a, b) => a + +paidOf(b).amount, 0);
  const left = total - paid;
  const card = h("div.card", h("div.row.between", h("h3.mb0", "🧾 Bills to pay"), h("button.btn.small", { onclick: () => billSheet(null, m) }, icon("plus"), "Add bill")));
  if (!list.length) {
    card.append(h("p.hint.mt", "Write down bills you have to pay this month (loan, internet, subscriptions…). They are NOT counted as spent until you tick them as paid."));
    body.append(card); return;
  }
  card.append(h("div.small", { style: { margin: "8px 0 4px" } }, h("b.ok", `Paid ${tk(paid)}`), ` of ${tk(total)} · `, h("b" + (left ? ".bad" : ".ok"), left ? `${tk(left)} left to pay` : "all paid ✓")),
    h("div.bar", h("i", { style: { width: (total ? paid / total * 100 : 0) + "%", background: "var(--green)" } })),
    left ? h("p.small" + (savedNow - left < 0 ? ".bad" : ".muted"), { style: { margin: "6px 0 0" } }, savedNow - left >= 0 ? `After paying the rest, this month you'd keep ${tk(savedNow - left)}.` : `After paying the rest, this month you'd be short by ${tk(left - savedNow)}.`) : null);
  list.forEach(b => {
    const p = paidOf(b);
    const tick = h("button", { "aria-label": p ? "Paid" : "Mark as paid", disabled: !!p || m > cur, style: { width: "28px", height: "28px", borderRadius: "8px", border: `2px solid ${p ? "var(--green)" : "var(--line2)"}`, background: p ? "var(--green)" : "transparent", color: "#04211D", fontWeight: 800, flexShrink: 0, cursor: p ? "default" : "pointer" } }, p ? "✓" : "");
    tick.onclick = () => payBill(b, m);
    card.append(h("div.row", { style: { gap: "10px", padding: "10px 0", borderTop: "1px solid var(--line)", alignItems: "center" } }, tick,
      h("div.grow", { role: "button", tabindex: "0", style: { cursor: "pointer" }, onclick: () => billSheet(b, m) },
        h("b", { style: { textDecoration: p ? "line-through" : "", opacity: p ? .7 : 1 } }, b.title),
        h("div.small.muted", p ? `Paid ${fmtDate(p.paid_on)}` : [b.due_day ? `Due by ${b.due_day} ${monthLabel(m).split(" ")[0]}` : "Not paid yet", b.monthly ? " · every month" : " · one time"].join(""))),
      h("b" + (p ? ".ok" : ""), tk(p ? p.amount : b.amount))));
  });
  body.append(card);
}
function payBill(b, m) {
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "0", value: b.amount });
  sheet(`Paid: ${b.title}?`, [h("p.hint", "This adds the money to today's expenses."), h("label.f", h("span", "Amount paid (৳)"), amt)], {
    actions: close => {
      const ok = h("button.btn.primary", "✓ Yes, paid");
      ok.onclick = busy(ok, async () => {
        const a = Number(amt.value); if (!(a >= 0)) throw new Error("Write the amount.");
        await api.rpc("pay_bill", { p_bill: b.id, p_month: m, p_amount: a });
        toast(`${b.title} paid ✓ added to expenses`, "ok"); close(true); rerender();
      });
      return [h("button.btn", { onclick: () => close(null) }, t("Cancel")), ok];
    },
  });
}
function billSheet(b, m) {
  const title = h("input.input", { placeholder: "e.g. GPFi internet · bKash loan", value: b?.title || "" });
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "0", value: b?.amount ?? "" });
  const cat = h("select.input", expCats().map(c => h("option", { selected: c === (b?.category || "Bills") }, c)));
  const due = h("input.input", { type: "number", min: "1", max: "31", placeholder: "optional", value: b?.due_day ?? "" });
  const monthly = h("input", { type: "checkbox", id: "bm", checked: b ? b.monthly : true });
  sheet(b ? "Edit bill" : "Add bill to pay", [h("label.f", h("span", "Bill"), title), h("div.grid2", h("label.f", h("span", "Amount (৳)"), amt), h("label.f", h("span", "Pay by day"), due)),
    h("label.f", h("span", "Category"), cat), h("label.check", { for: "bm" }, monthly, h("span", "Every month (comes back next month too)")),
    h("p.hint", "Not counted as spent until you tick it as paid.")], {
    actions: close => {
      const save = h("button.btn.primary", t("Save"));
      save.onclick = busy(save, async () => {
        if (!title.value.trim()) throw new Error("Write the bill name.");
        if (!(Number(amt.value) >= 0) || amt.value === "") throw new Error("Write the amount.");
        const row = { title: title.value.trim(), amount: Number(amt.value), category: cat.value, due_day: due.value ? Math.min(31, Math.max(1, Number(due.value))) : null, monthly: monthly.checked };
        if (b) await api.update("bills", `id=eq.${b.id}`, row); else await api.insert("bills", { ...row, user_id: api.userId(), start_month: m });
        toast("Saved ✓", "ok"); close(true); rerender();
      });
      const out = [h("button.btn", { onclick: () => close(null) }, t("Cancel")), save];
      if (b) {
        const stop = h("button.btn.danger", { "aria-label": "Remove bill" }, icon("trash"));
        stop.onclick = busy(stop, async () => {
          if (!(await confirmBox("Remove this bill?", "It won't show any more. Bills you already paid stay in your expenses.", "Remove", true))) return;
          await api.update("bills", `id=eq.${b.id}`, { active: false }); close(true); rerender();
        });
        out.unshift(stop);
      }
      return out;
    },
  });
}

async function overview(body, m, me) {
  const [rows, budgets, all] = await Promise.all([
    api.select("finance_entries", `select=kind,category,amount&entry_date=gte.${m}&entry_date=lte.${me}`),
    api.select("budgets", `select=*&month=eq.${m}`),
    api.select("finance_entries", "select=kind,amount"),
  ]);
  const inc = rows.filter(r => r.kind === "income").reduce((s, r) => s + +r.amount, 0);
  const exp = rows.filter(r => r.kind === "expense").reduce((s, r) => s + +r.amount, 0);
  const totalSaved = all.reduce((s, r) => s + (r.kind === "income" ? +r.amount : -r.amount), 0);
  body.append(h("div.grid3",
    h("div.stat", h("div.k", t("Income")), h("div.v.ok", tk(inc))),
    h("div.stat", h("div.k", t("Expense")), h("div.v.bad", tk(exp))),
    h("div.stat", h("div.k", "Saved this month"), h("div.v", tk(inc - exp)))));
  body.append(h("p.small.muted", { style: { margin: "8px 2px 14px" } }, `Total savings (all time): `, h("b", tk(totalSaved)), " = all income − all expenses."));
  if (m === monthStart(todayStr())) await dailyCard(body, m, me);
  await billsCard(body, m, inc - exp);

  // budgets
  const bmap = Object.fromEntries(budgets.map(b => [b.category, +b.amount]));
  const spent = {}; rows.filter(r => r.kind === "expense").forEach(r => spent[r.category] = (spent[r.category] || 0) + +r.amount);
  const cats = [...new Set([...expCats(), ...Object.keys(spent)])];
  const card = h("div.card", h("div.row.between", h("h3.mb0", "Monthly budget"), h("button.btn.small", { onclick: () => setBudgets(m, bmap) }, icon("edit"), "Set")));
  if (!budgets.length) card.append(h("p.hint.mt", "Set a budget for each category. Every expense is subtracted and you'll see how much is left."));
  cats.forEach(c => {
    const b = bmap[c] || 0, s = spent[c] || 0, left = b - s, p = b ? s / b : 0;
    card.append(h("div", { style: { margin: "12px 0" } },
      h("div.row.between.small", h("b", c), b ? h("span" + (left < 0 ? ".bad" : p > 0.8 ? ".warn" : ".muted"), left >= 0 ? `${tk(left)} left (${Math.round((1 - p) * 100)}%)` : `${tk(-left)} over budget`) : h("span.muted", tk(s) + " spent")),
      b ? h("div.bar" + (p > 1 ? ".bad" : p > 0.8 ? ".warn" : ""), { style: { marginTop: "6px" } }, h("i", { style: { width: Math.min(100, p * 100) + "%" } })) : null,
      b ? h("div.small.faint", { style: { marginTop: "3px" } }, `${tk(s)} of ${tk(b)} used`) : null));
  });
  body.append(card);
  if (exp) body.append(h("div.card", h("h3", "Where the money went"),
    donut(cats.filter(c => spent[c]).map((c, i) => ({ l: c, v: spent[c], c: catCol(c, i), fmt: tk(spent[c]) })), { center: tk(exp) })));
  body.append(h("div.list",
    h("a.li", { href: `#/money/entries/${m}` }, h("div.ic", icon("wallet")), h("div.grow", h("b", "All entries"), h("div.small.muted", "See, edit and check history")), icon("chev", "chev")),
    h("button.li", { onclick: fixedCosts }, h("div.ic", icon("routine")), h("div.grow", h("b", "Fixed monthly costs"), h("div.small.muted", "Rent, internet… added automatically")), icon("chev", "chev")),
    h("a.li", { href: "#/reports" }, h("div.ic", icon("report")), h("div.grow", h("b", "Make a report"), h("div.small.muted", "PDF with QR code to prove it's real")), icon("chev", "chev"))));
}

async function entries(body, m, me) {
  const rows = await api.select("finance_entries", `select=*&entry_date=gte.${m}&entry_date=lte.${me}&order=entry_date.desc,created_at.desc`);
  const locked = isLocked(m);
  body.append(h("p.small.muted", locked ? "🔒 This month is locked. Entries can only be viewed."
    : `✏️ Editable until ${lockAt(m).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. Every edit is saved in history.`));
  if (!rows.length) { body.append(h("div.card.empty", icon("wallet"), h("p", "No entries this month."), h("button.btn.primary", { onclick: () => addEntry() }, icon("plus"), "Add entry"))); return; }
  let last = "";
  const list = h("div.list");
  rows.forEach(r => {
    if (r.entry_date !== last) { last = r.entry_date; list.append(h("div.li.small.muted", { style: { minHeight: "36px", background: "var(--card2)" } }, fmtDate(r.entry_date, { weekday: "short", day: "numeric", month: "short" }))); }
    list.append(h("button.li", { onclick: () => entryDetail(r) },
      h("div.ic", { style: { color: r.kind === "income" ? "var(--green)" : "var(--red)" } }, icon(r.kind === "income" ? "download" : "wallet")),
      h("div.grow", h("b", r.note || r.category), h("div.small.muted", r.category, r.edit_count ? h("span.warn", ` · Edited ×${r.edit_count}${r.admin_edited ? " (Admin)" : ""}`) : null)),
      h("b" + (r.kind === "income" ? ".ok" : ""), (r.kind === "income" ? "+" : "−") + tk(r.amount))));
  });
  body.append(list);
}

async function entryDetail(r) {
  const [hist, reqs] = await Promise.all([
    api.select("finance_history", `select=*&entry_id=eq.${r.id}&order=edited_at`),
    api.select("edit_requests", `select=*&entry_id=eq.${r.id}&order=created_at.desc`).catch(() => []),
  ]);
  const locked = isLocked(r.entry_date);
  const pending = reqs.find(x => x.status === "pending");
  sheet(r.note || r.category, h("div",
    h("div.big" + (r.kind === "income" ? ".ok" : ""), (r.kind === "income" ? "+" : "−") + tk(r.amount)),
    h("p.muted", `${r.kind === "income" ? "Income" : "Expense"} · ${r.category} · ${fmtDate(r.entry_date, { day: "numeric", month: "long", year: "numeric" })}`),
    h("p.small", locked ? "🔒 Locked — only a special edit approved by the Admin can change it." : `✏️ Can be edited until ${lockAt(r.entry_date).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`),
    h("h3", { style: { fontSize: "15px", margin: "14px 0 6px" } }, "History"),
    h("div.small", h("div", `Created: ${tk(r.original_amount)} · ${new Date(r.created_at).toLocaleString("en-GB")}`),
      hist.map((x, i) => h("div", { style: { padding: "4px 0" } }, `${x.by_admin ? "Special edit" : "Edit " + (i + 1)}: ${tk(x.old_amount)} → ${tk(x.new_amount)} · ${new Date(x.edited_at).toLocaleString("en-GB")}${x.by_admin ? " · approved by Admin" : ""}`)),
      !hist.length ? h("div.faint", "Never edited.") : null),
    reqs.length ? [h("h3", { style: { fontSize: "15px", margin: "14px 0 6px" } }, "Special edit requests"),
      h("div.small", reqs.map(q => h("div", { style: { padding: "4px 0" } },
        h("span.badge" + (q.status === "approved" ? ".ok" : q.status === "rejected" ? ".bad" : ".warn"), q.status), ` ${tk(q.old_amount)} → ${tk(q.new_amount)} · “${q.reason}”`, q.admin_note ? ` · Admin: ${q.admin_note}` : "")))] : null), {
    actions: close => [h("button.btn", { onclick: () => close() }, "Close"),
      !locked ? h("button.btn.primary", { onclick: () => { close(); editEntry(r); } }, icon("edit"), "Edit")
        : !pending ? h("button.btn.primary", { onclick: () => { close(); requestEdit(r); } }, icon("edit"), "Request special edit") : null].filter(Boolean),
  });
}

async function requestEdit(r) {
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "0", step: "0.01", value: r.amount });
  const note = h("input.input", { value: r.note || "", maxlength: "120" });
  const why = h("textarea.input", { placeholder: "What went wrong, and why does it need to change?", maxlength: "500" });
  const ok = await sheet("Request special edit", [h("p.hint", "This entry is locked. Your request goes to the Admin. If approved, it's changed and marked “Special edit” in history and reports."),
    h("label.f", h("span", "Correct amount (৳)"), amt), h("label.f", h("span", "Note"), note), h("label.f", h("span", "Reason"), why)], {
    actions: close => [h("button.btn", { onclick: () => close(null) }, t("Cancel")), h("button.btn.primary", { onclick: () => close(true) }, "Send request")],
  });
  if (!ok) return;
  try { await api.rpc("request_edit", { p_entry: r.id, p_amount: Number(amt.value), p_note: note.value, p_reason: why.value }); toast("Request sent to the Admin ✓", "ok"); }
  catch (e) { toast(e.message, "bad"); }
}

async function editEntry(r) {
  // money edits always need the PIN — set one first if there is none
  if (!(await api.rpc("has_pin").catch(() => true))) { const { setPinFlow } = await import("./pin.js"); toast("আগে একটা PIN সেট করুন — টাকার এডিট PIN দিয়ে সুরক্ষিত থাকে"); if (!(await setPinFlow().catch(e => { toast(e.message, "bad"); return false; }))) return; }
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "0", step: "0.01", value: r.amount });
  const note = h("input.input", { value: r.note || "", maxlength: "120" });
  const ok = await sheet("Edit entry", [h("p.hint", "The old amount stays in history and every report will show “Edited”."),
    h("label.f", h("span", "Amount (৳)"), amt), h("label.f", h("span", "Note"), note)], {
    actions: close => [h("button.btn", { onclick: () => close(null) }, t("Cancel")), h("button.btn.primary", { onclick: () => close(true) }, t("Save"))],
  });
  if (!ok) return;
  const pin = await askPin("Enter your PIN to edit this money entry.");
  if (!pin) return;
  try { await api.rpc("edit_finance", { p_entry: r.id, p_amount: Number(amt.value), p_note: note.value, p_pin: pin }); toast("Saved. History updated ✓", "ok"); rerender(); }
  catch (e) { toast(e.message, "bad"); }
}

export function addEntry(kind = "expense") {
  let k = kind;
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "0", step: "0.01", placeholder: "0" });
  const cat = h("select.input");
  const fill = () => cat.replaceChildren(...(k === "income" ? incomeCats() : expCats()).map(c => h("option", c)));
  fill();
  const seg = h("div.seg", [["expense", t("Expense")], ["income", t("Income")]].map(([v, l]) => h("button" + (v === k ? ".on" : ""), { type: "button", onclick: e => { k = v; fill(); seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === e.target)); } }, l)));
  const date = h("input.input", { type: "date", value: todayStr(), max: todayStr(), min: firstOpenDate() });
  const note = h("input.input", { placeholder: "e.g. Rickshaw to campus", maxlength: "120" });
  return sheet("Add money entry", [h("label.f", h("span", "Type"), seg), h("label.f", h("span", "Amount (৳)"), amt), h("label.f", h("span", "Category"), cat),
    h("div.grid2", h("label.f", h("span", "Date"), date), h("label.f", h("span", "Note (optional)"), note))], {
    actions: close => {
      const save = h("button.btn.primary", t("Save"));
      save.onclick = busy(save, async () => {
        const a = Number(amt.value); if (!(a > 0)) throw new Error("Please write the amount.");
        const r = await api.offlineSafe({ kind: "insert", table: "finance_entries", rows: { user_id: api.userId(), kind: k, category: cat.value, amount: a, original_amount: a, note: note.value.trim() || null, entry_date: date.value } });
        toast(r?.queued ? "Saved offline — it will sync when you're online ✓" : "Saved ✓", "ok"); close(true); rerender();
      });
      return [h("button.btn", { onclick: () => close(null) }, t("Cancel")), save];
    },
  });
}

async function setBudgets(m, bmap) {
  const inputs = expCats().map(c => [c, h("input.input", { type: "number", inputmode: "decimal", min: "0", value: bmap[c] || "", placeholder: "0" })]);
  const ok = await sheet(`Budget · ${monthLabel(m)}`, [h("p.hint", "How much can you spend on each this month?"), inputs.map(([c, i]) => h("label.f", h("span", c + " (৳)"), i))], {
    actions: close => [h("button.btn", { onclick: () => close(null) }, t("Cancel")), h("button.btn.primary", { onclick: () => close(true) }, t("Save"))],
  });
  if (!ok) return;
  try { await api.upsert("budgets", inputs.map(([c, i]) => ({ user_id: api.userId(), month: m, category: c, amount: Number(i.value) || 0 })), "user_id,month,category"); toast("Budget saved ✓", "ok"); rerender(); }
  catch (e) { toast(e.message, "bad"); }
}

async function fixedCosts() {
  const rows = await api.select("recurring_costs", "select=*&order=day_of_month");
  const title = h("input.input", { placeholder: "e.g. House rent" });
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "0", placeholder: "0" });
  const cat = h("select.input", expCats().map(c => h("option", c)));
  const day = h("input.input", { type: "number", min: "1", max: "28", value: "1" });
  sheet("Fixed monthly costs", close => h("div",
    h("p.hint", "These are added to your expenses automatically every month on the day you choose."),
    rows.length ? h("div.list", rows.map(r => h("div.li", h("div.grow", h("b", r.title), h("div.small.muted", `${tk(r.amount)} · ${r.category} · every month on day ${r.day_of_month}`)),
      h("button.btn.small" + (r.active ? "" : ".ghost"), { onclick: async () => { await api.update("recurring_costs", `id=eq.${r.id}`, { active: !r.active }); toast(r.active ? "Paused" : "Turned on"); close(); fixedCosts(); } }, r.active ? "On" : "Off")))) : null,
    h("h3", { style: { fontSize: "15px" } }, "Add new"), h("label.f", h("span", "Name"), title),
    h("div.grid2", h("label.f", h("span", "Amount (৳)"), amt), h("label.f", h("span", "Day of month"), day)), h("label.f", h("span", "Category"), cat),
    (() => { const b = h("button.btn.primary.block", icon("plus"), "Add"); b.onclick = busy(b, async () => {
      if (!title.value.trim() || !(Number(amt.value) > 0)) throw new Error("Write a name and amount.");
      await api.insert("recurring_costs", { user_id: api.userId(), title: title.value.trim(), amount: Number(amt.value), category: cat.value, day_of_month: Math.min(28, Math.max(1, Number(day.value) || 1)) });
      await api.rpc("apply_recurring"); toast("Added ✓", "ok"); close(); rerender();
    }); return b; })()));
}

// ---------- tuition manager + attendance
async function tuition(body, m) {
  const today = todayStr();
  const me = monthEnd(m);
  const [students, pays, att, allPays] = await Promise.all([
    api.select("students", "select=*&active=eq.true&order=name"),
    api.select("tuition_payments", `select=*&month=eq.${m}`),
    api.select("attendance", `select=*&date=gte.${m}&date=lte.${me}`),
    api.select("tuition_payments", "select=student_id,month"),
  ]);
  const paidSet = Object.fromEntries(pays.map(p => [p.student_id, p]));
  // a month becomes due only after it ends: during November, October and before are due
  const cur = monthStart(today);
  const paidAll = new Set(allPays.map(p => p.student_id + p.month.slice(0, 7)));
  const dueMonths = st => { const out = []; for (let mo = monthStart(joinDay(st)); mo < cur; mo = shiftMonth(mo, 1)) if (!paidAll.has(st.id + mo.slice(0, 7))) out.push(mo); return out; };
  const due = students.reduce((a, st) => a + dueMonths(st).length * +st.monthly_fee, 0);
  const got = pays.reduce((a, p) => a + +p.amount, 0);
  body.append(h("div.grid2", h("div.stat", h("div.k", `Fees for ${monthLabel(m).split(" ")[0]} received`), h("div.v.ok", tk(got))), h("div.stat", h("div.k", "Due (past months)"), h("div.v.bad", tk(due)))));
  body.append(h("a.btn.primary.block.mt", { href: `#/payments/${m.slice(0, 4)}` }, icon("report"), "📊 All payments — sheet (like Excel)"));
  body.append(h("div.section-title", h("h2", "Students"), h("button.btn.small", { onclick: () => addStudent() }, icon("plus"), "Add student")));
  if (!students.length) { body.append(h("div.card.empty", icon("student"), h("p", "No students yet."), h("p.small", "Add students to track fees and attendance."))); return; }
  students.forEach(s => {
    const mine = att.filter(a => a.student_id === s.id);
    const present = mine.filter(a => a.present).length;
    const todayRec = mine.find(a => a.date === today);
    const p = paidSet[s.id];
    const payBtn = h("button.btn.small" + (p ? ".ghost" : ".primary"), p ? "✓ Paid" : "Mark paid");
    if (!p) payBtn.onclick = () => receivePayment(s, m);
    const attBtn = h("button.btn.small" + (todayRec?.present ? ".ghost" : ""), todayRec?.present ? "✓ Came today" : "Came today");
    attBtn.onclick = busy(attBtn, async () => {
      if (todayRec) await api.remove("attendance", `student_id=eq.${s.id}&date=eq.${today}`);
      else await api.insert("attendance", { user_id: api.userId(), student_id: s.id, date: today, present: true });
      rerender();
    });
    body.append(h("div.task", { style: { "--c": s.color, cursor: "pointer" }, onclick: e => { if (!e.target.closest("button")) location.hash = `#/student/${s.id}`; } }, h("div.grow",
      h("div.row.between", h("div.t", s.name, h("span.small.muted", "  · see graph ›")), h("span.dp", tk(s.monthly_fee) + "/mo")),
      h("div.meta", `Attendance this month: ${present} day${present === 1 ? "" : "s"}`, p ? h("span.ok", ` · paid ${tk(p.amount)}`) : m < cur ? h("span.bad", " · due") : m === cur ? h("span.muted", " · this month (not due yet)") : h("span.muted", " · advance"),
        dueMonths(s).length ? h("div.bad", `Due: ${dueMonths(s).map(x => monthLabel(x).split(" ")[0]).join(", ")}`) : null),
      h("div.acts", m === monthStart(today) ? attBtn : null, payBtn, h("button.btn.small.ghost", { onclick: async () => { if (await pinGate("student", "স্টুডেন্টের ফি/তথ্য বদলাতে PIN দিন")) addStudent(s); } }, icon("edit"))))));
  });
}

function addStudent(s = null) {
  const name = h("input.input", { value: s?.name || "", placeholder: "e.g. Leon" });
  const fee = h("input.input", { type: "number", inputmode: "decimal", value: s?.monthly_fee || "", placeholder: "0" });
  let color = s?.color || PALETTE[Math.floor(Math.random() * 8)];
  const colors = colorPicker(color, c => color = c);
  // only when adding: from which month, and which past months are still due (set once, then it runs by itself)
  const cur = monthStart(todayStr());
  const start = h("input.input", { type: "month", value: cur.slice(0, 7), max: cur.slice(0, 7) });
  const due = new Set();
  const monthsBox = h("div");
  const drawMonths = () => {
    const from = (start.value || cur.slice(0, 7)) + "-01";
    const list = []; for (let m = from; m < cur; m = shiftMonth(m, 1)) list.push(m);
    if (!list.length) { monthsBox.replaceChildren(h("p.small.muted", "Starts this month — nothing is due yet.")); return; }
    monthsBox.replaceChildren(h("p.small.muted", { style: { margin: "0 0 6px" } }, "Tap the months that are still DUE (not paid). The others count as already cleared."),
      h("div.row.wrap", { style: { gap: "6px" } }, list.map(m => h("button.btn.small" + (due.has(m) ? ".danger" : ""), { type: "button", style: due.has(m) ? { borderColor: "var(--red)" } : {}, onclick: () => { due.has(m) ? due.delete(m) : due.add(m); drawMonths(); } },
        monthLabel(m).split(" ")[0].slice(0, 3), " ", due.has(m) ? "· Due" : "· Cleared"))));
  };
  start.onchange = () => { [...due].forEach(m => { if (m < start.value + "-01") due.delete(m); }); drawMonths(); };
  drawMonths();
  const setup = s ? [] : [h("label.f", h("span", "Teaching since (month)"), start), monthsBox, h("p.hint", "⚠️ This is set once. After saving, months are added automatically and this can't be changed.")];
  return sheet(s ? "Edit student" : "Add student", [h("label.f", h("span", "Name"), name), h("label.f", h("span", "Monthly fee (৳)"), fee), ...setup, h("label.f", h("span", "Colour (used in the week chart)"), colors)], {
    actions: close => {
      const save = h("button.btn.primary", t("Save"));
      save.onclick = busy(save, async () => {
        if (!name.value.trim()) throw new Error("Write the student's name.");
        const row = { name: name.value.trim(), monthly_fee: Number(fee.value) || 0, color };
        if (s) await api.update("students", `id=eq.${s.id}`, row);
        else {
          const from = (start.value || cur.slice(0, 7)) + "-01";
          if (due.size && !(await confirmBox("Save student?", `Due months: ${[...due].sort().map(m => monthLabel(m).split(" ")[0]).join(", ") || "none"}. This can't be changed later.`, "Save"))) return;
          const r = await api.insert("students", { ...row, user_id: api.userId(), created_at: new Date(from + "T12:00:00+06:00").toISOString() });
          const sid = (Array.isArray(r) ? r[0] : r)?.id;
          const cleared = []; for (let m = from; m < cur; m = shiftMonth(m, 1)) if (!due.has(m)) cleared.push(m);
          if (sid && cleared.length) await api.insert("tuition_payments", cleared.map(m => ({ user_id: api.userId(), student_id: sid, month: m, amount: row.monthly_fee, cleared: true })));
        }
        toast("Saved ✓", "ok"); close(true); rerender();
      });
      const b = [h("button.btn", { onclick: () => close(null) }, t("Cancel")), save];
      if (s) b.unshift(h("button.btn.danger", { onclick: async () => { if (await confirmBox("Remove student?", "Old payments stay in your money history.", "Remove", true)) { await api.update("students", `id=eq.${s.id}`, { active: false }); close(true); rerender(); } } }, icon("trash")));
      return b;
    },
  });
}

// a paid box in the sheet: change the amount, or turn it back into "Due" — only while the month is open (until 30 days after the month ends)
function paidCell(st, p, e) {
  const open = e && !isLocked(e.entry_date);
  sheet(`${st.name} · ${monthLabel(p.month)}`, [h("p", "Paid ", h("b", tk(e ? e.amount : p.amount)), ` on ${fmtDate(p.paid_on)}`),
    h("p.hint", open ? "You can change this until 30 days after the month ends. All changes stay in the history." : "This month is locked now (30 days after the month ended). Use “Request special edit” in the entry to ask the Admin.")], {
    actions: close => {
      const out = [h("button.btn", { onclick: () => close(null) }, "Close")];
      if (e) out.push(h("button.btn", { onclick: () => { close(null); entryDetail(e); } }, open ? "Edit amount" : "Details"));
      if (open) {
        const undo = h("button.btn.danger", "Mark as Due");
        undo.onclick = busy(undo, async () => {
          if (!(await confirmBox("Mark as Due?", `${st.name}'s ${monthLabel(p.month)} fee goes back to Due and the income becomes ৳0 (kept in history).`, "Mark as Due", true))) return;
          const pin = await askPin("Enter your PIN"); if (!pin) return;
          await api.rpc("edit_finance", { p_entry: e.id, p_amount: 0, p_note: (e.note || "") + " — marked as due again", p_pin: pin });
          await api.remove("tuition_payments", `id=eq.${p.id}`);
          toast("Marked as Due ✓", "ok"); close(true); rerender();
        });
        out.push(undo);
      }
      return out;
    },
  });
}

// count a student's fees from an earlier month (only months still open: until 30 days after the month ends)
async function markDueEarlier(st, mo) {
  if (isLocked(mo)) { toast("This month is locked now.", "bad"); return; }
  if (!(await confirmBox(`Mark ${monthLabel(mo)} as Due?`, `${st.name}'s fee (${tk(st.monthly_fee)}) for ${monthLabel(mo)} will show as Due. Fees are then counted from ${monthLabel(mo).split(" ")[0]}.`, "Mark as Due"))) return;
  try { await api.update("students", `id=eq.${st.id}`, { created_at: new Date(mo + "T12:00:00+06:00").toISOString() }); toast("Marked as Due ✓", "ok"); rerender(); }
  catch (e) { toast(e.message, "bad"); }
}

// ---------- dues + savings goals
async function plans(body) {
  const [dues, goals, all] = await Promise.all([
    api.select("dues", "select=*&order=settled,created_at.desc"),
    api.select("savings_goals", "select=*&order=created_at"),
    api.select("finance_entries", "select=kind,amount"),
  ]);
  const saved = all.reduce((s, r) => s + (r.kind === "income" ? +r.amount : -r.amount), 0);
  const theyOwe = dues.filter(d => !d.settled && d.direction === "they_owe").reduce((s, d) => s + +d.amount, 0);
  const iOwe = dues.filter(d => !d.settled && d.direction === "i_owe").reduce((s, d) => s + +d.amount, 0);

  body.append(h("div.section-title", h("h2", "Dues (বাকির খাতা)"), h("button.btn.small", { onclick: addDue }, icon("plus"), "Add")));
  body.append(h("div.grid2", h("div.stat", h("div.k", "Others owe me"), h("div.v.ok", tk(theyOwe))), h("div.stat", h("div.k", "I owe"), h("div.v.bad", tk(iOwe)))));
  if (dues.length) body.append(h("div.list.mt", dues.map(d => h("div.li", { style: { opacity: d.settled ? 0.5 : 1 } },
    h("div.grow", h("b", d.person), h("div.small.muted", d.direction === "they_owe" ? "owes me" : "I owe", d.note ? ` · ${d.note}` : "")),
    h("b" + (d.direction === "they_owe" ? ".ok" : ".bad"), tk(d.amount)),
    h("button.btn.small" + (d.settled ? ".ghost" : ""), { onclick: async () => { await api.update("dues", `id=eq.${d.id}`, { settled: !d.settled }); rerender(); } }, d.settled ? "Undo" : "Settled")))));

  body.append(h("div.section-title", h("h2", "Savings goals"), h("button.btn.small", { onclick: addGoal }, icon("plus"), "Add")));
  if (!goals.length) body.append(h("div.card.small.muted", "Example: “Microphone — ৳5,000 by December”. Progress uses your total savings."));
  goals.forEach(g => {
    const p = Math.max(0, Math.min(1, saved / g.target));
    body.append(h("div.card", h("div.row.between", h("b", g.title), h("span.small.muted", g.deadline ? "by " + fmtDate(g.deadline, { day: "numeric", month: "short", year: "numeric" }) : "")),
      h("div.bar.mt", h("i", { style: { width: p * 100 + "%" } })),
      h("div.row.between.small.mt", h("span.muted", `${tk(Math.max(0, saved))} of ${tk(g.target)}`), h("b", Math.round(p * 100) + "%")),
      h("button.linkbtn.small", { onclick: async () => { if (await confirmBox("Delete goal?", g.title, "Delete", true)) { await api.remove("savings_goals", `id=eq.${g.id}`); rerender(); } } }, "Delete")));
  });
}
function addDue() {
  const person = h("input.input", { placeholder: "e.g. Rafi" });
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "0" });
  const note = h("input.input", { placeholder: "optional" });
  let dir = "they_owe";
  const seg = h("div.seg", [["they_owe", "They owe me"], ["i_owe", "I owe them"]].map(([v, l]) => h("button" + (v === dir ? ".on" : ""), { type: "button", onclick: e => { dir = v; seg.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === e.target)); } }, l)));
  sheet("Add due", [h("label.f", h("span", "Who?"), person), seg, h("div.mt", h("label.f", h("span", "Amount (৳)"), amt)), h("label.f", h("span", "Note"), note)], {
    actions: close => { const s = h("button.btn.primary", t("Save")); s.onclick = busy(s, async () => {
      if (!person.value.trim() || !(Number(amt.value) > 0)) throw new Error("Write a name and amount.");
      await api.insert("dues", { user_id: api.userId(), person: person.value.trim(), amount: Number(amt.value), direction: dir, note: note.value || null }); close(true); rerender(); });
      return [h("button.btn", { onclick: () => close(null) }, t("Cancel")), s]; },
  });
}
function addGoal() {
  const title = h("input.input", { placeholder: "e.g. New microphone" });
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "1" });
  const dl = h("input.input", { type: "date", min: todayStr() });
  sheet("Add savings goal", [h("label.f", h("span", "Goal"), title), h("div.grid2", h("label.f", h("span", "Target (৳)"), amt), h("label.f", h("span", "By (optional)"), dl))], {
    actions: close => { const s = h("button.btn.primary", t("Save")); s.onclick = busy(s, async () => {
      if (!title.value.trim() || !(Number(amt.value) > 0)) throw new Error("Write the goal and target.");
      await api.insert("savings_goals", { user_id: api.userId(), title: title.value.trim(), target: Number(amt.value), deadline: dl.value || null }); close(true); rerender(); });
      return [h("button.btn", { onclick: () => close(null) }, t("Cancel")), s]; },
  });
}

// ---------- receive tuition fee: choose which month(s) the money is for
export async function receivePayment(s, preMonth) {
  const today = todayStr();
  const cur = monthStart(today);
  const paid = new Set((await api.select("tuition_payments", `select=month&student_id=eq.${s.id}`)).map(x => x.month.slice(0, 7)));
  const months = [...Array(8)].map((_, i) => shiftMonth(cur, i - 6)).filter(x => !paid.has(x.slice(0, 7)) && x >= monthStart(joinDay(s))); // last 3 months (or since joined) … next month
  if (!months.length) { toast("All recent months are already paid."); return; }
  const pick = new Set([preMonth && months.includes(preMonth) ? preMonth : (months.filter(x => x < cur).pop() || months[0])]);
  const amounts = {};
  const box = h("div");
  const total = h("b");
  const draw = () => {
    box.replaceChildren(...months.map(mo => {
      const on = pick.has(mo);
      const inp = h("input.input", { type: "number", inputmode: "decimal", min: "0", value: amounts[mo] ?? s.monthly_fee, style: { width: "120px", minHeight: "38px" }, oninput: e => { amounts[mo] = e.target.value; sum(); } });
      return h("div.row.between", { style: { padding: "6px 0", borderBottom: "1px solid var(--line)" } },
        h("label.check", { style: { margin: 0, alignItems: "center" } },
          h("input", { type: "checkbox", checked: on, onchange: e => { e.target.checked ? pick.add(mo) : pick.delete(mo); draw(); } }),
          h("span", monthLabel(mo), mo < cur ? h("span.small.bad", " · due") : mo === cur ? h("span.small.muted", " · this month, not due yet") : h("span.small.muted", " · advance"))),
        on ? inp : h("span.small.faint", "—"));
    }));
    sum();
  };
  const sum = () => { total.textContent = tk([...pick].reduce((a, mo) => a + (Number(amounts[mo] ?? s.monthly_fee) || 0), 0)); };
  draw();
  const ok = await sheet(`Receive fee · ${s.name}`, [
    h("p.hint", "Tick the month(s) this money is for. Paying for two months together? Tick both. It's added to today's income."),
    box, h("div.row.between.mt", h("span.muted", "Total received today"), total)], {
    actions: close => [h("button.btn", { onclick: () => close(null) }, t("Cancel")), h("button.btn.primary", { onclick: () => close(true) }, "Save")] });
  if (!ok) return;
  if (!pick.size) { toast("Tick at least one month.", "bad"); return; }
  try {
    for (const mo of [...pick].sort()) await api.rpc("record_tuition_payment", { p_student: s.id, p_month: mo, p_amount: Number(amounts[mo] ?? s.monthly_fee) || 0 });
    toast(`Saved for ${[...pick].sort().map(x => monthLabel(x).split(" ")[0]).join(" + ")} ✓ added to income`, "ok"); rerender();
  } catch (e) { toast(e.message, "bad"); }
}

// ---------- one student: money and attendance month by month
route("student", async (page, id) => {
  const [rows, pays, att] = await Promise.all([
    api.select("students", `select=*&id=eq.${id}`),
    api.select("tuition_payments", `select=*&student_id=eq.${id}&order=month`),
    api.select("attendance", `select=date,present&student_id=eq.${id}&order=date`),
  ]);
  const s = rows[0];
  if (!s) throw new Error("Student not found.");
  page.append(backbar(s.name, "#/money/tuition", h("div.row", h("button.btn.small.primary", { onclick: () => receivePayment(s) }, icon("money"), "Receive fee"), h("button.icon-btn", { "aria-label": "Edit student", onclick: async () => { if (await pinGate("student", "স্টুডেন্টের ফি/তথ্য বদলাতে PIN দিন")) addStudent(s); } }, icon("edit")))));
  // last 12 months
  const today = todayStr();
  const months = [...Array(12)].map((_, i) => shiftMonth(monthStart(today), i - 11));
  const paid = Object.fromEntries(pays.map(p => [p.month.slice(0, 7), p.cleared ? 0 : +p.amount]));
  const settled = new Set(pays.map(p => p.month.slice(0, 7)));
  const days = {}; att.filter(a => a.present).forEach(a => days[a.date.slice(0, 7)] = (days[a.date.slice(0, 7)] || 0) + 1);
  const firstM = [pays[0]?.month, att[0]?.date, joinDay(s)].filter(Boolean).sort()[0]?.slice(0, 7) || today.slice(0, 7);
  const shown = months.filter(m => m.slice(0, 7) >= firstM);
  const lbl = m => new Date(m + "T00:00:00").toLocaleDateString("en-GB", { month: "short" });
  const total = pays.reduce((a, p) => a + (p.cleared ? 0 : +p.amount), 0);
  const unpaid = shown.filter(m => !settled.has(m.slice(0, 7)) && m.slice(0, 7) < today.slice(0, 7) && m >= monthStart(joinDay(s))).length;
  const thisM = today.slice(0, 7);
  const last = shown.length > 1 ? paid[shown[shown.length - 2].slice(0, 7)] || 0 : 0;
  const cur = paid[thisM] || 0;

  page.append(h("div.grid3",
    h("div.stat", h("div.k", "Total received"), h("div.v.ok", tk(total))),
    h("div.stat", h("div.k", "Monthly fee"), h("div.v", tk(s.monthly_fee))),
    h("div.stat", h("div.k", "Days taught (this month)"), h("div.v", days[thisM] || 0))));
  page.append(h("p.small.muted", { style: { margin: "8px 2px 10px" } },
    unpaid ? h("span.warn", `${unpaid} past month${unpaid > 1 ? "s" : ""} not paid. `) : "All past months paid. ",
    cur && last ? (cur > last ? `Up ${tk(cur - last)} from last month.` : cur < last ? `Down ${tk(last - cur)} from last month.` : "Same as last month.") : ""));
  page.append(h("div.card", h("h3", "Money received by month"),
    barChart(shown.map(m => ({ l: lbl(m), v: paid[m.slice(0, 7)] || 0, c: s.color })), { fmt: tk }),
    h("p.hint.mb0", "Empty bar = not paid that month.")));
  page.append(h("div.card", h("h3", "Days taught by month"),
    barChart(shown.map(m => ({ l: lbl(m), v: days[m.slice(0, 7)] || 0 })), { color: "var(--cyan)" }),
    h("p.hint.mb0", "Counted automatically when a tuition task with this student is marked Completed, or when you tap “Came today”.")));
  page.append(h("div.section-title", h("h2", "Month by month")));
  page.append(h("div.list", shown.slice().reverse().map(m => {
    const k = m.slice(0, 7), p = pays.find(x => x.month.slice(0, 7) === k);
    return h("div.li", h("div.grow", h("b", new Date(m + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })),
      h("div.small.muted", `${days[k] || 0} day${days[k] === 1 ? "" : "s"} taught`, p ? ` · paid on ${fmtDate(p.paid_on)}` : "")),
      p ? h("b.ok", tk(p.amount)) : k < thisM ? h("span.badge.bad", "Due") : h("span.badge", "This month"));
  })));
}, { tab: "money" });

// ---------- all tuition payments as a sheet: students × months
route("payments", async (page, yr) => {
  const today = todayStr(), cur = monthStart(today);
  const year = Number(yr) || Number(today.slice(0, 4));
  if (!(await pinGate("sheet", "পুরো টিউশন শিট দেখতে PIN দিন"))) { page.append(backbar("All payments", "#/money/tuition"), lockedCard(() => rerender())); return; }
  page.append(backbar("All payments", "#/money/tuition", h("div.row",
    h("a.icon-btn", { href: `#/payments/${year - 1}`, "aria-label": "Previous year" }, icon("back")), h("b", year),
    h("a.icon-btn", { href: `#/payments/${year + 1}`, "aria-label": "Next year" }, icon("chev")))));
  const [students, pays, entries] = await Promise.all([
    api.select("students", "select=*&order=name"),
    api.select("tuition_payments", `select=*&month=gte.${year}-01-01&month=lte.${year}-12-01`),
    api.select("finance_entries", `select=id,amount,original_amount,edit_count,admin_edited,entry_date,created_at,note,kind,category&source=eq.tuition&entry_date=gte.${year - 1}-12-01&entry_date=lte.${year + 1}-01-31`),
  ]);
  const ent = Object.fromEntries(entries.map(e => [e.id, e]));
  const months = [...Array(12)].map((_, i) => `${year}-${pad(i + 1)}-01`);
  const startOf = st => monthStart(joinDay(st));
  const list = students.filter(st => st.active || pays.some(p => p.student_id === st.id));
  const amountOf = p => p.cleared ? 0 : +(ent[p.finance_entry_id]?.amount ?? p.amount);

  // money that came in (by the day it was entered)
  const thisMonthIncome = entries.filter(e => e.entry_date.slice(0, 7) === today.slice(0, 7)).reduce((a, e) => a + +e.amount, 0);
  const yearIncome = entries.filter(e => e.entry_date.slice(0, 4) === String(year)).reduce((a, e) => a + +e.amount, 0);
  let dueTotal = 0, dueCount = 0;
  list.forEach(st => months.forEach(mo => { if (st.active && mo < cur && mo >= startOf(st) && !pays.some(p => p.student_id === st.id && p.month === mo)) { dueTotal += +st.monthly_fee; dueCount++; } }));
  page.append(h("div.grid3",
    h("div.stat", h("div.k", "Tuition income · " + new Date(cur + "T00:00:00").toLocaleDateString("en-GB", { month: "long" })), h("div.v.ok", tk(thisMonthIncome))),
    h("div.stat", h("div.k", `Total in ${year}`), h("div.v", tk(yearIncome))),
    h("div.stat", h("div.k", `Due (${dueCount} month${dueCount === 1 ? "" : "s"})`), h("div.v.bad", tk(dueTotal)))));
  page.append(h("p.small.muted", { style: { margin: "8px 2px" } }, "Income counts in the month you enter it. Each box shows which month's fee is paid. ",
    h("span", { style: { color: "var(--green)" } }, "■ paid"), "  ", h("span", { style: { color: "var(--red)" } }, "■ due"), "  ", h("span.muted", "■ this month (not due yet)"), " · tap a box."));

  if (!list.length) { page.append(h("div.card.empty", icon("student"), h("p", "No students yet."))); return; }
  const cell = (st, mo) => {
    const p = pays.find(x => x.student_id === st.id && x.month === mo);
    const base = { padding: "6px 4px", borderRadius: "8px", textAlign: "center", fontSize: "12px", fontWeight: 600, minWidth: "64px", cursor: "pointer", border: "1px solid" };
    if (p && p.cleared) return h("td", { style: { padding: "0 3px" } }, h("div", { style: { ...base, cursor: "default", color: "var(--muted)", borderColor: "var(--line2)" }, title: "Cleared before using the app" }, "✓ cleared"));
    if (p) {
      const e = ent[p.finance_entry_id];
      return h("td", { style: { padding: "0 3px" } }, h("div", { style: { ...base, color: "var(--green)", borderColor: "color-mix(in srgb, var(--green) 55%, transparent)", background: "color-mix(in srgb, var(--green) 12%, transparent)" },
        title: `Paid on ${fmtDate(p.paid_on)}`, onclick: () => paidCell(st, p, e) }, tk(amountOf(p)).replace("৳", "৳ "), e?.edit_count ? " ✎" : ""));
    }
    // a past month before the student's start, still open for editing → can be marked as Due
    if (st.active && mo < startOf(st) && mo < cur && !isLocked(mo)) return h("td", { style: { padding: "0 3px" } }, h("div", { style: { ...base, color: "var(--muted)", borderColor: "var(--line2)", borderStyle: "dashed" }, title: "Tap to mark this month as Due", onclick: () => markDueEarlier(st, mo) }, "＋ Due"));
    if (!st.active || mo < startOf(st) || mo > cur) return h("td", { style: { padding: "0 3px" } }, h("div", { style: { ...base, cursor: "default", color: "var(--faint)", borderColor: "transparent" } }, "·"));
    const isDue = mo < cur;
    return h("td", { style: { padding: "0 3px" } }, h("div", { style: isDue
        ? { ...base, color: "var(--red)", borderColor: "color-mix(in srgb, var(--red) 60%, transparent)", background: "color-mix(in srgb, var(--red) 13%, transparent)" }
        : { ...base, color: "var(--muted)", borderColor: "var(--line2)", borderStyle: "dashed" },
      onclick: () => receivePayment(st, mo) }, isDue ? "Due" : "Running"));
  };
  const lbl = mo => new Date(mo + "T00:00:00").toLocaleDateString("en-GB", { month: "short" });
  const colTotal = mo => pays.filter(p => p.month === mo).reduce((a, p) => a + amountOf(p), 0);
  const rowTotal = st => pays.filter(p => p.student_id === st.id).reduce((a, p) => a + amountOf(p), 0);
  const grand = pays.reduce((a, p) => a + amountOf(p), 0);
  const totStyle = { textAlign: "right", fontSize: "12.5px", fontWeight: 700, padding: "0 8px 0 10px", whiteSpace: "nowrap" };
  const th = { position: "sticky", left: 0, background: "var(--card)", zIndex: 1, textAlign: "left", padding: "6px 10px 6px 6px", whiteSpace: "nowrap", boxShadow: "6px 0 8px -6px rgba(0,0,0,.5)" };
  const table = h("table", { style: { borderCollapse: "separate", borderSpacing: "0 4px", fontSize: "13px" } },
    h("thead", h("tr", h("th", { style: th }, "Student"), months.map(mo => h("th", { style: { color: mo === cur ? "var(--brand)" : "var(--muted)", fontWeight: 600, fontSize: "12px" } }, lbl(mo))), h("th", { style: { ...totStyle, color: "var(--muted)", fontWeight: 600 } }, "Total"))),
    h("tbody",
      list.map(st => h("tr", h("th", { style: th }, h("a", { href: `#/student/${st.id}`, style: { color: "var(--text)" } }, h("i", { style: { display: "inline-block", width: "9px", height: "9px", borderRadius: "3px", background: st.color, marginRight: "6px" } }), st.name),
        h("div.small.faint", { style: { fontWeight: 400 } }, tk(st.monthly_fee) + "/mo", st.active ? "" : " · left")), months.map(mo => cell(st, mo)), h("td", { style: totStyle }, rowTotal(st) ? tk(rowTotal(st)) : "—"))),
      h("tr", h("th", { style: { ...th, paddingTop: "10px" } }, "Received"), months.map(mo => h("td", { style: { textAlign: "center", fontSize: "12px", fontWeight: 700, paddingTop: "10px" } }, colTotal(mo) ? tk(colTotal(mo)) : "—")), h("td", { style: { ...totStyle, paddingTop: "10px", color: "var(--green)" } }, tk(grand)))));
  const wrap = h("div.card", { style: { padding: "4px 8px 4px 0", overflowX: "auto" } }, table);
  page.append(wrap);
  setTimeout(() => { const i = Number(today.slice(5, 7)) - 1; if (String(year) === today.slice(0, 4)) wrap.scrollLeft = Math.max(0, i * 70 - 160); }, 50);
  // download the same sheet for Excel / Google Sheets
  const dl = h("button.btn.small.mt", icon("download"), "Download for Excel");
  dl.onclick = () => {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Name", ...months.map(lbl), "Total"]];
    list.forEach(st => rows.push([st.name + (st.active ? "" : " (left)"), ...months.map(mo => { const p = pays.find(x => x.student_id === st.id && x.month === mo); return p ? amountOf(p) : ""; }), rowTotal(st)]));
    rows.push(["Monthly Total", ...months.map(colTotal), grand]);
    const blob = new Blob(["\ufeff" + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Tuitions-${year}.csv`; a.click();
  };
  page.append(dl);
  page.append(h("p.hint", "“Received” row = fees for that month, whenever they were paid. Edit a paid box within the edit window (until 30 days after the month ends); after that it's locked and the history stays."));
}, { tab: "money" });

// ---------- daily small spending: fare, food, tea, cigarettes… one tap, then the amount
const DAILY = [["🚌", "ভাড়া / Fare", "Transport"], ["🍞", "খাবার / Food", "Food"], ["☕", "চা-নাস্তা / Snacks", "Food"], ["🚬", "সিগারেট / Smoke", "Other"], ["📱", "রিচার্জ / Recharge", "Bills"], ["🛍️", "কেনাকাটা / Shopping", "Shopping"], ["🎮", "আড্ডা-বিনোদন / Fun", "Fun"], ["💸", "হুদাই খরচ / Wasted", "Other"]];
async function dailyCard(body, m, me) {
  const today = todayStr();
  const labels = DAILY.map(d => d[1]);
  const rows = await api.select("finance_entries", `select=amount,note,entry_date&kind=eq.expense&entry_date=gte.${m}&entry_date=lte.${me}`).catch(() => []);
  const itemOf = r => labels.find(l => (r.note || "").startsWith(l));
  const todaySum = rows.filter(r => r.entry_date === today).reduce((s, r) => s + +r.amount, 0);
  const byItem = {}; rows.forEach(r => { const l = itemOf(r); if (l) byItem[l] = (byItem[l] || 0) + +r.amount; });
  const card = h("div.card",
    h("div.row.between", h("h3.mb0", "Daily spending"), h("span.small.muted", "Today ", h("b", { style: { color: "var(--text)" } }, tk(todaySum)))),
    h("div.daily-grid", DAILY.map(([ic, label, cat]) => {
      const b = h("button.daily-btn", { type: "button" }, h("span.ic", ic), h("span.l", label.split(" / ")[0]), byItem[label] ? h("span.v", tk(byItem[label])) : null);
      b.onclick = () => quickSpend(ic, label, cat);
      return b;
    })),
    h("p.small.muted.mb0", { style: { marginTop: "8px" } }, "Tap one, write the amount — it's saved as today's expense. The small number is this month's total."));
  body.append(card);
}
function quickSpend(ic, label, cat) {
  const amt = h("input.input", { type: "number", inputmode: "decimal", min: "1", placeholder: "৳", style: { fontSize: "22px", textAlign: "center" } });
  const note = h("input.input", { placeholder: "Note (optional)", maxlength: "60" });
  sheet(`${ic} ${label.split(" / ")[0]}`, [h("label.f", h("span", "How much? (৳)"), amt), h("label.f", h("span", "Note"), note)], {
    actions: close => {
      const save = h("button.btn.primary", "Save");
      const go = busy(save, async () => {
        const v = Number(amt.value); if (!(v > 0)) throw new Error("Write the amount.");
        await api.insert("finance_entries", { user_id: api.userId(), kind: "expense", category: expCats().includes(cat) ? cat : "Other", amount: v, note: note.value.trim() ? `${label} — ${note.value.trim()}`.slice(0, 120) : label, entry_date: todayStr() });
        toast(`${tk(v)} saved ✓`, "ok"); close(true); rerender();
      });
      save.onclick = go;
      amt.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      return [h("button.btn", { onclick: () => close(null) }, "Cancel"), save];
    },
  });
}
