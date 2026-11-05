// My Lifestyle — "where is it?" marks: highlight each part of the screen with a short note
import * as api from "./api.js";
import { h } from "./ui.js";

const TODAY = [
  [".ai-orb", "✨ AI", "পরামর্শ দেখুন, প্রশ্ন করুন, বা মুখে বলে যেকোনো কাজ করিয়ে নিন — টাস্ক, টাকা, CT, রুটিন সব।"],
  ["a.hero.mini", "📊 আজকের রিপোর্ট", "এখানে চাপলে আজ কত কাজ, কত DP, কত খরচ-আয়, নামাজ — সব এক পাতায়, সাথে AI-এর মূল্যায়ন।"],
  [".upnext", "⏭ Up next", "পরের কাজ কোনটা আর কত সময় বাকি। ইমার্জেন্সি থাকলে লাল হয়ে সেটাই দেখায়।"],
  [".ticker", "💡 পরামর্শ", "কয়েক সেকেন্ড পরপর বদলায় — আপনার রুটিন আর টাকার হিসাব দেখে। চাপলে AI খোলে।"],
  [".btn.emg", "🚨 Emergency", "হঠাৎ জরুরি কাজ? এখানে দিন — যে কাজ চলছিল সেটা তখনই শেষ হবে।"],
  [".fab", "＋ নতুন টাস্ক", "একবারের কাজ যোগ করুন। ধরে টেনে বোতামটা সরানো যায়।"],
  [".nav", "নিচের মেনু", "Routine = সাপ্তাহিক রুটিন, Exams, Prayer · Money = আয়-খরচ, Daily spending, Tuition · Me = লেভেল, অভ্যাস · 🔔 Alerts = নোটিফিকেশন, Telegram · More = Share, Calendar, Reports, Settings, গাইড।"],
];

export function showSpots(force = false, list = TODAY) {
  if (!force && api.LS.get("al_spots_v1")) return;
  const items = list.filter(([sel]) => { const el = document.querySelector(sel); return el && el.getBoundingClientRect().height > 0; });
  if (!items.length) return;
  let i = 0;
  const ring = h("div.spot-ring"), tip = h("div.spot-tip");
  const layer = h("div.spot-layer", ring, tip);
  const end = () => { layer.remove(); api.LS.set("al_spots_v1", 1); removeEventListener("resize", place); };
  const place = () => {
    const [sel, title, text] = items[i];
    const el = document.querySelector(sel); if (!el) return next();
    el.scrollIntoView({ block: "center", behavior: "instant" in window ? "instant" : "auto" });
    const r = el.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    tip.replaceChildren(h("b", title), h("p", text),
      h("div.row.between", h("span.small.muted", `${i + 1}/${items.length}`),
        h("div.row", { style: { gap: "8px" } }, h("button.btn.small", { onclick: end }, "Skip"), h("button.btn.small.primary", { onclick: next }, i === items.length - 1 ? "Done" : "Next"))));
    const below = r.bottom + 180 < innerHeight;
    Object.assign(tip.style, { top: below ? r.bottom + 14 + "px" : "auto", bottom: below ? "auto" : innerHeight - r.top + 14 + "px" });
  };
  const next = () => { i++; if (i >= items.length) end(); else place(); };
  document.body.append(layer);
  addEventListener("resize", place);
  setTimeout(place, 50);
}
