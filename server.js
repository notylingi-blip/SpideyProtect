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
const BOT_CONFIG_FILE = path.join(DATA_DIR, "botconfig.json");
const GUILDS_FILE = path.join(DATA_DIR, "guilds.json");

const ADMIN_USER_ID = "1485940617342353594";

fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, "[]", "utf8");
if (!fs.existsSync(BOT_CONFIG_FILE)) fs.writeFileSync(BOT_CONFIG_FILE, "{}", "utf8");
if (!fs.existsSync(GUILDS_FILE)) fs.writeFileSync(GUILDS_FILE, "[]", "utf8");

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "spideyprotect-secret-key-ganti-ini",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1541101786855899177";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "GANTI_DENGAN_CLIENT_SECRET_BARU";
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/auth/discord/callback";
const API_SECRET = process.env.API_SECRET || "spidey-internal-secret";

function readDB() { try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { return []; } }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function readKeys() { try { return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")); } catch { return []; } }
function writeKeys(data) { fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2)); }
function readBotConfig() { try { return JSON.parse(fs.readFileSync(BOT_CONFIG_FILE, "utf8")); } catch { return {}; } }
function generateId() { return crypto.randomBytes(7).toString("hex"); }

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBaseUrl(req) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  return `${protocol}://${req.get("host")}`;
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect("/login");
  next();
}

function isAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.id !== ADMIN_USER_ID) {
    return res.status(403).send("Forbidden");
  }
  next();
}

// ==================== AUTH ROUTER ====================

app.get("/login", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SpideyProtect - Login</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  min-height: 100vh; font-family: Arial, sans-serif; color: white;
  background: radial-gradient(circle at 10% 0%, rgba(255,0,0,.28), transparent 30%),
              radial-gradient(circle at 90% 100%, rgba(0,110,255,.22), transparent 35%), #050505;
  display: flex; align-items: center; justify-content: center;
}
.card {
  width: 100%; max-width: 400px; padding: 40px 30px; border-radius: 20px;
  border: 1px solid rgba(90,150,255,.18); background: linear-gradient(145deg, rgba(8,31,57,.92), rgba(4,15,28,.95));
  box-shadow: 0 25px 70px rgba(0,0,0,.4); text-align: center;
}
.logo {
  width: 70px; height: 70px; margin: 0 auto 16px; border-radius: 20px;
  display: flex; align-items: center; justify-content: center; font-size: 36px;
  background: linear-gradient(135deg, #ffffff, #dce9ff); color: #d40000;
  box-shadow: 0 0 35px rgba(0,110,255,.25), 0 0 25px rgba(255,0,0,.18);
}
h1 { font-size: 26px; font-weight: 850; margin-bottom: 6px; }
p { color: rgba(255,255,255,.55); font-size: 13px; margin-bottom: 30px; }
.discord-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; padding: 14px 20px; border: none; border-radius: 12px;
  background: #5865F2; color: white; font-size: 15px; font-weight: 800;
  cursor: pointer; text-decoration: none; transition: transform .2s, filter .2s;
}
.discord-btn:hover { transform: translateY(-2px); filter: brightness(1.1); }
</style>
</head>
<body>
<div class="card">
  <div class="logo">🕷️</div>
  <h1>SpideyProtect</h1>
  <p>Login with Discord to protect your Lua scripts.</p>
  <a class="discord-btn" href="/auth/discord">Login with Discord</a>
</div>
</body>
</html>`);
});

app.get("/auth/discord", (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("/login");

  try {
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token } = tokenRes.data;
    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const discordUser = userRes.data;
    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`,
    };

    res.redirect("/");
  } catch (err) {
    console.error("Discord OAuth error:", err?.response?.data || err.message);
    res.redirect("/login?error=1");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ==================== API ENDPOINTS ====================

app.get("/api/scripts", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;
  res.json(
    db.filter((s) => s.ownerId === userId).map((s) => ({
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      createdAt: s.createdAt,
    }))
  );
});

app.get("/api/scripts/internal", (req, res) => {
  if (req.headers["x-api-secret"] !== API_SECRET) return res.status(403).json({ error: "Forbidden" });
  const db = readDB();
  const ownerId = req.query.ownerId;
  const filtered = ownerId ? db.filter((s) => s.ownerId === ownerId) : db;
  res.json(filtered.map((s) => ({
    id: s.id,
    name: s.name,
    enabled: s.enabled,
    ownerId: s.ownerId,
    ownerUsername: s.ownerUsername,
    guildId: s.guildId,
  })));
});

app.post("/api/scripts", requireAuth, (req, res) => {
  const { name, source, guildId } = req.body;
  if (!name || typeof name !== "string") return res.status(400).json({ error: "Script name required" });
  if (!source || typeof source !== "string") return res.status(400).json({ error: "Lua source required" });

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
    guildId: guildId || null,
    createdAt: new Date().toISOString(),
  };

  const db = readDB();
  db.push(script);
  writeDB(db);

  const base = getBaseUrl(req);
  res.json({
    success: true,
    script: { id: script.id, name: script.name, enabled: script.enabled, createdAt: script.createdAt },
    loader: `${base}/api/loader/${id}.lua`,
    executeLoader: `${base}/api/execute/${id}`,
  });
});

app.post("/api/scripts/:id/toggle", requireAuth, (req, res) => {
  const db = readDB();
  const script = db.find((x) => x.id === req.params.id);
  if (!script) return res.status(404).json({ error: "Script not found" });
  if (script.ownerId !== req.session.user.id) return res.status(403).json({ error: "Forbidden" });

  script.enabled = !script.enabled;
  writeDB(db);
  res.json({ success: true, enabled: script.enabled });
});

app.delete("/api/scripts/:id", requireAuth, (req, res) => {
  const db = readDB();
  const index = db.findIndex((x) => x.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Script not found" });
  if (db[index].ownerId !== req.session.user.id) return res.status(403).json({ error: "Forbidden" });

  const filepath = path.join(SCRIPTS_DIR, db[index].filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

  db.splice(index, 1);
  writeDB(db);
  res.json({ success: true });
});

// ==================== LOADER ENGINE (LUA FORMAT RECOVERY) ====================

app.all("/api/loader/:id.lua", (req, res) => {
  const scriptId = req.params.id;
  const db = readDB();
  const script = db.find((x) => x.id === scriptId);

  function sendLuaKick(reason) {
    return res.status(200).type("text/plain").set("Cache-Control", "no-store").send(`
local plr = game:GetService("Players").LocalPlayer
if plr then
    plr:Kick("[SpideyProtect] ${reason}")
end
    `);
  }

  if (!script) return sendLuaKick("Script Not Found");

  const userAgent = req.headers["user-agent"] || "";
  const isRoblox = userAgent.includes("Roblox") || userAgent.includes("Lua") || req.query.hwid || req.headers["roblox-id"];

  let key = req.headers["x-script-key"] || req.query.key || (req.body && req.body.key);

  const botConfig = readBotConfig();
  const isFreeMode = botConfig[script.guildId]?.freeMode?.[scriptId] === true;
  const base = getBaseUrl(req);

  // 1. Apabila dipanggil Roblox tanpa parameter key -> Kirim Bootstrap Script yang membaca script_key
  if (isRoblox && !key) {
    const bootstrapCode = `
local scriptKey = _G.script_key or script_key or "FREE_MODE"
local hwid = game:GetService("RbxAnalyticsService"):GetClientId()
local url = "${base}/api/loader/${scriptId}.lua?key=" .. tostring(scriptKey) .. "&hwid=" .. tostring(hwid)

local success, result = pcall(function()
    return game:HttpGet(url)
end)

if success then
    local func, err = loadstring(result)
    if func then
        func()
    else
        error("[SpideyProtect Error]: " .. tostring(err))
    end
else
    error("[SpideyProtect Error]: Failed to reach server")
end
    `.trim();

    return res.status(200).type("text/plain").set("Cache-Control", "no-store").send(bootstrapCode);
  }

  // 2. Apabila dipanggil via Browser -> Tampilkan Website Loader Format script_key
  if (!isRoblox && !key) {
    const loaderCode = isFreeMode 
      ? `loadstring(game:HttpGet("${base}/api/loader/${scriptId}.lua"))()` 
      : `script_key = "YOUR_KEY_HERE"\nloadstring(game:HttpGet("${base}/api/loader/${scriptId}.lua"))()`;

    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SpideyProtect • ${escapeHtml(script.name)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  min-height: 100vh; font-family: 'Segoe UI', Arial, sans-serif;
  background: #050505; color: white; display: flex; align-items: center; justify-content: center; padding: 20px;
}
.card {
  max-width: 600px; width: 100%; padding: 30px; border-radius: 16px;
  background: #0d0d0d; border: 1px solid rgba(255,255,255,0.1); text-align: center;
}
.code-block {
  background: #000; border: 1px solid #222; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: left;
}
code { font-family: monospace; color: #00ff88; word-break: break-all; }
button {
  width: 100%; padding: 12px; background: #e00000; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;
}
</style>
</head>
<body>
<div class="card">
  <h1>🕷️ SpideyProtect</h1>
  <p>Script: <strong>${escapeHtml(script.name)}</strong></p>
  <div class="code-block">
    <code>${escapeHtml(loaderCode)}</code>
  </div>
  <button onclick="navigator.clipboard.writeText('${escapeHtml(loaderCode)}')">📋 Copy Loader</button>
</div>
</body>
</html>`);
  }

  // 3. Verifikasi Eksekusi (Free Mode / Key Validation)
  let isFreeModeRequest = (key && key.toUpperCase() === "FREE_MODE");

  if (isFreeModeRequest || isFreeMode) {
    if (!isFreeMode && !isFreeModeRequest) return sendLuaKick("Free Mode Not Enabled");
    if (!script.enabled) return sendLuaKick("Script Disabled");

    const fp = path.join(SCRIPTS_DIR, script.filename);
    if (!fs.existsSync(fp)) return sendLuaKick("Source Missing");
    
    return res.status(200).type("text/plain").set("Cache-Control", "no-store").send(fs.readFileSync(fp, "utf8"));
  }

  // 4. Validasi Key & HWID
  const keys = readKeys();
  const keyData = keys.find((k) => k.key.toLowerCase().trim() === key.toLowerCase().trim());

  if (!keyData) return sendLuaKick("Invalid Key");
  if (keyData.expiry && new Date(keyData.expiry) < new Date()) return sendLuaKick("Key Expired");
  if (keyData.scriptId && keyData.scriptId !== scriptId) return sendLuaKick("Key Not Valid For This Script");

  const clientHwid = req.query.hwid ? String(req.query.hwid).trim() : null;
  if (keyData.hwid) {
    if (clientHwid && clientHwid !== keyData.hwid) return sendLuaKick("HWID Mismatch");
  } else if (clientHwid) {
    keyData.hwid = clientHwid;
    const allKeys = readKeys();
    const idx = allKeys.findIndex((k) => k.key === keyData.key);
    if (idx !== -1) {
      allKeys[idx].hwid = clientHwid;
      writeKeys(allKeys);
    }
  }

  if (!script.enabled) return sendLuaKick("Script Disabled");

  const fp = path.join(SCRIPTS_DIR, script.filename);
  if (!fs.existsSync(fp)) return sendLuaKick("Source Missing");

  return res.status(200).type("text/plain").set("Cache-Control", "no-store").send(fs.readFileSync(fp, "utf8"));
});

app.get("/files/loaders/:id.lua", (req, res) => {
  res.redirect(`/api/loader/${req.params.id}.lua`);
});

// ==================== ADMIN & BOT ROUTER ====================

app.get("/api/freemode/:guildId/:scriptId", (req, res) => {
  if (req.headers["x-api-secret"] !== API_SECRET) return res.status(403).json({ error: "Forbidden" });
  const { guildId, scriptId } = req.params;
  const botConfig = readBotConfig();
  res.json({ freeMode: botConfig[guildId]?.freeMode?.[scriptId] === true });
});

app.post("/api/admin/guilds/update", (req, res) => {
  if (req.headers["x-api-secret"] !== API_SECRET) return res.status(403).json({ error: "Forbidden" });
  fs.writeFileSync(GUILDS_FILE, JSON.stringify(req.body.guilds || [], null, 2));
  res.json({ success: true });
});

app.get("/api/admin/guilds", isAdmin, (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(GUILDS_FILE, "utf8"))); } catch { res.json([]); }
});

app.get("/api/admin/scripts", isAdmin, (req, res) => {
  const db = readDB();
  const scriptsWithSource = db.map((script) => {
    const filepath = path.join(SCRIPTS_DIR, script.filename);
    const source = fs.existsSync(filepath) ? fs.readFileSync(filepath, "utf8") : null;
    return { ...script, source };
  });
  res.json(scriptsWithSource);
});

// ==================== DASHBOARD PAGE ====================

app.get("/", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;
  const user = req.session.user;

  const cards = db
    .filter((s) => s.ownerId === userId)
    .map((s) => {
      const base = getBaseUrl(req);
      const loaderPage = `${base}/api/loader/${s.id}.lua`;
      const loaderCodeDisplay = `script_key = "YOUR_KEY_HERE"\nloadstring(game:HttpGet("${base}/api/loader/${s.id}.lua"))()`;

      return `
<div class="script-card">
  <div class="script-info">
    <div class="script-icon">🕷️</div>
    <div>
      <div class="script-name">${escapeHtml(s.name)}</div>
      <div class="script-status ${s.enabled ? "on" : "off"}">${s.enabled ? "● Enabled" : "● Disabled"}</div>
    </div>
  </div>
  <div class="script-menu">
    <button class="dots" onclick="toggleMenu('${s.id}')">⋮</button>
    <div class="menu" id="menu-${s.id}">
      <button onclick='openLoader(${JSON.stringify(loaderPage)})'>🔗 Open Page</button>
      <button onclick='copyLoaderCode(${JSON.stringify(loaderCodeDisplay)})'>📋 Copy Loader</button>
      <button onclick="toggleScript('${s.id}')">${s.enabled ? "⏸ Disable" : "▶ Enable"}</button>
      <button class="delete" onclick="deleteScript('${s.id}')">🗑 Delete</button>
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
body { min-height: 100vh; font-family: Arial, sans-serif; color: white; background: #050505; }
.header { padding: 20px; display: flex; align-items: center; justify-content: space-between; background: #111; }
.container { width: min(1000px, 90%); margin: 30px auto; }
.hero { padding: 25px; background: #111; border-radius: 12px; border: 1px solid #222; }
.form-grid { display: grid; gap: 10px; margin-top: 15px; }
input, textarea { width: 100%; padding: 12px; background: #000; border: 1px solid #333; color: white; border-radius: 8px; }
textarea { height: 120px; }
button.upload-button { padding: 12px; background: #e00000; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
.scripts { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; margin-top: 20px; }
.script-card { background: #111; border: 1px solid #222; border-radius: 12px; padding: 15px; display: flex; justify-content: space-between; align-items: center; }
.dots { background: none; border: none; color: white; font-size: 20px; cursor: pointer; }
.menu { display: none; position: absolute; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 5px; }
.menu.show { display: block; }
.menu button { display: block; width: 100%; text-align: left; padding: 8px; background: none; border: none; color: white; cursor: pointer; }
.menu button.delete { color: #ff4444; }
</style>
</head>
<body>
<header class="header">
  <h1>🕷️ SpideyProtect</h1>
  <div>
    <span>${escapeHtml(user.username)}</span>
    <a href="/logout" style="color:#ff4444; margin-left: 10px;">Logout</a>
  </div>
</header>
<main class="container">
  <div class="hero">
    <h2>Upload & Protect Script</h2>
    <div class="form-grid">
      <input id="scriptName" placeholder="Script Name...">
      <textarea id="scriptSource" placeholder="Paste your Lua script source here..."></textarea>
      <button class="upload-button" onclick="uploadScript()">Upload Script</button>
    </div>
  </div>
  <div class="scripts">${cards || "<p>No scripts found.</p>"}</div>
</main>
<script>
function toggleMenu(id) {
  document.querySelectorAll(".menu").forEach(m => m.classList.remove("show"));
  const m = document.getElementById("menu-" + id);
  if (m) m.classList.toggle("show");
}
async function uploadScript() {
  const name = document.getElementById("scriptName").value;
  const source = document.getElementById("scriptSource").value;
  if (!name || !source) return alert("Fill all fields");
  const res = await fetch("/api/scripts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, source })
  });
  if (res.ok) location.reload();
}
async function toggleScript(id) {
  await fetch("/api/scripts/" + id + "/toggle", { method: "POST" });
  location.reload();
}
async function deleteScript(id) {
  if (!confirm("Delete?")) return;
  await fetch("/api/scripts/" + id, { method: "DELETE" });
  location.reload();
}
function copyLoaderCode(code) { navigator.clipboard.writeText(code); alert("Copied!"); }
function openLoader(url) { window.open(url, "_blank"); }
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`SpideyProtect running on port ${PORT}`);
});
