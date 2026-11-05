// My Lifestyle — AI Coach: daily advice, alerts, ask a question, build a routine by voice
import * as api from "./api.js";
import { h, icon, toast, sheet, busy, todayStr, addDays, DAYS, PALETTE, dhakaIso, durLabel, fmtHM, fmtTime, fmtDate } from "./ui.js";
import { store, catNames, rerender } from "./app.js";
import { voiceRecorder } from "./voice.js";
import { pickColor } from "./ui.js";
import { askSheet } from "./assistant.js";
export { askSheet };

// small bar on the Today page: one line; tap to open the full advice
export function coachCard() {
  const box = h("div.card.coach");
  let open = !!api.LS.get("al_coach_open");
  const askBtn = () => h("button.btn.small", { onclick: e => { e.stopPropagation(); askSheet(); } }, icon("mic"), "Ask AI");
  const line = (text, color) => h("div.row.coach-line", { role: "button", tabindex: "0", "aria-expanded": String(open), onclick: () => { open = !open; api.LS.set("al_coach_open", open); last && draw(last); } },
    h("span", "🤖"), h("span.grow.ell.small", { style: { color: color || "" } }, text), last ? h("span.small.faint", open ? "▲" : "▼") : null, askBtn());
  let last = null;
  const load = async refresh => {
    if (!last) box.replaceChildren(line(refresh ? "Thinking…" : "AI Coach loading…"));
    try {
      const r = await api.ai("coach", { refresh });
      api.LS.set("al_coach", r);
      draw(r);
    } catch (e) {
      const c = api.LS.get("al_coach");
      if (c) draw(c); else box.replaceChildren(line(e.offline ? "AI needs internet." : e.message));
    }
  };
  const draw = r => {
    last = r;
    const alerts = r.alerts || [], tips = r.tips || [];
    const top = alerts[0];
    const headTxt = top ? `⚠️ ${top.title}` + (alerts.length > 1 ? ` (+${alerts.length - 1})` : "") : (r.summary || tips[0]?.title || "AI Coach");
    const kids = [line(headTxt, top ? (top.level === "high" ? "var(--red)" : "var(--amber)") : "")];
    if (open) {
      const re = h("button.btn.small.ghost", { "aria-label": "New advice" }, icon("routine"), "New advice");
      re.onclick = busy(re, () => load(true));
      kids.push(
        r.summary && top ? h("p.small", { style: { margin: "8px 0 4px" } }, r.summary) : null,
        ...alerts.map(a => h("div", { style: { padding: "7px 9px", borderRadius: "10px", margin: "6px 0", background: `color-mix(in srgb, ${a.level === "high" ? "var(--red)" : "var(--amber)"} 13%, transparent)`, border: `1px solid color-mix(in srgb, ${a.level === "high" ? "var(--red)" : "var(--amber)"} 45%, transparent)` } },
          h("b.small", { style: { color: a.level === "high" ? "var(--red)" : "var(--amber)" } }, "⚠️ ", a.title), h("div.small", a.text))),
        ...tips.map(t => h("div", { style: { padding: "6px 0", borderTop: "1px solid var(--line)" } }, h("b.small", "💡 ", t.title), h("div.small.muted", t.text))),
        h("div.row", { style: { justifyContent: "flex-end", marginTop: "4px" } }, re));
    }
    box.replaceChildren(...kids.filter(Boolean));
  };
  load(false);
  return box;
}

// build a routine from one long voice/text description
const DAYMAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function aiPlanSheet(ctx) {
  const text = h("textarea.input", { placeholder: "e.g. শনি, বুধ আর বৃহস্পতি বিকাল ৫টা C.P পড়াই ১ ঘণ্টা, তারপর ৬টায় C.B। প্রতিদিন রাত ১০টা থেকে ১২টা পড়ি।", style: { minHeight: "80px" } });
  const result = h("div");
  let items = [];
  const draw = () => {
    result.replaceChildren(items.length ? h("div.list.mt", items.map((it, i) => {
      const days = (it.days || []).map(d => d.slice(0, 3));
      const rep = h("select.input", { style: { minHeight: "34px", width: "auto", padding: "4px 8px", fontSize: "13px" }, onchange: e => it.repeat = e.target.value },
        h("option", { value: "perm", selected: it.repeat !== "week" }, "Every week"), h("option", { value: "week", selected: it.repeat === "week" }, "This week"));
      return h("div.li", { style: { alignItems: "flex-start" } },
        h("input", { type: "checkbox", checked: it.on !== false, style: { width: "22px", height: "22px", accentColor: "var(--brand)", marginTop: "3px" }, onchange: e => it.on = e.target.checked, "aria-label": "Include" }),
        h("div.grow", /^#[0-9a-f]{6}$/i.test(it.color || "") ? h("i", { style: { display: "inline-block", width: "10px", height: "10px", borderRadius: "3px", background: it.color, marginRight: "6px" } }) : null, h("b", it.title), it.student ? h("span.small.muted", " · " + it.student) : null,
          h("div.small.muted", `${days.join(", ")} · ${fmtHM(it.start)} · ${durLabel(it.minutes || 60)} · ${it.category}`),
          it.guessed ? h("div.small.warn", "🤔 Guess: ", it.note || "from your usual routine") : null),
        rep);
    })) : null);
  };
  let save, make;
  const apply = r => {
    if (r.heard) text.value = r.heard;
    items = (r.items || []).filter(x => x.title && x.start && (x.days || []).length);
    draw();
    if (r.question) result.prepend(h("div.card.small.warn.mt", "❓ ", r.question));
    if (!items.length) result.append(h("p.small.bad", "কোনো কাজ পাওয়া যায়নি। দিন, সময় আর কী করবেন — বলুন।"));
    if (save) save.disabled = !items.length;
    if (make) make.textContent = "🤖 Make again";
  };
  const voice = voiceRecorder(async audio => {
    result.replaceChildren(h("p.small.muted.mt", "🤖 AI is reading your routine…"));
    apply(await api.ai("plan", { audio }));
  }, { label: "Tap and say your routine" });
  return sheet("🤖 Build routine with AI", [
    h("p.hint", "যেমন: “শনিবার ৫টা ৬ সিপি, প্রতিদিন সকাল ৬টায় আধা ঘণ্টা দৌড়”। শেষ হলে আবার চাপুন — AI শুনে লিস্ট বানাবে। কিছু না বললে আগের রুটিন দেখে অনুমান করবে। Save করার আগে দেখে নিন।"),
    voice,
    h("div.small.faint", { style: { textAlign: "center", margin: "10px 0 6px" } }, "— অথবা লিখুন / ঠিক করুন —"),
    text, result,
  ], {
    actions: close => {
      make = h("button.btn", "🤖 Make plan");
      save = h("button.btn.primary", { disabled: true }, "Save selected");
      make.onclick = busy(make, async () => {
        if (!text.value.trim()) throw new Error("মাইকে বলুন বা লিখুন।");
        result.replaceChildren(h("p.small.muted.mt", "AI is reading your routine…"));
        apply(await api.ai("plan", { text: text.value }));
      });
      save.onclick = busy(save, async () => {
        const chosen = items.filter(x => x.on !== false);
        if (!chosen.length) throw new Error("Tick at least one.");
        const students = ctx.students || [];
        const active = (ctx.routines || []).find(r => r.active)?.template || "Normal";
        const cats = catNames();
        let n = 0;
        const known = [...(ctx.routines || [])];
        for (const [i, it] of chosen.entries()) {
          const norm = x => String(x || "").toLowerCase().replace(/[.\s]/g, "");
          const st = students.find(s => norm(s.name) === norm(it.student) || norm(s.name) === norm(it.title));
          const cat = cats.includes(it.category) ? it.category : (st ? "Tuition" : "Work / Personal");
          const days = (it.days || []).map(d => DAYMAP[d.slice(0, 3)]).filter(d => d !== undefined);
          const minutes = Math.min(720, Math.max(5, Number(it.minutes) || 60));
          const color = (/^#[0-9a-f]{6}$/i.test(it.color || "") ? it.color : null) || pickColor(it.title, known);
          known.push({ title: it.title, color });
          if (it.repeat === "week") {
            for (const d of days) {
              const date = [...Array(7)].map((_, k) => addDays(ctx.ws, k)).find(x => new Date(x + "T00:00:00").getDay() === d);
              const s = dhakaIso(date, it.start);
              if (new Date(s) < new Date()) continue;
              const id = await api.rpc("add_task", { p_title: it.title, p_category: cat, p_start: s, p_end: new Date(new Date(s).getTime() + minutes * 60000).toISOString(), p_student: st?.id || null });
              await api.update("tasks", `id=eq.${id}`, { color });
              n++;
            }
          } else {
            await api.insert("routines", { user_id: api.userId(), title: it.title, category: cat, start_time: it.start, duration_min: minutes, days, color, template: active, student_id: cat === "Tuition" ? st?.id || null : null, active: true });
            n++;
          }
        }
        await api.rpc("ensure_tasks", { p_from: todayStr(), p_to: addDays(todayStr(), 7) });
        toast(`Saved ${n} item${n === 1 ? "" : "s"} to your week ✓`, "ok"); close(); rerender();
      });
      return [h("button.btn", { onclick: () => close() }, "Cancel"), make, save];
    },
  });
}
