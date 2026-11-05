// My Lifestyle — login, registration, password reset, privacy policy
import * as api from "./api.js";
import { h, icon, toast, busy, t } from "./ui.js";
import { route, go, loadBasics, store, occupationPicker, saveOccupation } from "./app.js";
import { religionPicker, saveReligion } from "./prayer.js";
import { aboutContent } from "./more.js";

const field = (label, attrs) => { const i = h("input.input", attrs); return [h("label.f", h("span", label), i), i]; };

function shell(...kids) {
  return h("div.auth", h("img.logo", { src: document.documentElement.dataset.theme === "light" ? "assets/logo-light.png" : "assets/logo-dark.png", alt: "My Lifestyle" }), ...kids);
}

route("login", page => {
  const help = h("div");
  const [pf, phone] = field(t("Phone number"), { type: "tel", inputmode: "numeric", autocomplete: "tel", placeholder: "01XXXXXXXXX" });
  const [wf, pass] = field(t("Password"), { type: "password", autocomplete: "current-password" });
  const btn = h("button.btn.primary.block", { type: "submit" }, t("Log in"));
  const form = h("form.card", pf, wf, btn, help,
    h("div.row.between.mt", h("button.linkbtn", { type: "button", onclick: () => go("#/forgot") }, "Forgot password?"),
      h("button.linkbtn", { type: "button", onclick: () => go("#/register") }, t("Create account"))), h("div.tg-hint", h("span", "✈️"), h("span", "পাসওয়ার্ড ভুলে গেলে Telegram-এ কোড পেয়ে সহজে নতুন পাসওয়ার্ড দেওয়া যায় — লগইনের পর ", h("b", "নিচের 🔔 Alerts → Telegram"), " কানেক্ট করে রাখুন।")));
  form.addEventListener("submit", e => { e.preventDefault(); login(); });
  let wrong = 0;
  const login = async () => {
    btn.disabled = true;
    try {
      await api.account("login", { phone: phone.value, password: pass.value });
      store.profile = null; await loadBasics(); go("#/today");
    } catch (e) {
      sessionStorage.setItem("al_last_phone", phone.value);
      if (e.code === "wrong_password") wrong++;
      help.replaceChildren(h("div.card", { style: { borderColor: "color-mix(in srgb, var(--red) 55%, transparent)", marginTop: "10px" } },
        h("b.bad", e.message), h("p.small.muted", { style: { margin: "4px 0 8px" } },
          e.code === "no_account" ? "Check the number, or make a new account." : wrong >= 2 ? "Forgot it? Get a code on Telegram and set a new one." : "Check your password, or reset it."),
        e.code === "no_account" ? h("a.btn.small.primary", { href: "#/register" }, t("Create account")) : h("a.btn.small" + (wrong >= 2 ? ".primary" : ""), { href: "#/forgot" }, "Forgot password?")));
    } finally { btn.disabled = false; }
  };
  page.append(shell(h("p.tag", "Build a disciplined life, one task at a time."), form,
    h("p.center.small.faint", h("a", { href: "#/home" }, "← Welcome page"), " · ", h("a", { href: "#/privacy" }, "Privacy Policy"))));
}, { public: true });

route("register", page => {
  const [nf, name] = field("Your name", { autocomplete: "name", placeholder: "e.g. Junayed Abedien Leon" });
  const [pf, phone] = field(t("Phone number") + " (you log in with this)", { type: "tel", inputmode: "numeric", placeholder: "01XXXXXXXXX" });
  const [ef, email] = field("Email", { type: "email", autocomplete: "email", placeholder: "you@gmail.com" });
  const [wf, pass] = field("Password (at least 6 characters)", { type: "password", autocomplete: "new-password" });
  const agree = h("input", { type: "checkbox", id: "agree" });
  const btn = h("button.btn.primary.block", { type: "submit" }, t("Create account"));
  let occ = null;
  const occf = h("label.f", h("span", "What do you do?"), occupationPicker([], k => occ = k));
  let rel = null;
  const relf = h("label.f", h("span", "Religion (Muslim → prayer times & tracking)"), religionPicker(null, k => rel = k));
  const form = h("form.card", nf, pf, ef, wf, occf, relf,
    h("p.hint", "Your data will be safely stored in backup files."), h("div.tg-hint", h("span", "✈️"), h("span", "পাসওয়ার্ড ভুলে গেলে Telegram-এ কোড পেয়ে সহজে নতুন পাসওয়ার্ড দেওয়া যায় — লগইনের পর ", h("b", "নিচের 🔔 Alerts → Telegram"), " কানেক্ট করে রাখুন।")),
    h("label.check", { for: "agree" }, agree, h("span", "I agree to the ", h("a", { href: "#/privacy", target: "_blank" }, "Privacy Policy and Terms of Use"), ".")),
    btn,
    h("div.center.mt", h("button.linkbtn", { type: "button", onclick: () => go("#/login") }, "I already have an account")));
  form.addEventListener("submit", e => { e.preventDefault(); reg(); });
  const reg = busy(btn, async () => {
    if (!agree.checked) throw new Error("Please tick “I agree” to continue.");
    await api.account("register", { name: name.value, phone: phone.value, email: email.value, password: pass.value, agree: "yes" });
    store.profile = null; await loadBasics();
    if (occ?.length) { try { await saveOccupation(occ); } catch { /* can set later in Settings */ } }
    if (rel) { try { await saveReligion(rel); } catch { /* can set later in Settings */ } }
    toast("Welcome to My Lifestyle! 🎉", "ok");
    go("#/today"); // the full guide opens there first
  });
  page.append(shell(form));
}, { public: true });

// one form for "forgot password" (logged out) and "forgot PIN" (logged in): code by Telegram or email
export function codeResetForm(target, phoneInput, done) {
  const isPin = target === "pin";
  const [cf, code] = field("6-digit code from Telegram", { inputmode: "numeric", maxlength: "8", placeholder: "123456", autocomplete: "one-time-code" });
  const [nf, nv] = isPin ? field("New 4-digit PIN", { type: "password", inputmode: "numeric", maxlength: "4" }) : field("New password (at least 6 characters)", { type: "password", autocomplete: "new-password" });
  const save = h("button.btn.primary.block", isPin ? "Save new PIN" : "Save new password");
  const stage2 = h("div", { style: { display: "none" } }, cf, nf, save);
  const send = h("button.btn.block", "Send code to my Telegram");
  send.onclick = busy(send, async () => {
    const phone = phoneInput?.value;
    if (!isPin && !phone) throw new Error("Write your phone number first.");
    const r = isPin ? await api.telegram("pin_request", {}, { auth: true }) : await api.telegram("reset_request", { phone });
    if (r?.linked === false) throw new Error("No account with this phone number.");
    toast("Code sent to your Telegram ✓", "ok");
    stage2.style.display = ""; send.textContent = "Send again"; code.focus();
  });
  save.onclick = busy(save, async () => {
    const c = code.value.trim();
    isPin ? await api.telegram("pin_confirm", { code: c, pin: nv.value }, { auth: true }) : await api.telegram("reset_confirm", { phone: phoneInput.value, code: c, password: nv.value });
    toast(isPin ? "PIN changed ✓" : "Password changed ✓ Please log in.", "ok");
    done?.();
  });
  return h("div", h("p.hint", "A 6-digit code comes to the Telegram you connected in Settings → Telegram."), send, h("div.mt", stage2),
    h("p.small.faint.mt.mb0", "Telegram not connected? Message the Admin: ", h("a", { href: "https://www.facebook.com/engrmusfiqur", target: "_blank", rel: "noopener" }, "facebook.com/engrmusfiqur")));
}

route("forgot", page => {
  const [pf, phone] = field(t("Phone number"), { type: "tel", inputmode: "numeric", placeholder: "01XXXXXXXXX", value: sessionStorage.getItem("al_last_phone") || "" });
  page.append(shell(h("div.card", h("h2", "Forgot password"), pf, codeResetForm("password", phone, () => go("#/login")),
    h("div.center.mt", h("button.linkbtn", { onclick: () => go("#/login") }, "Back to login")))));
}, { public: true });

route("newpass", page => {
  const token = sessionStorage.getItem("al_recovery");
  const [wf, pass] = field("New password", { type: "password", autocomplete: "new-password" });
  const btn = h("button.btn.primary.block", "Save new password");
  btn.onclick = busy(btn, async () => {
    if (pass.value.length < 6) throw new Error("Password must be at least 6 characters.");
    await api.setNewPassword(token, pass.value);
    sessionStorage.removeItem("al_recovery");
    toast("Password changed. Please log in.", "ok"); go("#/login");
  });
  page.append(shell(h("div.card", h("h2", "Set a new password"), token ? [wf, btn] : h("p.muted", "This link is not valid any more."))));
}, { public: true });

// ---------- Privacy Policy (formal, article style)
const POLICY = [
  ["Article 1 — Definitions", "In this Policy, “My Lifestyle” or the “Service” means the My Lifestyle website and application; “User” means any person who creates an account; “Data” means any information a User provides to or generates within the Service; “DP” means Discipline Points; and “Administrators” means persons authorised by My Lifestyle to operate and maintain the Service."],
  ["Article 2 — Accounts", "A User registers with a name, phone number, email address and password, and must keep the password and the PIN confidential. One person may hold one account. A User may connect Telegram, which is used to send password- and PIN-reset codes and, unless the User turns it off, important reminders. Accounts that misuse the Service may be suspended."],
  ["Article 3 — Information Collected", "The Service collects (a) registration details; (b) optional profile details: occupation and religion; (c) records the User creates: tasks, routines, timetables, timer sessions, proof photographs, prayer records, habits, sleep, water, mood, diary entries, goals, events, students, tuition fees and attendance, income, expenses, budgets, bills, dues and savings; (d) the device location, only if the User taps “use my location” for prayer times; and (e) technical information needed to run the Service, such as login times, device type and notification subscriptions; and (f) anonymous usage counts — a random id stored on the device, the device type, when a visit starts and how long it lasts, and how many pages are opened — used only to see how much the Service is used; these counts are not linked to names or to anything the User writes; (g) when the User shares the app, the time and the chosen share option, and the shared link carries a short code so the Administrators can count how many people opened it and how many of them joined; and (h) the time the User last opened the Service, used to send reminders when the app has not been opened."],
  ["Article 4 — Occupation and Religion", "Occupation (one or two, e.g. job holder and university student) and religion are optional and may be changed at any time in Me → Edit profile. Occupation decides which task categories and sections are shown (for example, the Tuition section is shown to university students and teachers). Religion is used only to show religious features: a User who selects Muslim is shown prayer times and prayer tracking. These details are never shown to other Users. Occupation (not religion) is also used so the AI suggestions fit the User’s kind of work."],
  ["Article 5 — Tasks and Discipline Points", "Each task earns DP according to its category and length. A task can be marked from the last quarter of its time. Marking Completed by its end time, or within 5 hours after it (with half coins), gives full DP; after that it counts as done with no DP. When marking Completed the User chooses how much was done — 25%, 50%, 75% or 100% — and receives that share of DP and coins. Marking Not Completed before 12 AM earns and deducts nothing. A task left unmarked at 12 AM is counted as missed and its full DP is deducted. A task added after its start time earns no DP. Levels (Bronze, Silver, Gold, Platinum, Diamond) are counted from the DP earned each month and start again on the 1st of every month."],
  ["Article 6 — Prayer (Muslim Users)", "Prayer times are calculated on the User’s device by the method of the Islamic Foundation Bangladesh (Fajr and Isha at 18°, Asr by the Hanafi method) for the User’s chosen location (Dhaka by default). For caution, each waqt is shown to start two to three minutes after the calculated time and to end one to three minutes before the next. The times are a guide; in case of doubt the User should follow the local mosque, and may adjust each time in the Prayer tab. A prayer can be marked only after its waqt has started, and only for the current day (yesterday’s until 6 AM). “Prayed” earns the prayer DP shown in the app (a little more for Fajr), valued like the same time spent on a demanding task, so that Users of every faith can reach the same levels with the same effort; “Not prayed” earns and deducts nothing; a waqt left unmarked is settled at 6 AM the next morning by deducting the same DP it would have earned. Prayer records are private."],
  ["Article 7 — Routines, Timetables and Reminders", "Weekly routines create tasks automatically. University, coaching, meal and other timetables may be added as tabs and, at the User’s choice, merged into the weekly routine, shown only on the Today page, or kept separate. If the User turns notifications on, the Service sends reminders 30 and 15 minutes before each task and at its start, check-ins every 30 minutes during study tasks, a daily report with an AI review 30 minutes before bedtime, reminders for class tests, lab reports and exams that come more often as the due time gets closer (every hour in the last 3 hours), a message when a task can be marked, event reminders and a night report. Important reminders (15 minutes before and at the start of a task, deadlines in the last day, the night report) are also sent to Telegram if it is connected. If the app has not been opened, if notifications or Telegram are off, or if the app is not on the home screen, the Service may send short reminders explaining why they matter, and every second day for the first weeks a short tip about a feature. Every notification is also kept in the Alerts page. Notifications and Telegram reminders can be turned off at any time in Alerts."],
  ["Article 8 — Habits and Daily Life", "Habit counts can be undone, and a new habit can be edited or deleted, only within 2 minutes, so that records stay honest. Diary entries are private and are never shared with other Users or with the artificial intelligence service."],
  ["Article 9 — Financial Records", "Income, expenses, tuition fees, bills and other financial entries for a month may be added or amended until 30 days after that month ends; after that the month is locked. Every amendment is permanently recorded in an edit history, and reports disclose such amendments. A User may ask an Administrator for a special edit of a locked entry, giving a reason; any such correction is recorded and disclosed. Tuition dues are counted from the month a student joins; months set as “cleared” when a student is added are not counted as due. A bill marked as paid is recorded as an expense. If the User has set a PIN, it is asked every time a money entry or a student's fee details are changed, the full tuition sheet is opened or a backup is downloaded; adding new entries does not need it. After 5 wrong PINs, PIN entry is paused for 15 minutes."],
  ["Article 10 — Artificial Intelligence", "To provide suggestions, alerts, routine planning, voice input, photo reading and the Ask AI assistant, the Service sends only what each request needs to a third-party artificial intelligence service acting on behalf of My Lifestyle: summarised usage information (such as routines, task records and category or financial totals), and any voice recording or photograph the User chooses to send with that request. When the User uses Ask AI, the titles the User has given to tasks, routines, bills and students (with fee status) are included so the AI can act on them. The User’s own name, phone number, email address, password, PIN, religion, prayer records and diary entries are not sent. The assistant can propose almost anything a User can do in the app — tasks, routines, deadlines, money entries, budgets, bills, tuition fees, students, events, goals, habits, dues and today's prayer marks — but nothing is added, changed or deleted until the User confirms. Changing a money amount needs the User's PIN, is allowed only while that month is open (until 30 days after it ends), and the old amount stays in the edit history. The assistant cannot delete an account, erase all data or history, change locked months, or change the PIN, password, notifications or Telegram. When a User asks the assistant for something the app cannot do yet, that wish (in a short line, with the User's name and occupation) is saved so the Administrators can improve the app."],
  ["Article 11 — Offline Use", "The Service may keep a copy of recent Data on the User’s device so it can be used without internet. Actions taken offline are sent when the device is back online; a task marked offline is accepted only within 24 hours."],
  ["Article 12 — Storage, Backup and Security", "Data is stored on secured servers, protected by access rules so that each User can reach only their own Data, and is regularly preserved in backup files to prevent loss. Secret keys used by the Service are kept only on the server. Backups may be retained for as long as is reasonably necessary for the operation, security and continuity of the Service."],
  ["Article 13 — Access by Administrators", "Access to stored Data, including backups, is limited to authorised Administrators and is exercised only for security, verification of records, technical support, resolution of disputes and maintenance of the Service. Such access is recorded. Administrators are not given additional powers over a User’s Data without that User’s approval."],
  ["Article 14 — Visibility to Other Users", "Other Users cannot see a User’s tasks, points, finances, prayer records, diary, photographs or profile details. Reports are seen only by the persons with whom the User chooses to share them; anyone holding a report can confirm its authenticity by its QR code."],
  ["Article 15 — Rights and Responsibilities of Users", "Users are responsible for the accuracy of what they record. Users may download their payment records, request a copy of their Data, or request the closure of their account and the deletion of their Data by contacting My Lifestyle. Attempts to falsify records or misuse the Service may result in suspension of the account."],
  ["Article 16 — Changes to this Policy", "My Lifestyle may amend this Policy when the Service changes. The date at the top shows the latest version. Continued use of the Service after an amendment constitutes acceptance of the amended Policy."],
  ["Article 17 — Contact", "Questions about this Policy may be directed to My Lifestyle through the contact links on the About Us page."],
];
route("privacy", page => {
  page.append(h("header.topbar", h("div.row", h("a.icon-btn", { href: api.getSession() ? "#/more" : "#/register", "aria-label": "Back" }, icon("back")), h("h1", "Privacy Policy"))),
    h("div.card", h("p.small.muted", "Privacy Policy and Terms of Use of My Lifestyle. Last updated: 2 November 2026."),
      POLICY.map(([a, b]) => [h("h3", { style: { margin: "16px 0 6px", fontSize: "15px" } }, a), h("p.small", { style: { margin: 0 } }, b)])));
}, { public: true });

// ---------- welcome page for visitors (not logged in)
route("home", page => {
  if (api.getSession()) return go("#/today");
  const feat = (ic, title, text) => h("div.card", { style: { marginBottom: 0 } }, h("div.row", { style: { gap: "10px", alignItems: "flex-start" } },
    h("div.ic", { style: { width: "34px", height: "34px", minWidth: "34px", borderRadius: "10px", background: "var(--card2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", flexShrink: 0 } }, icon(ic)),
    h("div", h("b", title), h("div.small.muted", text))));
  const cta = () => h("div.row", { style: { gap: "10px" } },
    h("a.btn.primary.grow", { href: "#/register" }, t("Create account")), h("a.btn.grow", { href: "#/login" }, t("Log in")));
  page.append(
    h("div", { style: { textAlign: "center", padding: "28px 0 18px" } },
      h("img", { src: document.documentElement.dataset.theme === "light" ? "assets/logo-light.png" : "assets/logo-dark.png", alt: "My Lifestyle", style: { width: "230px", margin: "0 auto 14px" } }),
      h("h1", { style: { fontSize: "26px", margin: "0 0 6px", letterSpacing: "-0.5px" } }, "Welcome to My Lifestyle"),
      h("p.muted", { style: { margin: "0 auto 18px", maxWidth: "460px" } }, "Plan your day, keep your routine, earn Discipline Points and see your progress — free for everyone."),
      h("div", { style: { maxWidth: "420px", margin: "0 auto" } }, cta())),
    h("div.section-title", h("h2", "What you can do")),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" } },
      feat("routine", "Daily & weekly routine", "Set tasks once — they repeat every week. Build your week like a neon routine chart."),
      feat("medal", "Discipline Points & levels", "Hard tasks earn more DP. Climb Bronze → Silver → Gold → Platinum → Diamond every month."),
      feat("timer", "Timer & Pomodoro", "Track study, tuition and gym time. 25 + 5 focus sessions."),
      feat("money", "Money & budget", "Income, expenses, budgets and savings. Locked edit history keeps records honest."),
      feat("student", "Tuition manager", "Students, fees, attendance and month-by-month graphs."),
      feat("report", "Reports with QR", "PDF reports anyone can verify by scanning the QR code."),
      feat("heart", "Daily life", "Sleep, water, habits, mood and a private diary."),
      feat("mic", "Voice", "Say “Saturday 5 pm tuition 1 hour every week” and it's added."),
      feat("today", "Works offline", "No internet? Keep marking tasks — it syncs when you're back online.")),
    h("div.section-title", h("h2", t("About Us"))),
    aboutContent(),
    h("div.card.center", h("h3", "Ready to build a disciplined life?"), cta()),
    h("p.center.small.faint", h("a", { href: "#/privacy" }, "Privacy Policy"), " · My Lifestyle"));
}, { public: true });
