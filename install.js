// My Lifestyle — "add to Home Screen" first: the app works best (and iPhone notifications only work) when opened from the home screen
import * as api from "./api.js";
import { h, sheet, toast } from "./ui.js";

let bip = null; // Android/Chrome one-tap install
addEventListener("beforeinstallprompt", e => { e.preventDefault(); bip = e; });
addEventListener("appinstalled", () => { bip = null; api.LS.set("al_installed", 1); toast("App added to your home screen ✓", "ok"); });

export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ua = navigator.userAgent;
export const device = () => {
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|wv\)/.test(ua);
  return { ios, android: /Android/.test(ua), inApp, iosOther: ios && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua), canPrompt: !!bip };
};

function steps(title, list) {
  return h("div.inst-steps", h("b", title), h("ol", list.map(l => h("li", l))));
}

// what to do on this phone, in a few big steps
export function installBody(page = false) {
  const d = device();
  const out = [];
  if (d.inApp) {
    out.push(steps("Facebook / Messenger-এর ভেতরে খোলা আছে", [
      d.ios ? "উপরে/নিচে ⋯ বা ↗ চাপুন → “Open in Safari”" : "উপরে ⋮ চাপুন → “Open in Chrome” / “Open in browser”",
      "তারপর সেখান থেকে Home Screen-এ যোগ করুন।"]));
    out.push(h("button.btn.block", { onclick: () => navigator.clipboard?.writeText(api.SITE_URL).then(() => toast("Link copied ✓", "ok")) }, "🔗 Copy link"));
  } else if (d.ios) {
    if (d.iosOther) out.push(h("p.hint", "⚠️ iPhone-এ শুধু Safari থেকে Home Screen-এ যোগ করা যায়। লিংকটা Safari-তে খুলুন।"),
      h("button.btn.block", { onclick: () => navigator.clipboard?.writeText(api.SITE_URL).then(() => toast("Link copied — paste it in Safari", "ok")) }, "🔗 Copy link"));
    out.push(steps("iPhone / iPad (Safari)", ["নিচে Share বাটন চাপুন ( ⬆ বর্গের ভেতরে তীর )", "নিচে স্ক্রল করে “Add to Home Screen” চাপুন", "উপরে ডানে “Add” চাপুন", "এখন হোম স্ক্রিনের My Lifestyle আইকন থেকে খুলুন"]));
  } else if (bip) {
    const b = h("button.btn.primary.block", "📲 Install app — এক চাপে");
    b.onclick = async () => { const p = bip; if (!p) return; p.prompt(); const r = await p.userChoice.catch(() => ({})); if (r.outcome === "accepted") { bip = null; b.closest(".backdrop")?.click(); } };
    out.push(b);
  } else {
    out.push(steps(d.android ? "Android (Chrome)" : "Computer (Chrome / Edge)", d.android
      ? ["উপরে ডানে ⋮ চাপুন", "“Add to Home screen” বা “Install app” চাপুন", "“Install / Add” চাপুন — হোম স্ক্রিনে আইকন চলে আসবে"]
      : ["ঠিকানা বারের ডানে ⊕ / Install আইকন চাপুন", "“Install” চাপুন"]));
  }
  if (page) return out;
  return [h("div.inst-why",
    h("div", "⚡ আসল অ্যাপের মতো এক চাপে খোলে, পুরো স্ক্রিনে"),
    h("div", "🔔 টাস্কের আগে নোটিফিকেশন ঠিকমতো আসে", d.ios ? h("b", " (iPhone-এ শুধু তখনই আসে)") : null),
    h("div", "📴 ইন্টারনেট ছাড়াও খোলে")), ...out];
}

export function showInstall() {
  api.LS.set("al_inst_seen", Date.now());
  return sheet("📱 আগে অ্যাপটা Home Screen-এ রাখুন", installBody(), { actions: close => [h("button.btn.block", { onclick: () => close(null) }, "পরে করবো")] });
}
// shown before everything else, again every day until it's done
export async function installFirst() {
  if (isStandalone() || api.LS.get("al_installed") && !device().ios) return;
  if (Date.now() - (api.LS.get("al_inst_seen") || 0) < 20 * 3600e3) return;
  await showInstall();
}
// small strip on Today while the app is still in a browser tab
export function installStrip() {
  if (isStandalone() || Date.now() - (api.LS.get("al_inst_strip") || 0) < 864e5) return null;
  const c = h("div.tg-hint", { style: { marginBottom: "10px", alignItems: "center", borderColor: "color-mix(in srgb, var(--brand) 45%, transparent)" } },
    h("span", "📱"), h("span.grow", "অ্যাপটা Home Screen-এ রাখুন — নোটিফিকেশন ঠিকমতো আসবে।"),
    h("button.btn.small.primary", { onclick: () => showInstall() }, "Add"),
    h("button.linkbtn.small", { onclick: () => { api.LS.set("al_inst_strip", Date.now()); c.remove(); } }, "✕"));
  return c;
}
