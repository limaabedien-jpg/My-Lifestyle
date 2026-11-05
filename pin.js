// My Lifestyle — PIN lock for sensitive money parts (editing money, the full tuition sheet, backup)
import * as api from "./api.js";
import { h, sheet, toast, askPin } from "./ui.js";

const opened = {}; // area → when it was unlocked (a short grace so the same screen doesn't ask twice)
export async function setPinFlow() {
  const n1 = await askPin("Choose a new 4-digit PIN"); if (!n1) return false;
  const n2 = await askPin("Type the new PIN again"); if (!n2) return false;
  if (n1 !== n2) { toast("PINs didn't match. Try again.", "bad"); return false; }
  await api.rpc("set_pin", { p_new: n1, p_old: null }); toast("PIN saved ✓", "ok");
  return true;
}
// true = go ahead
export async function pinGate(area, reason = "এই অংশ খুলতে PIN দিন") {
  if (Date.now() - (opened[area] || 0) < 90000) return true;
  let has = false;
  try { has = await api.rpc("has_pin"); } catch { return true; } // offline: nothing new can be loaded anyway
  if (!has) {
    if (Date.now() - (api.LS.get("al_pin_skip") || 0) < 7 * 864e5) return true;
    const r = await sheet("🔐 PIN সেট করবেন?", [h("p", "টাকার হিসাব এডিট, পুরো টিউশন শিট আর ব্যাকআপ — ফোন অন্য কারো হাতে গেলেও যেন কেউ দেখতে বা বদলাতে না পারে।"),
      h("p.hint.mb0", "৪ সংখ্যার PIN দিন। এরপর প্রতিবার এই জায়গাগুলোতে ঢুকতে PIN লাগবে। নতুন টাকা/টিউশন যোগ করতে লাগবে না।")], {
      actions: close => [h("button.btn", { onclick: () => close("skip") }, "পরে"), h("button.btn.primary", { onclick: () => close("set") }, "PIN সেট করুন")],
    });
    if (r === "set") { try { if (await setPinFlow()) opened[area] = Date.now(); } catch (e) { toast(e.message, "bad"); } return true; }
    if (r === "skip") { api.LS.set("al_pin_skip", Date.now()); return true; }
    return false;
  }
  const pin = await askPin(reason); if (!pin) return false;
  try { if (!(await api.rpc("check_pin", { p_pin: pin }))) { toast("Wrong PIN.", "bad"); return false; } } catch (e) { toast(e.message || "Wrong PIN.", "bad"); return false; }
  opened[area] = Date.now();
  return true;
}
export const lockedCard = (onOpen) => h("div.card.empty", h("p", "🔒 PIN দিয়ে খুলুন"), h("button.btn.primary", { onclick: onOpen }, "Unlock"));
