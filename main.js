// My Lifestyle — entry point
import { start } from "./app.js";
import "./auth.js";
import "./today.js";
import "./week.js";
import "./money.js";
import "./me.js";
import "./more.js";
import "./timetable.js";
import "./exams.js";
import "./dayreport.js";
import "./install.js"; // catches the one-tap install offer early

// password-reset link from email arrives as #access_token=...&type=recovery
const hp = new URLSearchParams(location.hash.replace(/^#/, ""));
if (hp.get("type") === "recovery" && hp.get("access_token")) {
  sessionStorage.setItem("al_recovery", hp.get("access_token"));
  history.replaceState(null, "", location.pathname + "#/newpass");
}

if ("serviceWorker" in navigator) {
  // always pick up the newest version: check on open / when coming back, and reload once a new one takes over
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
    reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {}));
}
start();
