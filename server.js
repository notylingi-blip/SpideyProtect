const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
==================================================
 DIRECTORY & FILE SETUP
==================================================
*/

const DATA_DIR = path.join(__dirname, "data");
const SCRIPTS_DIR = path.join(DATA_DIR, "scripts");
const DB_FILE = path.join(DATA_DIR, "scripts.json");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const BLACKLIST_FILE = path.join(DATA_DIR, "blacklist.json");

const INTERNAL_API_SECRET = process.env.API_SECRET || "spidey-internal-secret";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}

if (!fs.existsSync(KEYS_FILE)) {
  fs.writeFileSync(KEYS_FILE, "[]", "utf8");
}

if (!fs.existsSync(BLACKLIST_FILE)) {
  fs.writeFileSync(BLACKLIST_FILE, "[]", "utf8");
}

/*
==================================================
 HELPER FUNCTIONS
==================================================
*/

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

function readBlacklist() {
  try {
    return JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf8"));
  } catch {
    return [];
  }
}

function verifyInternalSecret(req, res, next) {
  if (req.headers["x-api-secret"] !== INTERNAL_API_SECRET) {
    return res.status(401).json({ error: "Unauthorized Internal Request" });
  }
  next();
}

/*
==================================================
 INTERNAL API ENDPOINTS (FOR DISCORD BOT)
==================================================
*/

// Get all scripts or filter by ownerId
app.get("/api/scripts/internal", verifyInternalSecret, (req, res) => {
  const { ownerId } = req.query;
  const db = readDB();
  if (ownerId) {
    return res.json(db.filter(s => s.ownerId === ownerId));
  }
  return res.json(db);
});

// Create new script
app.post("/api/scripts/internal", verifyInternalSecret, (req, res) => {
  const { name, code, ownerId } = req.body;
  if (!name || !code || !ownerId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const scriptId = crypto.randomBytes(6).toString("hex");
  const filename = `${scriptId}.lua`;
  fs.writeFileSync(path.join(SCRIPTS_DIR, filename), code, "utf8");

  const db = readDB();
  const newScript = {
    id: scriptId,
    name,
    filename,
    ownerId,
    enabled: true,
    createdAt: new Date().toISOString()
  };
  db.push(newScript);
  writeDB(db);

  return res.status(201).json({ success: true, script: newScript });
});

// Delete script & clean associated keys
app.delete("/api/scripts/internal/:id", verifyInternalSecret, (req, res) => {
  const scriptId = req.params.id;
  const { ownerId } = req.query;

  const db = readDB();
  const index = db.findIndex(s => s.id === scriptId && s.ownerId === ownerId);

  if (index === -1) {
    return res.status(404).json({ error: "Script not found or access denied" });
  }

  const script = db[index];
  const filepath = path.join(SCRIPTS_DIR, script.filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  db.splice(index, 1);
  writeDB(db);

  // Hapus semua key yang terikat ke script ini
  const keys = readKeys();
  const filteredKeys = keys.filter(k => k.scriptId !== scriptId);
  writeKeys(filteredKeys);

  return res.json({ success: true, message: "Script and associated keys deleted successfully" });
});

/*
==================================================
 PUBLIC LOADER ENDPOINT (FOR ROBLOX)
==================================================
*/

app.get("/api/loader/:id.lua", (req, res) => {
  const scriptId = req.params.id;
  const key = req.query.key || req.headers["x-script-key"];

  // Jika dipanggil tanpa parameter key, kirimkan script loader utama
  if (!key) {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const base = `${protocol}://${req.get("host")}`;
    const luaLoader = `-- SpideyProtect Loader
if not script_key or tostring(script_key) == "" then
    local plr = game:GetService("Players").LocalPlayer
    if plr then plr:Kick("\\n[SpideyProtect]\\nNO KEY PROVIDED") end
    return
end
local url = "${base}/api/loader/${scriptId}.lua?key=" .. tostring(script_key)
loadstring(game:HttpGet(url, true))()`;
    return res.status(200).type("text/plain").send(luaLoader);
  }

  // 1. Cek apakah script masih ada di database
  const db = readDB();
  const script = db.find(x => x.id === scriptId);
  if (!script || !script.enabled) {
    return res.status(200).type("text/plain").send('game:GetService("Players").LocalPlayer:Kick("\\n[SpideyProtect]\\nTHIS SCRIPT HAS BEEN DELETED OR DISABLED")');
  }

  // 2. Cek validasi Key
  const keys = readKeys();
  const keyData = keys.find(k => k.key === key.toUpperCase().trim() && k.scriptId === scriptId);

  if (!keyData) {
    return res.status(200).type("text/plain").send('game:GetService("Players").LocalPlayer:Kick("\\n[SpideyProtect]\\nINVALID OR REVOKED KEY")');
  }

  // 3. Cek Blacklist (Mencocokkan userId sebagai String)
  const blacklist = readBlacklist();
  if (keyData.userId && blacklist.some(b => String(b.userId) === String(keyData.userId))) {
    return res.status(200).type("text/plain").set("Cache-Control", "no-store").send('game:GetService("Players").LocalPlayer:Kick("\\n[SpideyProtect]\\nYou Have Been Blacklisted By The Owner")');
  }

  // 4. Cek Masa Kadaluarsa Key
  if (keyData.expiry && new Date(keyData.expiry) < new Date()) {
    return res.status(200).type("text/plain").send('game:GetService("Players").LocalPlayer:Kick("\\n[SpideyProtect]\\nYOUR KEY HAS EXPIRED")');
  }

  // 5. Cek File Source Lua
  const filepath = path.join(SCRIPTS_DIR, script.filename);
  if (!fs.existsSync(filepath)) {
    return res.status(200).type("text/plain").send('game:GetService("Players").LocalPlayer:Kick("\\n[SpideyProtect]\\nSOURCE FILE NOT FOUND")');
  }

  // Berikan isi script jika semua pengecekan lolos
  const source = fs.readFileSync(filepath, "utf8");
  return res.status(200).type("text/plain").set("Cache-Control", "no-store").send(source);
});

/*
==================================================
 SERVER INITIALIZATION
==================================================
*/

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[SpideyProtect] Server running on port ${PORT}`);
});
