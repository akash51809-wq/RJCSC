import "dotenv/config";
import express from "express";
import { startSsoLogin, submitCaptcha, submitOtp, getState, getScreenshot, closeBrowser } from "./automation/ssoLogin.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const accessToken = process.env.APP_ACCESS_TOKEN;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

if (!process.env.SSO_USER_ID || !process.env.SSO_PASSWORD) {
  console.warn("Warning: SSO_USER_ID or SSO_PASSWORD is missing from .env");
}
if (!accessToken || accessToken.length < 24) {
  console.warn("Warning: Set APP_ACCESS_TOKEN to a random secret of at least 24 characters.");
}

const panel = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RJCSC · SSO Login</title>
<style>
:root{color-scheme:dark;font-family:Inter,Segoe UI,Arial,sans-serif;background:#0b1220;color:#edf2ff}
*{box-sizing:border-box}body{margin:0;padding:24px;background:radial-gradient(circle at top right,#163b52,#0b1220 55%);min-height:100vh}
main{max-width:920px;margin:0 auto}.panel{background:#111c2d;border:1px solid #26374d;border-radius:18px;padding:22px;margin:16px 0;box-shadow:0 18px 45px #0003}
h1{margin:0 0 8px;font-size:27px}p{color:#b6c5d9;line-height:1.5}.row{display:flex;gap:10px;flex-wrap:wrap}
input,button{font:inherit;border-radius:10px;padding:12px;border:1px solid #354b65}
input{background:#0b1423;color:#fff;min-width:220px;flex:1}button{cursor:pointer;background:#147d92;color:#fff;border:0;font-weight:650}button.secondary{background:#26374d}button:disabled{opacity:.45;cursor:not-allowed}
#status{white-space:pre-wrap;background:#0a1422;padding:14px;border-radius:10px;color:#c7e9f0}
img{display:block;max-width:100%;height:auto;border-radius:12px;border:1px solid #354b65;margin-top:12px}
.small{font-size:13px;color:#8fa5bd}.warning{color:#ffd68a}
</style>
</head>
<body><main>
  <div class="panel">
    <h1>RJCSC · Rajasthan SSO Login</h1>
    <p>Credentials are read on the server from <code>.env</code>. Enter CAPTCHA and OTP yourself when prompted. This first version does not save cookies or use a database.</p>
    <label for="token">Access token</label>
    <div class="row" style="margin-top:8px"><input id="token" type="password" autocomplete="current-password" placeholder="APP_ACCESS_TOKEN"><button id="saveToken" class="secondary">Unlock panel</button></div>
    <p class="small">Keep this panel private. Do not deploy it publicly without HTTPS and access controls.</p>
  </div>
  <div class="panel">
    <h2>1. Start Login</h2><div class="row"><button id="start">Open SSO & fill credentials</button><button id="refresh" class="secondary">Refresh status</button><button id="close" class="secondary">Close browser</button></div>
  </div>
  <div class="panel">
    <h2>2. CAPTCHA</h2>
    <p>CAPTCHA is intentionally manual; this tool does not solve or bypass CAPTCHA. If the page displays CAPTCHA, read it from the screenshot and enter it below.</p>
    <div class="row"><input id="captcha" autocomplete="off" placeholder="Enter CAPTCHA"><button id="submitCaptcha">Submit CAPTCHA</button></div>
  </div>
  <div class="panel">
    <h2>3. OTP</h2>
    <p>After the SSO portal requests OTP, enter the OTP you received. If no OTP prompt appears, check the status and screenshot first.</p>
    <div class="row"><input id="otp" autocomplete="one-time-code" inputmode="numeric" placeholder="Enter OTP"><button id="submitOtp">Submit OTP</button></div>
  </div>
  <div class="panel">
    <h2>SSO page screenshot</h2><button id="screenshot" class="secondary">Update screenshot</button><img id="shot" alt="SSO page screenshot will appear here">
  </div>
  <div class="panel"><h2>Status</h2><div id="status">Panel locked. Enter access token and select Unlock panel.</div></div>
</main>
<script>
let token = "";
const $ = (id) => document.getElementById(id);
async function api(path, body) {
  if (!token) throw new Error("Unlock the panel first.");
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {"Content-Type":"application/json","Authorization":"Bearer "+token},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function showState() {
  const data = await api("/api/status");
  $("status").textContent = data.message || JSON.stringify(data, null, 2);
  if (data.running) await showShot();
}
async function showShot() {
  if (!token) return;
  const response = await fetch("/api/screenshot?ts="+Date.now(), {headers:{"Authorization":"Bearer "+token}});
  if (response.ok) $("shot").src = URL.createObjectURL(await response.blob());
}
async function run(fn) {
  try { const result = await fn(); if (result?.message) $("status").textContent = result.message; await showState(); }
  catch (e) { $("status").textContent = "Error: " + e.message; }
}
$("saveToken").onclick = async () => { token = $("token").value.trim(); await run(showState); };
$("start").onclick = () => run(() => api("/api/login/start", {}));
$("refresh").onclick = () => run(showState);
$("close").onclick = () => run(() => api("/api/login/close", {}));
$("submitCaptcha").onclick = () => run(() => api("/api/login/captcha", {captcha:$("captcha").value.trim()}));
$("submitOtp").onclick = () => run(() => api("/api/login/otp", {otp:$("otp").value.trim()}));
$("screenshot").onclick = () => run(showShot);
setInterval(() => { if (token) showState().catch(()=>{}); }, 10000);
</script>
</body></html>`;

function authorize(req, res, next) {
  if (!accessToken || accessToken.length < 24) {
    return res.status(503).json({ error: "Server is locked. Set APP_ACCESS_TOKEN (at least 24 characters) in .env and restart." });
  }
  const header = req.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (supplied.length !== accessToken.length || !safeEqual(supplied, accessToken)) {
    return res.status(401).json({ error: "Invalid access token." });
  }
  next();
}
function safeEqual(a, b) {
  // Constant-time comparison without accepting different-length strings.
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

app.get("/", (_req, res) => res.type("html").send(panel));
app.get("/api/status", authorize, (_req, res) => res.json(getState()));
app.get("/api/screenshot", authorize, async (_req, res) => {
  try {
    const image = await getScreenshot();
    if (!image) return res.status(409).json({ error: "Start the login flow first." });
    res.type("png").set("Cache-Control", "no-store").send(image);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/login/start", authorize, async (_req, res) => {
  try { res.json(await startSsoLogin()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});
app.post("/api/login/captcha", authorize, async (req, res) => {
  try { res.json(await submitCaptcha(req.body?.captcha)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/login/otp", authorize, async (req, res) => {
  try { res.json(await submitOtp(req.body?.otp)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post("/api/login/close", authorize, async (_req, res) => {
  try { res.json(await closeBrowser()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

const server = app.listen(port, host, () => console.log(`RJCSC SSO panel listening on http://${host}:${port}`));
async function shutdown() {
  server.close();
  await closeBrowser().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);