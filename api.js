// My Lifestyle — tiny Supabase client (REST + Auth + Storage), no external libraries.
export const SB_URL = "https://njzqexdoajxlfvczpuqn.supabase.co";
export const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qenFleGRvYWp4bGZ2Y3pwdXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NTQyNzcsImV4cCI6MjEwOTAzMDI3N30.OrlPb7sqKKDXQ6RZAsWQaLxX5XzoAtt1xiL-KXt7flE";
export const SITE_URL = new URL("../", import.meta.url).href; // wherever the site is hosted

const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
export { LS };

let session = LS.get("al_session");
export const getSession = () => session;
export const userId = () => session?.user_id;
function saveSession(s) { session = s; s ? LS.set("al_session", s) : LS.del("al_session"); }

export class ApiError extends Error {}

function cleanMsg(m) {
  if (!m) return "Something went wrong. Please try again.";
  return String(m).replace(/^.*?ERROR:\s*/i, "").replace(/\s*CONTEXT:.*$/s, "");
}

async function refresh() {
  if (!session?.refresh_token) throw new ApiError("Please log in again.");
  let r;
  try {
    r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
  } catch { const e = new ApiError("No internet. Your change will be saved when you are back online."); e.offline = true; throw e; }
  if (!r.ok) { saveSession(null); location.hash = "#/login"; throw new ApiError("Please log in again."); }
  const d = await r.json();
  saveSession({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, user_id: d.user.id });
}

async function authHeader() {
  if (session && session.expires_at && Date.now() / 1000 > session.expires_at - 60) await refresh();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function req(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const h = { apikey: SB_KEY, ...(await authHeader()), ...headers };
  if (body !== undefined && !(body instanceof Blob)) h["Content-Type"] = "application/json";
  let r;
  try {
    r = await fetch(SB_URL + path, { method, headers: h, body: body instanceof Blob ? body : body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    const err = new ApiError("No internet. Your change will be saved when you are back online.");
    err.offline = true; throw err;
  }
  if (r.status === 401 && session) { await refresh(); return req(path, { method, body, headers, raw }); }
  if (raw) return r;
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new ApiError(cleanMsg(data?.message || data?.error || data?.msg || r.statusText));
  return data;
}

// ---- auth (phone + password through our "account" function)
export async function account(action, payload, { auth = false } = {}) {
  let r;
  const ah = auth ? await authHeader() : { Authorization: `Bearer ${SB_KEY}` };
  try {
    r = await fetch(`${SB_URL}/functions/v1/account`, {
      method: "POST", headers: { apikey: SB_KEY, ...ah, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch { throw new ApiError("No internet connection."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) { const e = new ApiError(d.error || "Something went wrong."); e.code = d.code; throw e; }
  if (d.session) saveSession(d.session);
  return d;
}
// ---- phone notifications (Web Push)
export const VAPID_PUBLIC = "BBf9Sr04a9jWNyncJsHJQAYXLF0nPnpCCPOVgf2WGXD6d-5uC1pwJMEFfiJZIDppdOUTIOfZlTCbFycLIZEEXdk";
const b64ToBytes = b => { const p = "=".repeat((4 - b.length % 4) % 4); const r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}
export async function enablePush() {
  if (!pushSupported()) throw new ApiError("This browser can't show notifications. On iPhone/iPad, first add the app to your Home Screen.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new ApiError("Notifications are blocked. Allow them for this site in your browser settings.");
  const reg = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  const j = sub.toJSON();
  await upsert("push_subs", [{ endpoint: j.endpoint, user_id: userId(), p256dh: j.keys.p256dh, auth: j.keys.auth }], "endpoint");
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await remove("push_subs", `endpoint=eq.${encodeURIComponent(sub.endpoint)}`).catch(() => {}); await sub.unsubscribe(); }
}
export async function pushTest() {
  const r = await fetch(`${SB_URL}/functions/v1/push?action=test`, { method: "POST", headers: { apikey: SB_KEY, ...(await authHeader()), "Content-Type": "application/json" }, body: "{}" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(d.error || "Could not send a test.");
  return d.sent;
}
export const TG_BOT = "MyLifestyleBot"; // set when the bot is created
export async function telegram(action, payload = {}, { auth = false } = {}) {
  let r;
  const ah = auth ? await authHeader() : { Authorization: `Bearer ${SB_KEY}` };
  try {
    r = await fetch(`${SB_URL}/functions/v1/telegram?action=${action}`, {
      method: "POST", headers: { apikey: SB_KEY, ...ah, "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
  } catch { throw new ApiError("No internet connection."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new ApiError(d.error || "Something went wrong.");
  return d;
}
// ---- AI Coach (server keeps the key)
export async function ai(action, payload = {}) {
  let r;
  try {
    r = await fetch(`${SB_URL}/functions/v1/ai?action=${action}`, { method: "POST", headers: { apikey: SB_KEY, ...(await authHeader()), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch { const e = new ApiError("AI needs internet."); e.offline = true; throw e; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new ApiError(d.error || "AI is busy. Try again.");
  // AI sometimes wraps its answer in a list: [{...}] or just a list of items
  if (Array.isArray(d)) return d.length === 1 && d[0] && !Array.isArray(d[0]) && (d[0].items || d[0].summary || d[0].answer || d[0].dp) ? d[0] : { items: d };
  if (Array.isArray(d.items) && d.items.length === 1 && Array.isArray(d.items[0])) d.items = d.items[0];
  return d;
}
export function logout() { saveSession(null); }
export async function setNewPassword(accessToken, password) {
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    method: "PUT", headers: { apikey: SB_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) throw new ApiError("Reset link expired. Please request a new one.");
}

// ---- data (reads are remembered so every page still opens offline)
const READ_RPCS = new Set(["my_stats", "list_people", "public_profile", "has_pin", "is_admin"]);
const cacheKey = p => "al_c:" + p;
async function cachedRead(path, run) {
  try {
    const d = await run();
    try { localStorage.setItem(cacheKey(path), JSON.stringify(d)); } catch { pruneCache(); }
    return d;
  } catch (e) {
    if (e.offline) { const c = LS.get(cacheKey(path)); if (c !== null) { isStale = true; return c; } }
    throw e;
  }
}
function pruneCache() { try { Object.keys(localStorage).filter(k => k.startsWith("al_c:")).slice(0, 40).forEach(k => localStorage.removeItem(k)); } catch {} }
export let isStale = false;
export const resetStale = () => { isStale = false; };
export const rpc = (fn, args = {}) => READ_RPCS.has(fn)
  ? cachedRead(`rpc/${fn}/${JSON.stringify(args)}`, () => req(`/rest/v1/rpc/${fn}`, { method: "POST", body: args }))
  : req(`/rest/v1/rpc/${fn}`, { method: "POST", body: args });
export const select = (table, query = "") => cachedRead(`${table}?${query}`, () => req(`/rest/v1/${table}?${query}`));
// when the routine (or money) changes, today's AI advice is made again next time
const STALE = new Set(["routines", "timetable_items", "timetable_tabs", "students", "bills", "finance_entries", "exams"]);
const touch = t => { if (STALE.has(t)) try { localStorage.setItem("al_coach_stale", "1"); } catch {} };
export const insert = (table, rows) => (touch(table), req(`/rest/v1/${table}`, { method: "POST", body: rows, headers: { Prefer: "return=representation" } }));
export const upsert = (table, rows, onConflict) => req(`/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, { method: "POST", body: rows, headers: { Prefer: "return=representation,resolution=merge-duplicates" } });
export const update = (table, match, patch) => (touch(table), req(`/rest/v1/${table}?${match}`, { method: "PATCH", body: patch, headers: { Prefer: "return=representation" } }));
export const remove = (table, match) => (touch(table), req(`/rest/v1/${table}?${match}`, { method: "DELETE" }));

// ---- storage
export async function uploadProof(file, taskId) {
  const blob = await compressImage(file, 1280, 0.72);
  const path = `${userId()}/${taskId}-${Date.now()}.jpg`;
  await req(`/storage/v1/object/proofs/${path}`, { method: "POST", body: blob, headers: { "Content-Type": "image/jpeg", "x-upsert": "true" } });
  return path;
}
export async function signedUrl(path, bucket = "proofs") {
  const d = await req(`/storage/v1/object/sign/${bucket}/${path}`, { method: "POST", body: { expiresIn: 3600 } });
  return SB_URL + "/storage/v1" + d.signedURL;
}
export async function uploadApk(file) {
  await req(`/storage/v1/object/downloads/amar-lifestyle.apk`, { method: "POST", body: file, headers: { "Content-Type": "application/vnd.android.package-archive", "x-upsert": "true" } });
}
export const apkUrl = () => `${SB_URL}/storage/v1/object/public/downloads/amar-lifestyle.apk`;

function compressImage(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res(b) : rej(new Error("Could not read the photo.")), "image/jpeg", q);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => rej(new Error("Could not read the photo."));
    img.src = URL.createObjectURL(file);
  });
}

// ---- offline queue: anything done without internet is saved on the phone and sent later, in order
// op kinds: mark (Completed/Not Completed), task (new task), timer (timer run offline), insert, upsert
const QK = "al_queue";
export const pendingOps = () => LS.get(QK, []);
export const pendingMarks = () => pendingOps().filter(o => o.kind === "mark");
export const pendingTasks = () => pendingOps().filter(o => o.kind === "task");
function pushOp(op) { const q = pendingOps(); q.push({ ...op, at: op.at || new Date().toISOString() }); LS.set(QK, q); }
export function queueMark(taskId, result, pct = 100) { pushOp({ kind: "mark", taskId, result, pct }); }

// try now; if there is no internet, save it for later. Returns { queued: true } when saved offline.
export async function offlineSafe(op) {
  try { return await runOp({ ...op, at: new Date().toISOString() }, {}, true); }
  catch (e) { if (e.offline) { pushOp(op.kind === "task" ? { ...op, tmpId: op.tmpId || "tmp-" + Date.now() } : op); return { queued: true }; } throw e; }
}
async function runOp(o, idMap, live = false) {
  const id = x => idMap[x] || x;
  if (o.kind === "mark") return rpc("complete_task_pct", { p_task: id(o.taskId), p_result: o.result, p_client_time: live ? null : o.at, p_pct: o.pct || 100 });
  if (o.kind === "task") return rpc("add_task", { p_title: o.title, p_category: o.category, p_start: o.start, p_end: o.end, p_pinned: !!o.pinned, p_made_at: live ? null : o.at, p_student: o.studentId || null });
  if (o.kind === "timer") return rpc("log_offline_timer", { p_title: o.title, p_category: o.category, p_start: o.start, p_end: o.end });
  if (o.kind === "insert") return insert(o.table, o.rows);
  if (o.kind === "upsert") return upsert(o.table, o.rows, o.onConflict);
  throw new ApiError("Unknown change.");
}
let flushing = false;
export async function flushQueue() {
  const q = pendingOps();
  if (!q.length || !navigator.onLine || flushing || !session) return [];
  flushing = true;
  const left = [], results = [], idMap = LS.get("al_idmap", {});
  try {
    for (let i = 0; i < q.length; i++) {
      const o = q[i];
      try {
        const res = await runOp(o, idMap);
        if (o.kind === "task" && o.tmpId) idMap[o.tmpId] = res;
        results.push({ ...o, res });
      } catch (e) {
        if (e.offline) { left.push(...q.slice(i)); break; }
        results.push({ ...o, error: e.message });
      }
    }
  } finally { LS.set(QK, left); LS.set("al_idmap", idMap); flushing = false; }
  return results;
}
