// My Lifestyle — Exams: class tests, lab reports, assignments. Reminders get more frequent as the day comes.
import * as api from "./api.js";
import { h, icon, toast, sheet, busy, confirmBox, todayStr, addDays, fmtDate, pad } from "./ui.js";
import { route, rerender, store, myRoles } from "./app.js";

export const EXAM_KINDS = {
  ct: ["📝", "CT"], lab: ["🧪", "Lab report"], assignment: ["📄", "Assignment"], exam: ["🎓", "Exam"],
  paper: ["🖨️", "Question paper"], checking: ["✍️", "Script checking"], result: ["📊", "Result submit"],
  delivery: ["📦", "Delivery"], payment: ["💰", "Payment"], meeting: ["🤝", "Meeting"],
  report: ["📑", "Report"], presentation: ["📽️", "Presentation"],
  appointment: ["🩺", "Appointment"], fee: ["🏫", "School fee"], shopping: ["🛒", "Shopping"], occasion: ["🎉", "Occasion"],
  other: ["📌", "Other"],
};
// each kind of person gets the deadlines that fit their day
const ROLE_DEADLINES = {
  school: { tab: "📝 Exams", sub: "Class tests & exams", add: "Add CT / exam", kinds: ["ct", "exam", "assignment", "other"], eg: "e.g. Physics CT — chapter 3" },
  student: { tab: "📝 Exams", sub: "CT, lab reports & exams", add: "Add CT / lab report / exam", kinds: ["ct", "lab", "assignment", "exam", "presentation", "other"], eg: "e.g. CT-2: Kinematics" },
  teacher: { tab: "📋 Exam work", sub: "Question papers, checking & results", add: "Add exam work", kinds: ["paper", "checking", "result", "exam", "meeting", "other"], eg: "e.g. Class 9 Physics question paper" },
  business: { tab: "📦 Deadlines", sub: "Deliveries, payments & meetings", add: "Add deadline", kinds: ["delivery", "payment", "meeting", "report", "other"], eg: "e.g. 50 pcs order to Rahim Traders" },
  job: { tab: "📌 Deadlines", sub: "Reports, meetings & presentations", add: "Add deadline", kinds: ["report", "meeting", "presentation", "exam", "other"], eg: "e.g. Monthly sales report" },
  homemaker: { tab: "🗓️ Reminders", sub: "Appointments, fees & occasions", add: "Add reminder", kinds: ["appointment", "fee", "payment", "shopping", "occasion", "other"], eg: "e.g. Doctor appointment — Ammu" },
};
export const deadlines = () => {
  const rs = myRoles().map(k => ROLE_DEADLINES[k]).filter(Boolean);
  if (!rs.length) return ROLE_DEADLINES.student;
  if (rs.length === 1) return rs[0];
  return { tab: "📌 Deadlines", sub: rs.map(r => r.sub).join(" · "), add: "Add deadline", kinds: [...new Set(rs.flatMap(r => r.kinds.filter(k => k !== "other")))].concat("other"), eg: rs[0].eg };
};
const isStudy = () => myRoles().some(k => ["student", "school", "teacher"].includes(k)) || !myRoles().length;
const when = iso => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka" });
export function leftLabel(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return "Time over";
  const hrs = ms / 3600e3;
  if (hrs < 1) return `${Math.max(1, Math.round(ms / 60000))} min left`;
  if (hrs < 48) return `${Math.floor(hrs)}h left`;
  return `${Math.floor(hrs / 24)} days left`;
}
const urgency = iso => { const hrs = (new Date(iso) - Date.now()) / 3600e3; return hrs <= 24 ? "var(--red)" : hrs <= 72 ? "var(--amber)" : "var(--brand)"; };

export async function upcomingExams(days = 3) {
  try { return await api.select("exams", `select=*&done=eq.false&due_at=gt.${new Date().toISOString()}&due_at=lt.${new Date(Date.now() + days * 864e5).toISOString()}&order=due_at`); } catch { return []; }
}
// Today page: small rows inside the shared box
export async function examRows() {
  const list = await upcomingExams(3);
  return list.slice(0, 3).map(e => ({ ic: EXAM_KINDS[e.kind][0], title: e.title, sub: [EXAM_KINDS[e.kind][1], e.course].filter(Boolean).join(" · "), left: leftLabel(e.due_at).replace(" left", ""), color: urgency(e.due_at) }));
}
// Today page: what is due in the next 3 days
export async function examsCard() {
  const list = await upcomingExams(3);
  if (!list.length) return null;
  return h("a.card.exams-card", { href: "#/exams" },
    list.slice(0, 3).map(e => h("div.row.between", { style: { gap: "8px", padding: "3px 0" } },
      h("span.ell", EXAM_KINDS[e.kind][0], " ", h("b", e.title), e.course ? h("span.muted", " · ", e.course) : null),
      h("span.small", { style: { color: urgency(e.due_at), whiteSpace: "nowrap", fontWeight: 600 } }, leftLabel(e.due_at)))),
    list.length > 3 ? h("div.small.muted", `+${list.length - 3} more`) : null);
}

route("exams", async page => {
  const { routineTabsAsync } = await import("./timetable.js");
  const R = deadlines();
  page.append(h("header.topbar", h("div", h("h1", "Routine"), h("div.sub", R.sub))), await routineTabsAsync("exams"));
  const all = await api.select("exams", "select=*&order=due_at");
  const now = Date.now();
  const open = all.filter(e => !e.done && new Date(e.due_at) > now), past = all.filter(e => e.done || new Date(e.due_at) <= now).reverse().slice(0, 15);
  page.append(h("div.grid2", { style: { gap: "8px" } },
    h("button.btn.primary", { onclick: () => examSheet() }, icon("plus"), R.add),
    h("button.btn", { onclick: () => import("./assistant.js").then(m => m.askSheet({ photo: true, text: "এই ছবি দেখে সব CT / ল্যাব রিপোর্ট / পরীক্ষা / ডেডলাইন তারিখ-সময় সহ যোগ করো" })) }, "📷 From a photo (AI)")));
  const row = e => h("button.li", { onclick: () => examSheet(e), style: { textAlign: "left", opacity: e.done ? .6 : 1 } },
    h("div.ic", EXAM_KINDS[e.kind][0]),
    h("div.grow", { style: { minWidth: 0 } }, h("b", { style: { textDecoration: e.done ? "line-through" : "" } }, e.title), h("div.small.muted", [EXAM_KINDS[e.kind][1], e.course, when(e.due_at)].filter(Boolean).join(" · "))),
    e.done ? h("span.badge.ok", "Done") : h("span.small", { style: { color: urgency(e.due_at), fontWeight: 600, whiteSpace: "nowrap" } }, leftLabel(e.due_at)));
  page.append(h("div.section-title", h("h2", "Coming up")));
  page.append(open.length ? h("div.list", open.map(row)) : h("div.card.empty", h("p", "Nothing due right now.")));
  page.append(h("p.hint.mt", "Reminders: daily → twice a day in the last week → 3 times in the last 3 days → every 3 hours in the last 2 days → every 2 hours on the last day → every hour in the last 3 hours."));
  if (past.length) page.append(h("div.section-title", h("h2", "Done & past")), h("div.list", past.map(row)));
}, { tab: "week" });

function examSheet(e) {
  const R = deadlines();
  let kind = e?.kind || R.kinds[0];
  const seg = h("div.row.wrap", { style: { gap: "6px" } });
  const drawSeg = () => seg.replaceChildren(...Object.entries(EXAM_KINDS).filter(([k]) => R.kinds.includes(k) || k === kind).map(([k, [ic, l]]) => h("button.chip" + (k === kind ? ".on" : ""), { type: "button", onclick: () => { kind = k; drawSeg(); } }, ic, " ", l)));
  drawSeg();
  const d0 = e ? new Date(new Date(e.due_at).getTime() + 6 * 3600e3) : null;
  const title = h("input.input", { value: e?.title || "", placeholder: R.eg, maxlength: "120" });
  const course = h("input.input", { value: e?.course || "", placeholder: "optional", maxlength: "60" });
  const date = h("input.input", { type: "date", value: d0 ? d0.toISOString().slice(0, 10) : addDays(todayStr(), 3) });
  const time = h("input.input", { type: "time", value: d0 ? `${pad(d0.getUTCHours())}:${pad(d0.getUTCMinutes())}` : "10:00" });
  const note = h("textarea.input", { placeholder: myRoles().some(k => ["student", "school"].includes(k)) ? "Syllabus, chapters… (optional)" : "Details (optional)", style: { minHeight: "56px" } }, e?.note || "");
  sheet(e ? "Edit" : R.add, [
    h("label.f", h("span", "Type"), seg), h("label.f", h("span", "Title"), title), isStudy() ? h("label.f", h("span", myRoles()[0] === "teacher" ? "Class / subject" : "Course"), course) : h("label.f", h("span", "With / where (optional)"), course),
    h("div.grid2", h("label.f", h("span", "Due date"), date), h("label.f", h("span", "Time"), time)),
    h("label.f", h("span", "Notes"), note)], {
    actions: close => {
      const save = h("button.btn.primary", "Save");
      save.onclick = busy(save, async () => {
        if (!title.value.trim()) throw new Error("Write a title.");
        const due = new Date(`${date.value}T${time.value || "10:00"}:00+06:00`);
        if (!e && due < new Date()) throw new Error("Pick a time in the future.");
        const row = { kind, title: title.value.trim(), course: course.value.trim() || null, due_at: due.toISOString(), note: note.value.trim() || null };
        if (e) await api.update("exams", `id=eq.${e.id}`, row); else await api.insert("exams", { ...row, user_id: api.userId() });
        toast("Saved ✓ — reminders are set", "ok"); close(true); rerender();
      });
      const out = [h("button.btn", { onclick: () => close(null) }, "Cancel"), save];
      if (e) {
        const done = h("button.btn", e.done ? "Not done" : "✓ Done");
        done.onclick = busy(done, async () => { await api.update("exams", `id=eq.${e.id}`, { done: !e.done }); toast(e.done ? "Marked not done" : "Done ✓ — reminders stopped", "ok"); close(true); rerender(); });
        const del = h("button.btn.danger", { "aria-label": "Delete" }, icon("trash"));
        del.onclick = busy(del, async () => { if (!(await confirmBox("Delete?", e.title, "Delete", true))) return; await api.remove("exams", `id=eq.${e.id}`); close(true); rerender(); });
        out.unshift(del, done);
      }
      return out;
    },
  });
}
