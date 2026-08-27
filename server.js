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

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}
if (!fs.existsSync(KEYS_FILE)) {
  fs.writeFileSync(KEYS_FILE, "[]", "utf8");
}
if (!fs.existsSync(BOT_CONFIG_FILE)) {
  fs.writeFileSync(BOT_CONFIG_FILE, "{}", "utf8");
}
if (!fs.existsSync(GUILDS_FILE)) {
  fs.writeFileSync(GUILDS_FILE, "[]", "utf8");
}

app.use(express.json({ limit: "15mb" }));

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

const DISCORD_CLIENT_ID =
  process.env.DISCORD_CLIENT_ID || "1541101786855899177";
const DISCORD_CLIENT_SECRET =
  process.env.DISCORD_CLIENT_SECRET || "GANTI_DENGAN_CLIENT_SECRET_BARU";
const DISCORD_REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/auth/discord/callback";
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

function writeKeys(data) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

function readBotConfig() {
  try {
    return JSON.parse(fs.readFileSync(BOT_CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeBotConfig(data) {
  fs.writeFileSync(BOT_CONFIG_FILE, JSON.stringify(data, null, 2));
}

// ==================== ID GENERATOR ====================
function generateId() {
  return crypto.randomBytes(7).toString("hex");
}

function generateKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 30 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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

function isAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.id !== ADMIN_USER_ID) {
    return res.status(403).send("Forbidden");
  }
  next();
}

// ==================== AUTH ====================

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
.invite-link { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 12px; width: 100%; padding: 12px 20px; border: 1px solid rgba(88,101,242,.4);
  border-radius: 12px; background: rgba(88,101,242,.12); color: rgba(255,255,255,.75);
  font-size: 13px; font-weight: 700; text-decoration: none; transition: background .2s, border-color .2s; }
.invite-link:hover { background: rgba(88,101,242,.25); border-color: rgba(88,101,242,.7); color: white; }
.invite-link svg { width: 16px; height: 16px; fill: currentColor; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">🕷️</div>
  <h1>SpideyProtect</h1>
  <p>Login with Discord to protect your Lua scripts.</p>
  <a class="discord-btn" href="/auth/discord">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
    Login with Discord
  </a>
  <a class="invite-link" href="https://discord.com/oauth2/authorize?client_id=1541101786855899177&permissions=2415937584&integration_type=0&scope=bot" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
    Invite Bot to Discord Server
  </a>
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
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = tokenRes.data;

    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
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
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// ==================== API ====================

app.get("/api/scripts", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;

  res.json(
    db
      .filter((script) => script.ownerId === userId)
      .map((script) => ({
        id: script.id,
        name: script.name,
        enabled: script.enabled,
        createdAt: script.createdAt,
      }))
  );
});

app.get("/api/scripts/internal", (req, res) => {
  const secret = req.headers["x-api-secret"];

  if (secret !== API_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const db = readDB();
  const ownerId = req.query.ownerId;

  const filtered = ownerId
    ? db.filter((script) => script.ownerId === ownerId)
    : db;

  res.json(
    filtered.map((script) => ({
      id: script.id,
      name: script.name,
      enabled: script.enabled,
      ownerId: script.ownerId,
      ownerUsername: script.ownerUsername,
      guildId: script.guildId,
    }))
  );
});

app.get("/api/scripts/internal/guild/:guildId", (req, res) => {
  const secret = req.headers["x-api-secret"];

  if (secret !== API_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const db = readDB();
  const guildId = req.params.guildId;

  const filtered = db.filter((script) => script.guildId === guildId);

  res.json(
    filtered.map((script) => ({
      id: script.id,
      name: script.name,
      enabled: script.enabled,
      ownerId: script.ownerId,
      ownerUsername: script.ownerUsername,
      guildId: script.guildId,
    }))
  );
});

app.post("/api/scripts", requireAuth, (req, res) => {
  const { name, source, guildId } = req.body;

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
    guildId: guildId || null,
    createdAt: new Date().toISOString(),
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
      createdAt: script.createdAt,
    },
    loader: loaderPage,
    executeLoader,
  });
});

app.post("/api/scripts/:id/toggle", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;

  const script = db.find((x) => x.id === req.params.id);

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

app.delete("/api/scripts/:id", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;

  const index = db.findIndex((x) => x.id === req.params.id);

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

app.delete("/api/scripts/internal/:id", (req, res) => {
  const secret = req.headers["x-api-secret"];

  if (secret !== API_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const requestOwnerId = req.headers["x-owner-id"];

  if (!requestOwnerId) {
    return res.status(400).json({ error: "x-owner-id header required" });
  }

  const db = readDB();
  const index = db.findIndex((x) => x.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Script not found" });
  }

  const script = db[index];

  if (script.ownerId !== requestOwnerId) {
    return res.status(403).json({ error: "You do not own this script" });
  }

  const filepath = path.join(SCRIPTS_DIR, script.filename);

  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  db.splice(index, 1);
  writeDB(db);

  res.json({ success: true, name: script.name });
});

app.get("/api/execute/:id", (req, res) => {
  const db = readDB();
  const script = db.find((x) => x.id === req.params.id);

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

// ==================== LOADER ENDPOINT - TAMPILAN WEB KEREN ====================
app.get("/api/loader/:id.lua", (req, res) => {
  const scriptId = req.params.id;
  const key = req.query.key || req.headers["x-script-key"];

  const db = readDB();
  const script = db.find((x) => x.id === scriptId);
  
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

  const botConfig = readBotConfig();
  const isFreeMode = botConfig[script.guildId]?.freeMode?.[scriptId] === true;
  const base = getBaseUrl(req);

  // Jika tidak ada key, tampilkan halaman web keren dengan loader
  if (!key) {
    const selfUrl = `${base}/api/loader/${scriptId}.lua`;
    
    let loaderCode;
    if (isFreeMode) {
      loaderCode = `-- SpideyProtect Loader (FREE MODE)\nloadstring(game:HttpGet("${base}/api/loader/${scriptId}.lua?freemode=true"))()\n`;
    } else {
      loaderCode = `-- SpideyProtect Loader\nif not script_key or tostring(script_key) == "" then\n    local plr = game:GetService("Players").LocalPlayer\n    if plr then\n        plr:Kick("\\nNO KEY PROVIDED\\n")\n    end\n    return\nend\nlocal ok, hwid = pcall(function()\n    return game:GetService("RbxAnalyticsService"):GetClientId()\nend)\nif not ok then hwid = tostring(game:GetService("Players").LocalPlayer.UserId) end\nlocal url = "${selfUrl}?key=" .. tostring(script_key) .. "&hwid=" .. tostring(hwid)\nloadstring(game:HttpGet(url, true))()\n`;
    }

    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SpideyProtect • ${escapeHtml(script.name)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  min-height: 100vh;
  font-family: 'Segoe UI', Arial, sans-serif;
  background: radial-gradient(circle at 10% 0%, rgba(255,0,0,0.25), transparent 35%),
              radial-gradient(circle at 90% 100%, rgba(0,110,255,0.20), transparent 35%),
              #050505;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.card {
  max-width: 650px;
  width: 100%;
  padding: 35px 30px;
  border-radius: 20px;
  border: 1px solid rgba(90,150,255,0.18);
  background: linear-gradient(145deg, rgba(8,31,57,0.92), rgba(4,15,28,0.95));
  box-shadow: 0 25px 70px rgba(0,0,0,0.6);
  text-align: center;
}
.logo {
  width: 60px;
  height: 60px;
  margin: 0 auto 14px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  background: linear-gradient(135deg, #ffffff, #dce9ff);
  color: #d40000;
  box-shadow: 0 0 35px rgba(0,110,255,0.25), 0 0 25px rgba(255,0,0,0.18);
}
h1 { font-size: 24px; font-weight: 850; color: #fff; margin-bottom: 4px; }
.subtitle { color: rgba(255,255,255,0.5); font-size: 12px; margin-bottom: 20px; }
.protected-badge {
  display: inline-block;
  background: linear-gradient(90deg, #d40000, #006eff);
  padding: 4px 16px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 800;
  color: white;
  letter-spacing: 1px;
  margin-bottom: 18px;
}
.script-name {
  color: rgba(255,255,255,0.7);
  font-size: 13px;
  margin-bottom: 18px;
}
.script-name span { color: #ff4242; font-weight: 700; }
.free-badge {
  display: inline-block;
  background: #00c853;
  color: white;
  padding: 2px 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 800;
  margin-left: 6px;
}
.loader-label {
  text-align: left;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.4);
  margin-bottom: 6px;
  text-transform: uppercase;
}
.code-block {
  width: 100%;
  background: #02060c;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  padding: 16px 18px;
  overflow-x: auto;
  text-align: left;
  box-shadow: inset 0 0 30px rgba(0,0,0,0.4);
}
.code-block code {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #e7edf7;
  white-space: pre;
  word-break: break-all;
  display: block;
}
.copy-btn {
  width: 100%;
  margin-top: 12px;
  padding: 13px;
  border: none;
  border-radius: 11px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  color: white;
  background: linear-gradient(90deg, #d40000, #006eff);
  transition: transform 0.2s, filter 0.2s;
}
.copy-btn:hover { transform: translateY(-2px); filter: brightness(1.08); }
.copy-btn:active { transform: translateY(0); }
.footer-text {
  margin-top: 16px;
  font-size: 11px;
  color: rgba(255,255,255,0.25);
}
.footer-text strong { color: #006eff; }
.security-note {
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  font-size: 12px;
  color: rgba(255,255,255,0.4);
  line-height: 1.6;
}
.security-note strong { color: #fff; }
@media(max-width:500px) {
  .card { padding: 24px 18px; }
  .code-block code { font-size: 12px; }
}
</style>
</head>
<body>
<div class="card">
  <div class="logo">🕷️</div>
  <h1>SpideyProtect</h1>
  <div class="subtitle">Lua Protection System</div>
  <div class="protected-badge">🔒 SOURCE PROTECTED</div>
  <div class="script-name">
    SCRIPT: <span>${escapeHtml(script.name)}</span>
    ${isFreeMode ? '<span class="free-badge">FREE MODE</span>' : ''}
  </div>
  <div class="loader-label">📜 LOADER</div>
  <div class="code-block">
    <code id="loaderCode">${escapeHtml(loaderCode)}</code>
  </div>
  <button class="copy-btn" onclick="copyLoader()">📋 Copy Loader</button>
  <div class="security-note">
    🔒 <strong>Source Protected</strong> — The original source is never displayed here.<br>
    ${isFreeMode ? '🆓 <strong>Free Mode Active</strong> — No key required!' : '🔑 <strong>Key Required</strong> — Use a valid key to access the script.'}
  </div>
  <div class="footer-text">Protected by <strong>SpideyProtect</strong> 🕷️</div>
</div>
<script>
const loader = ${JSON.stringify(loaderCode)};
async function copyLoader() {
  const btn = document.querySelector(".copy-btn");
  try {
    await navigator.clipboard.writeText(loader);
    btn.textContent = "✅ Copied!";
    setTimeout(() => { btn.textContent = "📋 Copy Loader"; }, 1800);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = loader;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    btn.textContent = "✅ Copied!";
    setTimeout(() => { btn.textContent = "📋 Copy Loader"; }, 1800);
  }
}
</script>
</body>
</html>`);
  }

  // Jika ada key, proses seperti biasa (untuk executor)
  const isFreeModeRequest = req.query.freemode === "true";
  
  if (isFreeModeRequest && isFreeMode) {
    const filepath = path.join(SCRIPTS_DIR, script.filename);
    if (!fs.existsSync(filepath)) {
      return res
        .status(404)
        .type("text/plain")
        .set("Cache-Control", "no-store")
        .send("-- SpideyProtect: Source missing");
    }
    const source = fs.readFileSync(filepath, "utf8");
    return res
      .status(200)
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .send(source);
  }

  const keys = readKeys();
  const keyData = keys.find((k) => k.key === key.toLowerCase().trim());

  if (!keyData) {
    return res
      .status(403)
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .send("-- SpideyProtect: Invalid key");
  }

  if (keyData.expiry && new Date(keyData.expiry) < new Date()) {
    return res
      .status(403)
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .send("-- SpideyProtect: Key expired");
  }

  if (keyData.scriptId && keyData.scriptId !== scriptId) {
    return res
      .status(403)
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .send("-- SpideyProtect: Key not valid for this script");
  }

  const clientHwid = req.query.hwid ? String(req.query.hwid).trim() : null;

  if (keyData.hwid) {
    if (!clientHwid || clientHwid !== keyData.hwid) {
      return res
        .status(200)
        .type("text/plain")
        .set("Cache-Control", "no-store")
        .send('local plr = game:GetService("Players").LocalPlayer\nif plr then\n    plr:Kick("\\nHWID Mismatch\\n")\nend');
    }
  } else if (clientHwid) {
    const allKeys = readKeys();
    const idx = allKeys.findIndex((k) => k.key === keyData.key);
    if (idx !== -1) {
      allKeys[idx].hwid = clientHwid;
      writeKeys(allKeys);
    }
    keyData.hwid = clientHwid;
  }

  if (!script.enabled) {
    return res
      .status(403)
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .send("-- SpideyProtect: Script disabled");
  }

  const filepath = path.join(SCRIPTS_DIR, script.filename);

  if (!fs.existsSync(filepath)) {
    return res
      .status(404)
      .type("text/plain")
      .set("Cache-Control", "no-store")
      .send("-- SpideyProtect: Source missing");
  }

  const source = fs.readFileSync(filepath, "utf8");

  res
    .status(200)
    .type("text/plain")
    .set("Cache-Control", "no-store")
    .send(source);
});

// ==================== API FREEMODE UNTUK BOT ====================
app.get("/api/freemode/:guildId/:scriptId", (req, res) => {
  const secret = req.headers["x-api-secret"];
  
  if (secret !== API_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { guildId, scriptId } = req.params;
  const botConfig = readBotConfig();
  
  const isFreeMode = botConfig[guildId]?.freeMode?.[scriptId] === true;
  
  res.json({ freeMode: isFreeMode });
});

// ==================== FILES LOADER - REDIRECT KE API LOADER ====================
app.get("/files/loaders/:id.lua", (req, res) => {
  // Redirect ke /api/loader/:id.lua yang sudah memiliki tampilan keren
  res.redirect(`/api/loader/${req.params.id}.lua`);
});

// ==================== ADMIN API ====================

app.get("/api/admin/guilds", isAdmin, (req, res) => {
  let guilds = [];
  if (fs.existsSync(GUILDS_FILE)) {
    try {
      guilds = JSON.parse(fs.readFileSync(GUILDS_FILE, "utf8"));
    } catch (e) {}
  }
  res.json(guilds);
});

app.post("/api/admin/guilds/update", (req, res) => {
  const secret = req.headers["x-api-secret"];
  
  if (secret !== API_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  
  const { guilds } = req.body;
  if (!guilds || !Array.isArray(guilds)) {
    return res.status(400).json({ error: "Invalid guilds data" });
  }
  
  fs.writeFileSync(GUILDS_FILE, JSON.stringify(guilds, null, 2));
  res.json({ success: true });
});

app.get("/api/admin/scripts", isAdmin, (req, res) => {
  const db = readDB();
  const scriptsWithSource = db.map((script) => {
    const filepath = path.join(SCRIPTS_DIR, script.filename);
    let source = null;
    if (fs.existsSync(filepath)) {
      source = fs.readFileSync(filepath, "utf8");
    }
    return { ...script, source };
  });
  res.json(scriptsWithSource);
});

// ==================== ADMIN PAGES ====================

app.get("/admin/dashboard", isAdmin, (req, res) => {
  const db = readDB();
  const keys = readKeys();
  const totalScripts = db.length;
  const totalUsers = new Set(db.map((s) => s.ownerId)).size;
  const totalKeys = keys.length;
  const enabledScripts = db.filter((s) => s.enabled).length;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Admin Dashboard</title>
<style>
* { box-sizing: border-box; margin:0; padding:0; }
body {
  min-height:100vh;
  font-family: Arial, sans-serif;
  background: #050505;
  color: white;
  display:flex;
  align-items:center;
  justify-content:center;
}
.card {
  max-width:600px;
  width:100%;
  padding:40px;
  border-radius:20px;
  border:1px solid rgba(90,150,255,.18);
  background: linear-gradient(145deg, rgba(8,31,57,.92), rgba(4,15,28,.95));
  box-shadow: 0 25px 70px rgba(0,0,0,.4);
}
h1 { margin-bottom:20px; text-align:center; }
.stat { display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid rgba(255,255,255,.08); }
.stat:last-child { border-bottom:none; }
.label { color: rgba(255,255,255,.55); }
.value { font-weight:bold; }
.back { display:inline-block; margin-top:25px; padding:10px 20px; border-radius:8px;
  background: #5865F2; color:white; text-decoration:none; font-weight:bold; }
</style>
</head>
<body>
<div class="card">
  <h1>📊 Admin Dashboard</h1>
  <div class="stat"><span class="label">Total Scripts</span><span class="value">${totalScripts}</span></div>
  <div class="stat"><span class="label">Total Users</span><span class="value">${totalUsers}</span></div>
  <div class="stat"><span class="label">Total Keys</span><span class="value">${totalKeys}</span></div>
  <div class="stat"><span class="label">Enabled Scripts</span><span class="value">${enabledScripts}</span></div>
  <div style="text-align:center;"><a class="back" href="/">⬅ Back to Dashboard</a></div>
</div>
</body>
</html>`);
});

app.get("/admin/source", isAdmin, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Source Scripts - Admin</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body {
  min-height:100vh;
  font-family: Arial, sans-serif;
  background: #050505;
  color: white;
  padding:20px;
}
.container { max-width:1200px; margin:0 auto; }
h1 { margin-bottom:20px; display:flex; align-items:center; gap:15px; flex-wrap:wrap; }
.header-actions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
table { width:100%; border-collapse:collapse; background: rgba(255,255,255,.04); border-radius:12px; overflow:hidden; }
th, td { padding:12px 15px; text-align:left; border-bottom:1px solid rgba(255,255,255,.08); }
th { background: rgba(255,255,255,.08); color:#aaa; font-size:13px; text-transform:uppercase; }
td { font-size:14px; }
.script-name { font-weight:bold; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.owner { color: #aaa; font-size:13px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.status { font-size:12px; padding:4px 8px; border-radius:12px; }
.status.enabled { background: #1a5a2a; color:#88ff88; }
.status.disabled { background: #5a1a1a; color:#ff8888; }
.actions { display:flex; gap:6px; flex-wrap:wrap; }
.actions button { padding:6px 12px; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px; transition:transform .15s; }
.actions button:hover { transform:scale(1.05); }
.btn-view { background:#5865F2; color:white; }
.btn-copy { background:#2b7a3a; color:white; }
.btn-download { background:#a9701a; color:white; }
.modal {
  display:none; position:fixed; top:0; left:0; width:100%; height:100%;
  background: rgba(0,0,0,.85); align-items:center; justify-content:center; z-index:999;
}
.modal-content {
  max-width:900px; width:92%; max-height:85vh; background:#111; border-radius:16px;
  padding:25px; overflow-y:auto; border:1px solid rgba(255,255,255,.1);
}
.modal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px; }
.modal-header h2 { margin:0; }
.modal-actions { display:flex; gap:8px; flex-wrap:wrap; }
.modal-actions button { padding:8px 16px; border:none; border-radius:6px; cursor:pointer; font-weight:bold; transition:transform .15s; }
.modal-actions button:hover { transform:scale(1.05); }
.modal-actions .btn-close { background:#444; color:white; }
.modal-actions .btn-copy-source { background:#2b7a3a; color:white; }
.modal-actions .btn-download-source { background:#a9701a; color:white; }
.modal-content pre {
  background:#0a0a0a; padding:16px; border-radius:8px; overflow-x:auto;
  font-size:13px; white-space:pre-wrap; word-wrap:break-word;
  max-height:60vh; overflow-y:auto;
}
.back { display:inline-block; margin:20px 0; padding:8px 16px; background:#5865F2; color:white; text-decoration:none; border-radius:6px; }
.search-box { padding:10px 16px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:#101010; color:white; width:250px; font-size:14px; }
.search-box::placeholder { color:#666; }
.table-wrap { overflow-x:auto; }
@media(max-width:700px) {
  .container { padding:10px; }
  .search-box { width:100%; }
  th, td { padding:8px 10px; font-size:12px; }
  .modal-content { padding:15px; }
}
</style>
</head>
<body>
<div class="container">
  <div class="header-actions">
    <h1>📄 Source Scripts (Admin)</h1>
    <input class="search-box" id="searchInput" placeholder="🔍 Search scripts..." oninput="filterScripts()">
  </div>
  <a class="back" href="/">⬅ Back</a>
  <div class="table-wrap">
    <div id="scriptsContainer">
      <p>Loading...</p>
    </div>
  </div>
</div>

<div class="modal" id="sourceModal">
  <div class="modal-content">
    <div class="modal-header">
      <h2 id="modalScriptName">Script Name</h2>
      <div class="modal-actions">
        <button class="btn-copy-source" onclick="copySource()">📋 Copy</button>
        <button class="btn-download-source" onclick="downloadSource()">⬇ Download</button>
        <button class="btn-close" onclick="closeModal()">✕ Close</button>
      </div>
    </div>
    <p><small>Owner: <span id="modalOwner"></span> | ID: <span id="modalScriptId"></span></small></p>
    <pre id="modalSource">-- source here</pre>
  </div>
</div>

<script>
let allScripts = [];
let currentScript = null;

async function loadScripts() {
  const container = document.getElementById('scriptsContainer');
  try {
    const res = await fetch('/api/admin/scripts');
    const data = await res.json();
    allScripts = data;
    renderScripts(data);
  } catch (e) {
    container.innerHTML = '<p>Error loading scripts.</p>';
  }
}

function renderScripts(data) {
  const container = document.getElementById('scriptsContainer');
  if (!data.length) {
    container.innerHTML = '<p>No scripts found.</p>';
    return;
  }
  let html = \`
    <table>
      <thead><tr><th>Name</th><th>Owner</th><th>Status</th><th>Created</th><th style="min-width:200px;">Actions</th></tr></thead>
      <tbody>
  \`;
  data.forEach(s => {
    const statusClass = s.enabled ? 'enabled' : 'disabled';
    const statusText = s.enabled ? 'Enabled' : 'Disabled';
    const created = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Unknown';
    html += \`
      <tr>
        <td class="script-name" title="\${escapeHtml(s.name)}">\${escapeHtml(s.name)}</td>
        <td class="owner" title="\${escapeHtml(s.ownerUsername || s.ownerId)}">\${escapeHtml(s.ownerUsername || s.ownerId)}</td>
        <td><span class="status \${statusClass}">\${statusText}</span></td>
        <td>\${created}</td>
        <td class="actions">
          <button class="btn-view" onclick="viewSource('\${s.id}')">👁 View</button>
          <button class="btn-copy" onclick="copyScriptSource('\${s.id}')">📋 Copy</button>
          <button class="btn-download" onclick="downloadScriptSource('\${s.id}')">⬇ Download</button>
        </td>
      </tr>
    \`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function filterScripts() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allScripts.filter(s => 
    s.name.toLowerCase().includes(query) || 
    (s.ownerUsername || s.ownerId).toLowerCase().includes(query)
  );
  renderScripts(filtered);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function getScript(id) {
  const res = await fetch('/api/admin/scripts');
  const data = await res.json();
  return data.find(s => s.id === id);
}

async function viewSource(id) {
  try {
    const script = await getScript(id);
    if (!script) { alert('Script not found'); return; }
    currentScript = script;
    document.getElementById('modalScriptName').textContent = script.name;
    document.getElementById('modalOwner').textContent = script.ownerUsername || script.ownerId;
    document.getElementById('modalScriptId').textContent = script.id;
    const source = script.source || '-- Source not available';
    document.getElementById('modalSource').textContent = source;
    document.getElementById('sourceModal').style.display = 'flex';
  } catch (e) {
    alert('Error loading source');
  }
}

async function copyScriptSource(id) {
  try {
    const script = await getScript(id);
    if (!script) { alert('Script not found'); return; }
    const source = script.source || '';
    await navigator.clipboard.writeText(source);
    alert('✅ Source copied to clipboard!');
  } catch (e) {
    alert('❌ Failed to copy');
  }
}

async function downloadScriptSource(id) {
  try {
    const script = await getScript(id);
    if (!script) { alert('Script not found'); return; }
    const source = script.source || '';
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = \`\${script.name.replace(/[^a-zA-Z0-9]/g, '_')}.lua\`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('❌ Failed to download');
  }
}

function closeModal() {
  document.getElementById('sourceModal').style.display = 'none';
}

async function copySource() {
  if (!currentScript) return;
  const source = currentScript.source || '';
  try {
    await navigator.clipboard.writeText(source);
    alert('✅ Source copied to clipboard!');
  } catch (e) {
    alert('❌ Failed to copy');
  }
}

async function downloadSource() {
  if (!currentScript) return;
  const source = currentScript.source || '';
  const blob = new Blob([source], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = \`\${currentScript.name.replace(/[^a-zA-Z0-9]/g, '_')}.lua\`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('sourceModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

loadScripts();
</script>
</body>
</html>`);
});

app.get("/admin/bot-servers", isAdmin, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Bot Servers - Admin</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body {
  min-height:100vh;
  font-family: Arial, sans-serif;
  background: #050505;
  color: white;
  padding:20px;
}
.container { max-width:800px; margin:0 auto; }
h1 { margin-bottom:20px; }
.guild-list { list-style:none; padding:0; }
.guild-item {
  background: rgba(255,255,255,.05);
  border-radius:12px;
  padding:16px 20px;
  margin-bottom:10px;
  display:flex;
  align-items:center;
  gap:15px;
  border:1px solid rgba(255,255,255,.06);
}
.guild-icon {
  width:50px; height:50px; border-radius:50%;
  background: #2c2f33;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:24px;
  font-weight:bold;
  color:#aaa;
  flex-shrink:0;
}
.guild-icon img { width:100%; height:100%; border-radius:50%; object-fit:cover; }
.guild-info { flex:1; }
.guild-name { font-weight:bold; font-size:18px; }
.guild-id { color:#888; font-size:13px; }
.guild-members { color:#666; font-size:13px; }
.back { display:inline-block; margin:20px 0; padding:8px 16px; background:#5865F2; color:white; text-decoration:none; border-radius:6px; }
.no-guilds { padding:40px; text-align:center; color:#666; border:1px dashed rgba(255,255,255,.12); border-radius:12px; }
</style>
</head>
<body>
<div class="container">
  <h1>🤖 Bot Servers</h1>
  <a class="back" href="/">⬅ Back</a>
  <div id="guildsContainer">
    <p>Loading...</p>
  </div>
</div>
<script>
async function loadGuilds() {
  const container = document.getElementById('guildsContainer');
  try {
    const res = await fetch('/api/admin/guilds');
    const data = await res.json();
    if (!data.length) {
      container.innerHTML = '<div class="no-guilds">🤖 Bot is not in any guild yet.</div>';
      return;
    }
    let html = '<ul class="guild-list">';
    data.forEach(g => {
      const iconHtml = g.icon 
        ? \`<img src="https://cdn.discordapp.com/icons/\${g.id}/\${g.icon}.png" alt="\${escapeHtml(g.name)}">\` 
        : escapeHtml((g.name || '?').charAt(0).toUpperCase());
      html += \`
        <li class="guild-item">
          <div class="guild-icon">\${iconHtml}</div>
          <div class="guild-info">
            <div class="guild-name">\${escapeHtml(g.name || 'Unknown')}</div>
            <div class="guild-id">ID: \${g.id}</div>
            <div class="guild-members">👥 \${g.memberCount || '?'} members</div>
          </div>
        </li>
      \`;
    });
    html += '</ul>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p>Error loading guilds.</p>';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

loadGuilds();
</script>
</body>
</html>`);
});

// ==================== MAIN DASHBOARD ====================

app.get("/", requireAuth, (req, res) => {
  const db = readDB();
  const userId = req.session.user.id;
  const user = req.session.user;
  const isAdminUser = user.id === ADMIN_USER_ID;

  const cards = db
    .filter((script) => script.ownerId === userId)
    .map((script) => {
      const base = getBaseUrl(req);
      const loaderPage = `${base}/files/loaders/${script.id}.lua`;
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
    })
    .join("");

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
.brand { display: flex; align-items: center; gap: 12px; position:relative; }
.logo { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;
  border-radius: 13px; background: white; color: #c00000; font-size: 25px;
  box-shadow: 0 0 25px rgba(255,0,0,.3); }
.brand h1 { font-size: 23px; font-weight: 800; }
.brand span { display: block; margin-top: 3px; color: rgba(255,255,255,.65); font-size: 11px; }

.admin-menu { position:relative; margin-right:6px; }
.menu-toggle { width:38px; height:38px; border:none; border-radius:10px;
  background: rgba(255,255,255,.08); color:white; font-size:22px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; }
.menu-toggle:hover { background: rgba(255,255,255,.15); }
.admin-dropdown { display:none; position:absolute; top:48px; left:0; min-width:180px;
  background:#161616; border:1px solid rgba(255,255,255,.1); border-radius:12px;
  padding:6px; box-shadow:0 15px 40px rgba(0,0,0,.6); z-index:200; }
.admin-dropdown.show { display:block; }
.admin-dropdown a { display:block; padding:10px 14px; border-radius:8px; color:#eee;
  text-decoration:none; font-size:13px; transition:background .15s; }
.admin-dropdown a:hover { background:#252525; }
.admin-dropdown a i { margin-right:8px; }

.user-info { display: flex; align-items: center; gap: 10px; }
.user-avatar { width: 36px; height: 36px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); }
.user-name { font-size: 13px; font-weight: 700; color: white; }
.logout-btn { padding: 7px 14px; border: 1px solid rgba(255,255,255,.2); border-radius: 8px;
  background: transparent; color: rgba(255,255,255,.7); font-size: 12px; cursor: pointer;
  text-decoration: none; transition: background .2s; }
.logout-btn:hover { background: rgba(255,255,255,.1); }
.invite-btn { display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px;
  border: none; border-radius: 8px; background: #5865F2; color: white; font-size: 12px;
  font-weight: 700; cursor: pointer; text-decoration: none; transition: transform .2s, filter .2s; }
.invite-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
.invite-btn svg { width: 16px; height: 16px; fill: white; flex-shrink: 0; }
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
    ${isAdminUser ? `
    <div class="admin-menu">
      <button class="menu-toggle" onclick="toggleAdminMenu()">⋮</button>
      <div class="admin-dropdown" id="adminDropdown">
        <a href="/admin/dashboard"><i>📊</i> Dashboard</a>
        <a href="/admin/source"><i>📄</i> Source Script</a>
        <a href="/admin/bot-servers"><i>🤖</i> Bot Server</a>
      </div>
    </div>` : ''}
    <div class="logo">🕷️</div>
    <div>
      <h1>SpideyProtect</h1>
      <span>Lua Protection System</span>
    </div>
  </div>
  <div class="user-info">
    <img class="user-avatar" src="${escapeHtml(user.avatar)}" alt="avatar">
    <span class="user-name">${escapeHtml(user.username)}</span>
    <a class="invite-btn" href="https://discord.com/oauth2/authorize?client_id=1541101786855899177&permissions=2415937584&integration_type=0&scope=bot" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
      Invite Bot
    </a>
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
  scriptName.value = file.name.replace(/\\.(lua|txt)$/i, "");
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

function toggleAdminMenu() {
  document.getElementById("adminDropdown").classList.toggle("show");
}

document.addEventListener("click", function(event) {
  const menu = document.getElementById("adminDropdown");
  if (menu && !event.target.closest(".admin-menu")) {
    menu.classList.remove("show");
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

// ==================== START ====================

app.listen(PORT, () => {
  console.log(`SpideyProtect running on port ${PORT}`);
});
