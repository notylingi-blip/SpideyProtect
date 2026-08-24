const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const session = require("express-session");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const SCRIPTS_DIR = path.join(DATA_DIR, "scripts");
const DB_FILE = path.join(DATA_DIR, "scripts.json");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");

fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}

if (!fs.existsSync(KEYS_FILE)) {
  fs.writeFileSync(KEYS_FILE, "[]", "utf8");
}

app.use(express.json({ limit: "15mb" }));

app.use(session({
  secret: process.env.SESSION_SECRET || "spideyprotect-secret-key-ganti-ini",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1541101786855899177";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "GANTI_DENGAN_CLIENT_SECRET_BARU";
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/auth/discord/callback";
const API_SECRET = process.env.API_SECRET || "spidey-internal-secret";

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function readKeys() {
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function generateId() {
  return crypto.randomBytes(16).toString("hex");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBaseUrl(req) {
  const protocol =
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "https";
  return `${protocol}://${req.get("host")}`;
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/login");
  }
  next();
}

/*

AUTH - LOGIN PAGE

*/

app.get("/login", (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect("/");
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SpideyProtect - Login</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  min-height: 100vh;
  font-family: Arial, Helvetica, sans-serif;
  color: white;
  background:
    radial-gradient(circle at 10% 0%, rgba(255,0,0,.28), transparent 30%),
    radial-gradient(circle at 90% 100%, rgba(0,110,255,.22), transparent 35%),
    #050505;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card {
  width: 100%;
  max-width: 400px;
  padding: 40px 30px;
  border-radius: 20px;
  border: 1px solid rgba(90,150,255,.18);
  background: linear-gradient(145deg, rgba(8,31,57,.92), rgba(4,15,28,.95));
  box-shadow: 0 25px 70px rgba(0,0,0,.4);
  text-align: center;
}
.logo {
  width: 70px;
  height: 70px;
  margin: 0 auto 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  background: linear-gradient(135deg, #ffffff, #dce9ff);
  color: #d40000;
  box-shadow: 0 0 35px rgba(0,110,255,.25), 0 0 25px rgba(255,0,0,.18);
}
h1 { font-size: 26px; font-weight: 850; margin-bottom: 6px; }
p { color: rgba(255,255,255,.55); font-size: 13px; margin-bottom: 30px; }
.discord-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px 20px;
  border: none;
  border-radius: 12px;
  background: #5865F2;
  color: white;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  text-decoration: none;
  transition: transform .2s, filter .2s;
}
.discord-btn:hover { transform: translateY(-2px); filter: brightness(1.1); }
.discord-btn svg { width: 22px; height: 22px; fill: white; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">🕷️</div>
  <h1>SpideyProtect</h1>
  <p>Login dengan Discord untuk melindungi script Lua kamu.</p>
  <a class="discord-btn" href="/auth/discord">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
    Login dengan Discord
  </a>
</div>
</body>
</html>`);
});

/*

AUTH - REDIRECT KE DISCORD

*/

app.get("/auth/discord", (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify"
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

/*

AUTH - CALLBACK DARI DISCORD

*/

app.get("/auth/discord/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect("/login");
  }

  try {

    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_REDIRECT_URI
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const { access_token } = tokenRes.data;

    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const discordUser = userRes.data;

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`
    };

    res.redirect("/");

  } catch (err) {
    console.error("Discord OAuth error:", err?.response?.data || err.message);
    res.redirect("/login?error=1");
  }
});

/*

AUTH - LOGOUT

*/

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

/*

API - LIST SCRIPTS (hanya punya user sendiri)

*/

app.get("/api/scripts", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;

  res.json(
    db
      .filter(script => script.ownerId === userId)
      .map(script => ({
        id: script.id,
        name: script.name,
        enabled: script.enabled,
        createdAt: script.createdAt
      }))
  );
});

/*

INTERNAL API - LIST ALL SCRIPTS (dipanggil bot.js)

*/

app.get("/api/scripts/internal", (req, res) => {
  const secret = req.headers["x-api-secret"];

  if (secret !== API_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const db = readDB();

  res.json(
    db.map(script => ({
      id: script.id,
      name: script.name,
      enabled: script.enabled
    }))
  );
});

/*

API - UPLOAD SCRIPT

*/

app.post("/api/scripts", requireAuth, (req, res) => {
  const { name, source } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Script name is required" });
  }

  if (!source || typeof source !== "string") {
    return res.status(400).json({ error: "Lua source is required" });
  }

  if (source.length > 10 * 1024 * 1024) {
    return res.status(413).json({ error: "File too large. Maximum 10MB." });
  }

  const id = generateId();
  const filename = `${id}.lua`;
  const filepath = path.join(SCRIPTS_DIR, filename);

  fs.writeFileSync(filepath, source, "utf8");

  const script = {
    id,
    name: name.trim().slice(0, 100),
    filename,
    enabled: true,
    ownerId: req.session.user.id,
    ownerUsername: req.session.user.username,
    createdAt: new Date().toISOString()
  };

  const db = readDB();
  db.push(script);
  writeDB(db);

  const loaderPage = `${getBaseUrl(req)}/files/loaders/${id}.lua`;
  const executeLoader = `${getBaseUrl(req)}/api/execute/${id}`;

  res.json({
    success: true,
    script: {
      id: script.id,
      name: script.name,
      enabled: script.enabled,
      createdAt: script.createdAt
    },
    loader: loaderPage,
    executeLoader
  });
});

/*

API - TOGGLE (hanya owner)

*/

app.post("/api/scripts/:id/toggle", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;

  const script = db.find(x => x.id === req.params.id);

  if (!script) {
    return res.status(404).json({ error: "Script not found" });
  }

  if (script.ownerId !== userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  script.enabled = !script.enabled;
  writeDB(db);

  res.json({ success: true, enabled: script.enabled });
});

/*

API - DELETE (hanya owner)

*/

app.delete("/api/scripts/:id", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;

  const index = db.findIndex(x => x.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Script not found" });
  }

  if (db[index].ownerId !== userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const script = db[index];
  const filepath = path.join(SCRIPTS_DIR, script.filename);

  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  db.splice(index, 1);
  writeDB(db);

  res.json({ success: true });
});

/*

INTERNAL API - DELETE SCRIPT (dipanggil bot.js)

*/

app.delete("/api/scripts/internal/:id", (req, res) => {
  const secret = req.headers["x-api-secret"];

  if (secret !== API_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const db = readDB();
  const index = db.findIndex(x => x.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Script not found" });
  }

  const script = db[index];
  const filepath = path.join(SCRIPTS_DIR, script.filename);

  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  db.splice(index, 1);
  writeDB(db);

  res.json({ success: true, name: script.name });
});

/*

API - EXECUTE (dipanggil loader lama, tanpa key)

*/

app.get("/api/execute/:id", (req, res) => {
  const db = readDB();
  const script = db.find(x => x.id === req.params.id);

  if (!script) {
    return res
      .status(404)
      .type("text/plain")
      .send("-- SpideyProtect: Script not found");
  }

  if (!script.enabled) {
    return res
      .status(403)
      .type("text/plain")
      .send("-- SpideyProtect: Script disabled");
  }

  const filepath = path.join(SCRIPTS_DIR, script.filename);

  if (!fs.existsSync(filepath)) {
    return res
      .status(404)
      .type("text/plain")
      .send("-- SpideyProtect: Source missing");
  }

  const source = fs.readFileSync(filepath, "utf8");

  res
    .status(200)
    .type("text/plain")
    .set("Cache-Control", "no-store")
    .send(source);
});

/*

KEY LOADER - endpoint utama yang dipakai user
Format loader:
  script_key="XXXXXX-XXXXXX-XXXXXX-XXXXXX";
  loadstring(game:HttpGet("https://domain/api/loader/SCRIPT_ID.lua"))()

*/

app.get("/api/loader/:id.lua", (req, res) => {
  const scriptId = req.params.id;
  // Support both Luarmor-style (key from global var via query) and header
  const key = req.query.key || req.headers["x-script-key"];

  // If no key in request, return a Lua loader that reads script_key global and re-calls with it
  if (!key) {
    const base = req.headers["x-forwarded-proto"]
      ? `${req.headers["x-forwarded-proto"]}://${req.get("host")}`
      : `${req.protocol}://${req.get("host")}`;
    const selfUrl = `${base}/api/loader/${scriptId}.lua`;
    const luaLoader = `-- SpideyProtect Loader\nif not script_key then\n    error("[SpideyProtect] script_key is required. Set it before loading:\\n  script_key=\\"YOUR_KEY\\"")\nend\nlocal url = "${selfUrl}?key=" .. tostring(script_key)\nloadstring(game:HttpGet(url, true))()\n`;
    return res
      .status(200)
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .send(luaLoader);
  }

  const keys = readKeys();
  const keyData = keys.find(k => k.key === key.toUpperCase().trim());

  if (!keyData) {
    return res
      .status(403)
      .type("text/plain")
      .send("-- SpideyProtect: Invalid key");
  }

  if (keyData.expiry && new Date(keyData.expiry) < new Date()) {
    return res
      .status(403)
      .type("text/plain")
      .send("-- SpideyProtect: Key expired");
  }

  if (keyData.scriptId && keyData.scriptId !== scriptId) {
    return res
      .status(403)
      .type("text/plain")
      .send("-- SpideyProtect: Key not valid for this script");
  }

  const db = readDB();
  const script = db.find(x => x.id === scriptId);

  if (!script) {
    return res
      .status(404)
      .type("text/plain")
      .send("-- SpideyProtect: Script not found");
  }

  if (!script.enabled) {
    return res
      .status(403)
      .type("text/plain")
      .send("-- SpideyProtect: Script disabled");
  }

  const filepath = path.join(SCRIPTS_DIR, script.filename);

  if (!fs.existsSync(filepath)) {
    return res
      .status(404)
      .type("text/plain")
      .send("-- SpideyProtect: Source missing");
  }

  const source = fs.readFileSync(filepath, "utf8");

  res
    .status(200)
    .type("text/plain")
    .set("Cache-Control", "no-store")
    .send(source);
});

/*

LOADER PAGE (browser)

*/

app.get("/files/loaders/:id.lua", (req, res) => {
  const db = readDB();
  const script = db.find(x => x.id === req.params.id);

  if (!script) {
    return res.status(404).send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SpideyProtect</title>
</head>
<body style="margin:0;background:#050b18;color:white;font-family:Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<h2>SpideyProtect: Script not found</h2>
</body>
</html>`);
  }

  const base = getBaseUrl(req);
  // Luarmor-style: key sebagai variabel terpisah, URL bersih tanpa query string
  const loaderCode = `script_key="YOUR_KEY_HERE";\nloadstring(game:HttpGet("${base}/api/loader/${script.id}.lua"))()`;

  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SpideyProtect • ${escapeHtml(script.name)}</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 100%; min-height: 100%; font-family: Inter, Arial, Helvetica, sans-serif;
  background: radial-gradient(circle at 50% -10%, rgba(0,105,255,.28), transparent 40%),
              radial-gradient(circle at 0% 50%, rgba(220,0,0,.22), transparent 35%), #020713;
  color: white; }
body { min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 25px 15px; }
.page { width: 100%; max-width: 760px; }
.brand { text-align: center; margin-bottom: 20px; }
.logo { width: 58px; height: 58px; margin: 0 auto 10px; border-radius: 17px; display: flex; align-items: center;
  justify-content: center; font-size: 30px; background: linear-gradient(135deg, #ffffff, #dce9ff); color: #d40000;
  box-shadow: 0 0 35px rgba(0,110,255,.25), 0 0 25px rgba(255,0,0,.18); }
.brand h1 { margin: 0; font-size: 26px; font-weight: 850; letter-spacing: -.5px; }
.brand p { margin: 6px 0 0; color: rgba(255,255,255,.55); font-size: 12px; }
.card { width: 100%; padding: 25px; border-radius: 20px; border: 1px solid rgba(90,150,255,.18);
  background: linear-gradient(145deg, rgba(8,31,57,.92), rgba(4,15,28,.95));
  box-shadow: 0 25px 70px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.04); }
.card-title { text-align: center; font-size: 27px; font-weight: 850; color: #168cff; margin-bottom: 9px;
  text-shadow: 0 0 18px rgba(0,130,255,.25); }
.description { text-align: center; line-height: 1.55; font-size: 14px; color: rgba(255,255,255,.62);
  max-width: 570px; margin: 0 auto 25px; }
.script-name { text-align: center; margin-bottom: 15px; color: white; font-size: 13px; font-weight: 700; }
.script-name span { color: #ff4242; }
.loader-title { margin-bottom: 7px; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: rgba(255,255,255,.55); }
.loader-wrap { width: 100%; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;
  scrollbar-width: thin; border-radius: 12px; background: #02060c;
  border: 1px solid rgba(255,255,255,.1); box-shadow: inset 0 0 20px rgba(0,0,0,.25); }
.loader-wrap::-webkit-scrollbar { height: 7px; }
.loader-wrap::-webkit-scrollbar-track { background: #060b12; }
.loader-wrap::-webkit-scrollbar-thumb { background: linear-gradient(90deg, #e00000, #168cff); border-radius: 20px; }
.loader-code { display: block; width: max-content; min-width: 100%; padding: 16px 18px; color: #e7edf7;
  font-family: "Courier New", monospace; font-size: 13px; line-height: 1.5; white-space: pre; user-select: all; }
.copy-button { width: 100%; margin-top: 12px; padding: 13px; border: none; border-radius: 11px; cursor: pointer;
  color: white; font-size: 14px; font-weight: 800;
  background: linear-gradient(90deg, #e00000 0%, #f00000 35%, #087cff 100%);
  box-shadow: 0 8px 25px rgba(0,75,255,.12); transition: transform .2s, filter .2s; }
.copy-button:hover { transform: translateY(-2px); filter: brightness(1.08); }
.copy-button:active { transform: translateY(0); }
.security { margin-top: 18px; padding: 14px; border-radius: 12px; background: rgba(255,255,255,.025);
  border: 1px solid rgba(255,255,255,.07); text-align: center; color: rgba(255,255,255,.55);
  font-size: 12px; line-height: 1.5; }
.security strong { color: #ffffff; }
.footer { margin-top: 15px; text-align: center; color: rgba(255,255,255,.3); font-size: 10px; }
.footer b { color: #168cff; }
@media(max-width:600px) {
  body { padding: 18px 12px; }
  .card { padding: 19px; border-radius: 18px; }
  .card-title { font-size: 23px; }
  .description { font-size: 13px; }
  .loader-code { font-size: 12px; padding: 15px; }
}
</style>
</head>
<body>
<div class="page">
  <div class="brand">
    <div class="logo">🕷️</div>
    <h1>SpideyProtect</h1>
    <p>Lua Protection System</p>
  </div>
  <div class="card">
    <div class="card-title">This script can't be viewed in a browser</div>
    <div class="description">
      For security, the source is only delivered to the script at runtime.
      Use the loader below in your script.
    </div>
    <div class="script-name">SCRIPT: <span>${escapeHtml(script.name)}</span></div>
    <div class="loader-title">LOADER</div>
    <div class="loader-wrap">
      <code class="loader-code" id="loaderCode">${escapeHtml(loaderCode)}</code>
    </div>
    <button class="copy-button" onclick="copyLoader()">Copy loader</button>
    <div class="security">
      🔒 <strong>Source Protected</strong><br>
      The original source is not displayed on this page.
    </div>
  </div>
  <div class="footer">Protected by <b>SpideyProtect</b> 🕷️</div>
</div>
<script>
const loader = ${JSON.stringify(loaderCode)};
async function copyLoader() {
  const button = document.querySelector(".copy-button");
  try {
    await navigator.clipboard.writeText(loader);
    button.textContent = "✓ Loader copied!";
    setTimeout(() => { button.textContent = "Copy loader"; }, 1800);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = loader;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    button.textContent = "✓ Loader copied!";
    setTimeout(() => { button.textContent = "Copy loader"; }, 1800);
  }
}
</script>
</body>
</html>`);
});

/*

MAIN DASHBOARD

*/

app.get("/", requireAuth, (req, res) => {

  const db = readDB();
  const userId = req.session.user.id;
  const user = req.session.user;

  const cards = db
    .filter(script => script.ownerId === userId)
    .map(script => {

      const base = getBaseUrl(req);
      const loaderPage = `${base}/files/loaders/${script.id}.lua`;
      const loaderCode = `script_key="YOUR_KEY_HERE";\nloadstring(game:HttpGet("${base}/api/loader/${script.id}.lua?key="..script_key))()`;
      const loaderCodeDisplay = `script_key="YOUR_KEY_HERE";\nloadstring(game:HttpGet("${base}/api/loader/${script.id}.lua"))()`;

      return `
<div class="script-card">
<div class="script-info">
    <div class="script-icon">🕷️</div>
    <div>
        <div class="script-name">${escapeHtml(script.name)}</div>
        <div class="script-status ${script.enabled ? "on" : "off"}">
            ${script.enabled ? "● Enabled" : "● Disabled"}
        </div>
    </div>
</div>
<div class="script-menu">
    <button class="dots" onclick="toggleMenu('${script.id}')">⋮</button>
    <div class="menu" id="menu-${script.id}">
        <button onclick='openLoader(${JSON.stringify(loaderPage)})'>🔗 Open Loader</button>
        <button onclick='copyLoaderCode(${JSON.stringify(loaderCodeDisplay)})'>📋 Copy Loader</button>
        <button onclick="toggleScript('${script.id}')">
            ${script.enabled ? "⏸ Disable" : "▶ Enable"}
        </button>
        <button class="delete" onclick="deleteScript('${script.id}')">🗑 Delete</button>
    </div>
</div>
</div>`;
    }).join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SpideyProtect</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; font-family: Arial, Helvetica, sans-serif; color: white;
  background: radial-gradient(circle at 10% 0%, rgba(255,0,0,.28), transparent 30%),
              radial-gradient(circle at 90% 100%, rgba(0,110,255,.22), transparent 35%), #050505; }
.header { padding: 20px 30px; display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid rgba(255,255,255,.1);
  background: linear-gradient(90deg, #950000, #e00000, #101010); }
.brand { display: flex; align-items: center; gap: 12px; }
.logo { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;
  border-radius: 13px; background: white; color: #c00000; font-size: 25px;
  box-shadow: 0 0 25px rgba(255,0,0,.3); }
.brand h1 { font-size: 23px; font-weight: 800; }
.brand span { display: block; margin-top: 3px; color: rgba(255,255,255,.65); font-size: 11px; }
.user-info { display: flex; align-items: center; gap: 10px; }
.user-avatar { width: 36px; height: 36px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); }
.user-name { font-size: 13px; font-weight: 700; color: white; }
.logout-btn { padding: 7px 14px; border: 1px solid rgba(255,255,255,.2); border-radius: 8px;
  background: transparent; color: rgba(255,255,255,.7); font-size: 12px; cursor: pointer;
  text-decoration: none; transition: background .2s; }
.logout-btn:hover { background: rgba(255,255,255,.1); }
.container { width: min(1100px, calc(100% - 30px)); margin: 35px auto; }
.hero { padding: 28px; border-radius: 20px;
  background: linear-gradient(135deg, rgba(255,0,0,.16), rgba(0,100,255,.07));
  border: 1px solid rgba(255,255,255,.1); }
.hero h2 { font-size: 27px; margin-bottom: 8px; }
.hero p { color: #aaa; font-size: 14px; }
.form-grid { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
input, textarea { width: 100%; outline: none; border: 1px solid rgba(255,255,255,.12);
  border-radius: 11px; background: #101010; color: white; padding: 13px; font-family: inherit; }
textarea { grid-column: 1 / -1; min-height: 180px; resize: vertical; }
.file-row { display: flex; align-items: center; gap: 10px; grid-column: 1 / -1; }
.file-label { display: inline-flex; align-items: center; justify-content: center;
  padding: 12px 18px; border-radius: 11px; background: white; color: #a00000;
  font-size: 13px; font-weight: 800; cursor: pointer; }
.file-name { color: #888; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#fileInput { display: none; }
.upload-button { grid-column: 1 / -1; width: 100%; padding: 14px; border: none; border-radius: 11px;
  background: linear-gradient(90deg, #d00000, #006eff); color: white; font-weight: 800; cursor: pointer; }
.section-title { margin: 25px 0 12px; color: #aaa; font-size: 15px; }
.scripts { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px,1fr)); gap: 15px; }
.script-card { position: relative; display: flex; align-items: center; justify-content: space-between;
  padding: 18px; border-radius: 17px; background: linear-gradient(145deg, #151515, #0d0d0d);
  border: 1px solid rgba(255,255,255,.08); }
.script-info { display: flex; align-items: center; gap: 13px; }
.script-icon { width: 45px; height: 45px; display: flex; align-items: center; justify-content: center;
  border-radius: 12px; background: linear-gradient(135deg, #e00000, #006eff); font-size: 22px; }
.script-name { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 15px; font-weight: 700; }
.script-status { margin-top: 4px; font-size: 11px; }
.script-status.on { color: #54ff88; }
.script-status.off { color: #ff4d4d; }
.script-menu { position: relative; }
.dots { width: 38px; height: 38px; border: none; border-radius: 10px; background: #1c1c1c;
  color: white; font-size: 23px; cursor: pointer; }
.menu { display: none; position: absolute; z-index: 100; right: 0; top: 45px; width: 180px;
  padding: 6px; border-radius: 12px; background: #161616;
  border: 1px solid rgba(255,255,255,.1); box-shadow: 0 15px 40px rgba(0,0,0,.6); }
.menu.show { display: block; }
.menu button { width: 100%; padding: 10px; border: none; border-radius: 8px;
  background: transparent; color: #eee; text-align: left; cursor: pointer; }
.menu button:hover { background: #252525; }
.menu .delete { color: #ff4d4d; }
.empty { padding: 50px; text-align: center; color: #666;
  border: 1px dashed rgba(255,255,255,.12); border-radius: 18px; }
@media(max-width:700px) {
  .header { padding: 18px; }
  .user-name { display: none; }
  .container { width: calc(100% - 20px); margin-top: 20px; }
  .hero { padding: 20px; }
  .form-grid { grid-template-columns: 1fr; }
  .file-row { flex-direction: column; align-items: stretch; }
  textarea { grid-column: auto; }
  .upload-button { grid-column: auto; }
}
</style>
</head>
<body>
<header class="header">
  <div class="brand">
    <div class="logo">🕷️</div>
    <div>
      <h1>SpideyProtect</h1>
      <span>Lua Protection System</span>
    </div>
  </div>
  <div class="user-info">
    <img class="user-avatar" src="${escapeHtml(user.avatar)}" alt="avatar">
    <span class="user-name">${escapeHtml(user.username)}</span>
    <a class="logout-btn" href="/logout">Logout</a>
  </div>
</header>
<main class="container">
  <section class="hero">
    <h2>Protect Your Scripts 🕷️</h2>
    <p>Upload a Lua/TXT file or paste your source manually.</p>
    <div class="form-grid">
      <input id="scriptName" placeholder="Script name...">
      <div class="file-row">
        <label class="file-label" for="fileInput">📁 Upload File</label>
        <input id="fileInput" type="file" accept=".lua,.txt,text/plain">
        <span class="file-name" id="fileName">No file selected</span>
      </div>
      <textarea id="scriptSource" placeholder="Paste your Lua source here..."></textarea>
      <button class="upload-button" onclick="uploadScript()">🕷️ Protect &amp; Upload</button>
    </div>
  </section>
  <div class="section-title">Your Scripts</div>
  <section class="scripts">
    ${cards || `<div class="empty">🕷️ No scripts yet.<br>Upload your first Lua script above.</div>`}
  </section>
</main>
<script>
const fileInput = document.getElementById("fileInput");
const fileName = document.getElementById("fileName");
const scriptName = document.getElementById("scriptName");
const scriptSource = document.getElementById("scriptSource");

fileInput.addEventListener("change", function() {
  const file = this.files[0];
  if (!file) return;
  const fn = file.name.toLowerCase();
  if (!fn.endsWith(".lua") && !fn.endsWith(".txt")) {
    alert("Only .lua or .txt files are allowed!");
    this.value = "";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert("Maximum file size is 10MB.");
    this.value = "";
    return;
  }
  fileName.textContent = file.name;
  scriptName.value = file.name.replace(/\.(lua|txt)$/i, "");
  const reader = new FileReader();
  reader.onload = function(event) { scriptSource.value = event.target.result; };
  reader.readAsText(file);
});

function toggleMenu(id) {
  document.querySelectorAll(".menu").forEach(m => m.classList.remove("show"));
  const menu = document.getElementById("menu-" + id);
  if (menu) menu.classList.toggle("show");
}

document.addEventListener("click", function(event) {
  if (!event.target.closest(".script-menu")) {
    document.querySelectorAll(".menu").forEach(m => m.classList.remove("show"));
  }
});

async function uploadScript() {
  const name = scriptName.value.trim();
  const source = scriptSource.value;
  if (!name) { alert("Enter script name!"); return; }
  if (!source.trim()) { alert("Enter Lua source!"); return; }
  try {
    const response = await fetch("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, source })
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Upload failed"); return; }
    location.reload();
  } catch { alert("Server error!"); }
}

async function toggleScript(id) {
  const response = await fetch("/api/scripts/" + id + "/toggle", { method: "POST" });
  if (response.ok) location.reload();
  else alert("Failed to change status");
}

async function deleteScript(id) {
  if (!confirm("Delete this script?")) return;
  const response = await fetch("/api/scripts/" + id, { method: "DELETE" });
  if (response.ok) location.reload();
  else alert("Delete failed");
}

async function copyLoaderCode(loaderCode) {
  try {
    await navigator.clipboard.writeText(loaderCode);
    alert("Loader copied!");
  } catch { alert("Failed to copy loader"); }
}

function openLoader(url) {
  window.open(url, "_blank");
}
</script>
</body>
</html>`);
});

/*

START

*/

app.listen(PORT, () => {
  console.log(`SpideyProtect running on port ${PORT}`);
});
