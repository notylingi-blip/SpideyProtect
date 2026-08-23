const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const SCRIPTS_DIR = path.join(DATA_DIR, "scripts");
const DB_FILE = path.join(DATA_DIR, "scripts.json");

fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "[]", "utf8");
}

app.use(express.json({ limit: "15mb" }));

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

function generateId() {
    return crypto.randomBytes(16).toString("hex");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getBaseUrl(req) {
    const protocol =
        req.headers["x-forwarded-proto"] ||
        req.protocol ||
        "https";

    return `${protocol}://${req.get("host")}`;
}

/*
==================================================
 API - LIST
==================================================
*/

app.get("/api/scripts", (req, res) => {
    const db = readDB();

    res.json(
        db.map(script => ({
            id: script.id,
            name: script.name,
            enabled: script.enabled,
            createdAt: script.createdAt
        }))
    );
});

/*
==================================================
 API - UPLOAD SOURCE
==================================================
*/

app.post("/api/scripts", (req, res) => {
    const { name, source } = req.body;

    if (!name || typeof name !== "string") {
        return res.status(400).json({
            error: "Script name is required"
        });
    }

    if (!source || typeof source !== "string") {
        return res.status(400).json({
            error: "Lua source is required"
        });
    }

    if (source.length > 10 * 1024 * 1024) {
        return res.status(413).json({
            error: "File too large"
        });
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
        createdAt: new Date().toISOString()
    };

    const db = readDB();

    db.push(script);

    writeDB(db);

    res.json({
        success: true,
        script: {
            id: script.id,
            name: script.name,
            enabled: script.enabled,
            createdAt: script.createdAt
        },
        loader:
            `${getBaseUrl(req)}/files/loaders/${id}.lua`
    });
});

/*
==================================================
 API - TOGGLE
==================================================
*/

app.post("/api/scripts/:id/toggle", (req, res) => {
    const db = readDB();

    const script =
        db.find(x => x.id === req.params.id);

    if (!script) {
        return res.status(404).json({
            error: "Script not found"
        });
    }

    script.enabled = !script.enabled;

    writeDB(db);

    res.json({
        success: true,
        enabled: script.enabled
    });
});

/*
==================================================
 API - DELETE
==================================================
*/

app.delete("/api/scripts/:id", (req, res) => {
    const db = readDB();

    const index =
        db.findIndex(x => x.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({
            error: "Script not found"
        });
    }

    const script = db[index];

    const filepath =
        path.join(SCRIPTS_DIR, script.filename);

    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }

    db.splice(index, 1);

    writeDB(db);

    res.json({
        success: true
    });
});

/*
==================================================
 PROTECTED PAYLOAD
==================================================
*/

app.get("/api/payload/:id", (req, res) => {
    const db = readDB();

    const script =
        db.find(x => x.id === req.params.id);

    if (!script) {
        return res
            .status(404)
            .type("text/plain")
            .send("-- Script not found");
    }

    if (!script.enabled) {
        return res
            .status(403)
            .type("text/plain")
            .send("-- Script disabled");
    }

    const filepath =
        path.join(SCRIPTS_DIR, script.filename);

    if (!fs.existsSync(filepath)) {
        return res
            .status(404)
            .type("text/plain")
            .send("-- Source missing");
    }

    const source =
        fs.readFileSync(filepath, "utf8");

    res
        .type("text/plain")
        .set("Cache-Control", "no-store")
        .send(source);
});

/*
==================================================
 LOADER
==================================================
*/

app.get("/files/loaders/:id.lua", (req, res) => {
    const db = readDB();

    const script =
        db.find(x => x.id === req.params.id);

    if (!script) {
        return res
            .status(404)
            .type("text/plain")
            .send(
                'warn("SpideyProtect: Script not found")'
            );
    }

    if (!script.enabled) {
        return res
            .status(403)
            .type("text/plain")
            .send(
                'warn("SpideyProtect: Script disabled")'
            );
    }

    const payloadURL =
        `${getBaseUrl(req)}/api/payload/${script.id}`;

    const loader = `-- SpideyProtect
-- Protected Loader

local URL = ${JSON.stringify(payloadURL)}

local success, source = pcall(function()
    return game:HttpGet(URL)
end)

if not success then
    warn("SpideyProtect: Failed to download payload")
    return
end

if not source or source == "" then
    warn("SpideyProtect: Empty payload")
    return
end

local execute, err = loadstring(source)

if not execute then
    warn("SpideyProtect: Lua error:", err)
    return
end

local ok, runtimeError = pcall(execute)

if not ok then
    warn("SpideyProtect: Runtime error:", runtimeError)
end`;

    res
        .status(200)
        .type("text/plain")
        .set("Cache-Control", "no-store")
        .send(loader);
});

/*
==================================================
 WEB PANEL
==================================================
*/

app.get("/", (req, res) => {
    const db = readDB();

    const cards = db.map(script => {
        const loader =
            `${getBaseUrl(req)}/files/loaders/${script.id}.lua`;

        return `
<div class="script-card">

    <div class="script-info">

        <div class="script-icon">
            🕷️
        </div>

        <div>

            <div class="script-name">
                ${escapeHtml(script.name)}
            </div>

            <div class="script-status ${
                script.enabled ? "on" : "off"
            }">
                ${
                    script.enabled
                        ? "● Enabled"
                        : "● Disabled"
                }
            </div>

        </div>

    </div>

    <div class="script-menu">

        <button
            class="dots"
            onclick="toggleMenu('${script.id}')"
        >
            ⋮
        </button>

        <div
            class="menu"
            id="menu-${script.id}"
        >

            <button
                onclick='copyLoader(${JSON.stringify(loader)})'
            >
                📋 Copy Loader
            </button>

            <button
                onclick="toggleScript('${script.id}')"
            >
                ${
                    script.enabled
                        ? "⏸ Disable"
                        : "▶ Enable"
                }
            </button>

            <button
                class="delete"
                onclick="deleteScript('${script.id}')"
            >
                🗑 Delete
            </button>

        </div>

    </div>

</div>
`;
    }).join("");

    res.send(`
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>SpideyProtect</title>

<style>

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {

    min-height: 100vh;

    font-family:
        Arial,
        Helvetica,
        sans-serif;

    color: white;

    background:

        radial-gradient(
            circle at 10% 0%,
            rgba(255,0,0,.30),
            transparent 30%
        ),

        radial-gradient(
            circle at 90% 100%,
            rgba(255,255,255,.08),
            transparent 30%
        ),

        #070707;
}

.header {

    padding: 20px 30px;

    display: flex;
    align-items: center;

    border-bottom:
        1px solid rgba(255,255,255,.1);

    background:
        linear-gradient(
            90deg,
            #8b0000,
            #df0000,
            #090909
        );
}

.brand {

    display: flex;
    align-items: center;

    gap: 12px;
}

.logo {

    width: 46px;
    height: 46px;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 13px;

    background: white;

    color: #c00000;

    font-size: 25px;

    box-shadow:
        0 0 25px rgba(255,0,0,.35);
}

.brand h1 {

    font-size: 23px;
    font-weight: 800;
}

.brand span {

    display: block;

    margin-top: 3px;

    font-size: 11px;

    color:
        rgba(255,255,255,.65);
}

.container {

    width:
        min(1100px, calc(100% - 30px));

    margin: 35px auto;
}

.hero {

    padding: 28px;

    border-radius: 20px;

    border:
        1px solid rgba(255,255,255,.1);

    background:
        linear-gradient(
            135deg,
            rgba(255,0,0,.16),
            rgba(255,255,255,.03)
        );

    box-shadow:
        0 15px 50px rgba(0,0,0,.35);
}

.hero h2 {

    font-size: 27px;

    margin-bottom: 8px;
}

.hero p {

    color: #aaa;

    font-size: 14px;
}

.form-grid {

    margin-top: 22px;

    display: grid;

    grid-template-columns:
        1fr 1fr;

    gap: 12px;
}

input,
textarea {

    width: 100%;

    outline: none;

    border:
        1px solid rgba(255,255,255,.12);

    border-radius: 11px;

    background: #101010;

    color: white;

    padding: 13px;

    font-family: inherit;
}

input:focus,
textarea:focus {

    border-color:
        rgba(255,0,0,.55);
}

textarea {

    min-height: 180px;

    resize: vertical;

    grid-column:
        1 / -1;
}

.file-row {

    grid-column:
        1 / -1;

    display: flex;

    gap: 10px;

    align-items: center;
}

.file-label {

    display: inline-flex;

    align-items: center;
    justify-content: center;

    gap: 8px;

    padding: 12px 18px;

    border-radius: 11px;

    cursor: pointer;

    background: white;

    color: #a00000;

    font-size: 13px;

    font-weight: 800;

    transition: .2s;
}

.file-label:hover {

    transform:
        translateY(-2px);

    box-shadow:
        0 8px 25px
        rgba(255,255,255,.12);
}

.file-name {

    color: #888;

    font-size: 12px;

    overflow: hidden;

    text-overflow: ellipsis;

    white-space: nowrap;
}

#fileInput {

    display: none;
}

.upload-button {

    grid-column:
        1 / -1;

    width: 100%;

    padding: 14px;

    border-radius: 11px;

    background:
        linear-gradient(
            90deg,
            #d40000,
            #ff2020
        );

    color: white;

    font-weight: 800;

    font-size: 14px;

    transition: .2s;
}

.upload-button:hover {

    transform:
        translateY(-2px);

    box-shadow:
        0 8px 25px
        rgba(255,0,0,.2);
}

.section-title {

    margin:
        25px 0 12px;

    font-size: 15px;

    color: #aaa;
}

.scripts {

    display: grid;

    grid-template-columns:
        repeat(
            auto-fit,
            minmax(300px, 1fr)
        );

    gap: 15px;
}

.script-card {

    position: relative;

    display: flex;

    align-items: center;

    justify-content: space-between;

    padding: 18px;

    border-radius: 17px;

    background:
        linear-gradient(
            145deg,
            #151515,
            #0d0d0d
        );

    border:
        1px solid rgba(255,255,255,.08);

    transition: .2s;
}

.script-card:hover {

    transform:
        translateY(-2px);

    border-color:
        rgba(255,0,0,.35);
}

.script-info {

    display: flex;

    align-items: center;

    gap: 13px;
}

.script-icon {

    width: 45px;
    height: 45px;

    display: flex;

    align-items: center;
    justify-content: center;

    border-radius: 12px;

    background:
        linear-gradient(
            135deg,
            #e00000,
            #690000
        );

    font-size: 22px;
}

.script-name {

    max-width: 200px;

    overflow: hidden;

    text-overflow: ellipsis;

    white-space: nowrap;

    font-size: 15px;

    font-weight: 700;
}

.script-status {

    margin-top: 4px;

    font-size: 11px;
}

.script-status.on {
    color: #54ff88;
}

.script-status.off {
    color: #ff4d4d;
}

.script-menu {
    position: relative;
}

.dots {

    width: 38px;
    height: 38px;

    border: none;

    border-radius: 10px;

    background: #1c1c1c;

    color: white;

    font-size: 23px;

    cursor: pointer;
}

.menu {

    display: none;

    position: absolute;

    z-index: 100;

    right: 0;

    top: 45px;

    width: 175px;

    padding: 6px;

    border-radius: 12px;

    background: #161616;

    border:
        1px solid rgba(255,255,255,.1);

    box-shadow:
        0 15px 40px
        rgba(0,0,0,.6);
}

.menu.show {
    display: block;
}

.menu button {

    width: 100%;

    padding: 10px;

    border: none;

    border-radius: 8px;

    background: transparent;

    color: #eee;

    text-align: left;

    cursor: pointer;
}

.menu button:hover {
    background: #252525;
}

.menu .delete {
    color: #ff4d4d;
}

.empty {

    padding: 50px;

    text-align: center;

    color: #666;

    border:
        1px dashed
        rgba(255,255,255,.12);

    border-radius: 18px;
}

.toast {

    position: fixed;

    left: 50%;
    bottom: 25px;

    z-index: 999;

    padding:
        13px 20px;

    border-radius: 12px;

    background: white;

    color: #111;

    font-size: 13px;

    font-weight: 700;

    opacity: 0;

    transform:
        translate(-50%, 80px);

    transition: .25s;
}

.toast.show {

    opacity: 1;

    transform:
        translate(-50%, 0);
}

@media(max-width:700px) {

    .header {
        padding: 18px;
    }

    .container {

        width:
            calc(100% - 20px);

        margin-top: 20px;
    }

    .hero {
        padding: 20px;
    }

    .form-grid {

        grid-template-columns:
            1fr;
    }

    textarea {

        grid-column:
            auto;
    }

    .file-row {

        grid-column:
            auto;

        flex-direction: column;

        align-items: stretch;
    }

    .upload-button {

        grid-column:
            auto;
    }
}

</style>

</head>

<body>

<header class="header">

    <div class="brand">

        <div class="logo">
            🕷️
        </div>

        <div>

            <h1>
                SpideyProtect
            </h1>

            <span>
                Lua Protection System
            </span>

        </div>

    </div>

</header>

<main class="container">

<section class="hero">

    <h2>
        Protect Your Scripts 🕷️
    </h2>

    <p>
        Upload a Lua/TXT file or paste your source manually.
    </p>

    <div class="form-grid">

        <input
            id="scriptName"
            placeholder="Script name..."
        >

        <div class="file-row">

            <label
                class="file-label"
                for="fileInput"
            >
                📁 Upload File
            </label>

            <input
                id="fileInput"
                type="file"
                accept=".lua,.txt,text/plain"
            >

            <span
                class="file-name"
                id="fileName"
            >
                No file selected
            </span>

        </div>

        <textarea
            id="scriptSource"
            placeholder="Paste your Lua source here..."
        ></textarea>

        <button
            class="upload-button"
            onclick="uploadScript()"
        >
            🕷️ Protect & Upload
        </button>

    </div>

</section>

<div class="section-title">
    Your Scripts
</div>

<section class="scripts">

${
    cards ||
    `
    <div class="empty">
        🕷️ No scripts yet.<br>
        Upload your first Lua script above.
    </div>
    `
}

</section>

</main>

<div
    id="toast"
    class="toast"
></div>

<script>

/*
==================================================
 TOAST
==================================================
*/

function toast(message) {

    const el =
        document.getElementById("toast");

    el.textContent = message;

    el.classList.add("show");

    setTimeout(() => {

        el.classList.remove("show");

    }, 2200);
}

/*
==================================================
 FILE UPLOAD
==================================================
*/

const fileInput =
    document.getElementById("fileInput");

const fileName =
    document.getElementById("fileName");

const scriptName =
    document.getElementById("scriptName");

const scriptSource =
    document.getElementById("scriptSource");

fileInput.addEventListener(
    "change",
    function() {

        const file = this.files[0];

        if (!file) {
            return;
        }

        const filename =
            file.name.toLowerCase();

        if (
            !filename.endsWith(".lua") &&
            !filename.endsWith(".txt")
        ) {

            toast(
                "Only .lua or .txt files are allowed!"
            );

            this.value = "";

            return;
        }

        if (
            file.size >
            10 * 1024 * 1024
        ) {

            toast(
                "File is too large! Max 10MB."
            );

            this.value = "";

            return;
        }

        fileName.textContent =
            file.name;

        /*
        Remove extension
        */

        const cleanName =
            file.name.replace(
                /\.(lua|txt)$/i,
                ""
            );

        scriptName.value =
            cleanName;

        /*
        Read file
        */

        const reader =
            new FileReader();

        reader.onload = function(event) {

            scriptSource.value =
                event.target.result;

            toast(
                "File loaded into source!"
            );

        };

        reader.onerror = function() {

            toast(
                "Failed to read file!"
            );

        };

        reader.readAsText(file);

    }
);

/*
==================================================
 MENU
==================================================
*/

function toggleMenu(id) {

    document
        .querySelectorAll(".menu")
        .forEach(menu => {

            menu.classList.remove("show");

        });

    const menu =
        document.getElementById(
            "menu-" + id
        );

    if (menu) {
        menu.classList.toggle("show");
    }
}

document.addEventListener(
    "click",
    function(event) {

        if (
            !event.target.closest(
                ".script-menu"
            )
        ) {

            document
                .querySelectorAll(".menu")
                .forEach(menu => {

                    menu.classList.remove(
                        "show"
                    );

                });

        }

    }
);

/*
==================================================
 UPLOAD
==================================================
*/

async function uploadScript() {

    const name =
        scriptName.value.trim();

    const source =
        scriptSource.value;

    if (!name) {

        toast(
            "Enter script name!"
        );

        return;
    }

    if (!source.trim()) {

        toast(
            "Enter Lua source!"
        );

        return;
    }

    try {

        const response =
            await fetch(
                "/api/scripts",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        name,
                        source
                    })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            toast(
                data.error ||
                "Upload failed"
            );

            return;
        }

        toast(
            "Script protected!"
        );

        setTimeout(() => {

            location.reload();

        }, 600);

    } catch (error) {

        toast(
            "Server error!"
        );

    }
}

/*
==================================================
 TOGGLE
==================================================
*/

async function toggleScript(id) {

    try {

        const response =
            await fetch(
                "/api/scripts/" +
                id +
                "/toggle",
                {
                    method: "POST"
                }
            );

        if (!response.ok) {

            toast(
                "Failed to change status"
            );

            return;
        }

        location.reload();

    } catch {

        toast(
            "Server error!"
        );

    }
}

/*
==================================================
 DELETE
==================================================
*/

async function deleteScript(id) {

    if (
        !confirm(
            "Delete this script?"
        )
    ) {
        return;
    }

    try {

        const response =
            await fetch(
                "/api/scripts/" + id,
                {
                    method: "DELETE"
                }
            );

        if (!response.ok) {

            toast(
                "Delete failed"
            );

            return;
        }

        toast(
            "Script deleted!"
        );

        setTimeout(() => {

            location.reload();

        }, 500);

    } catch {

        toast(
            "Server error!"
        );

    }
}

/*
==================================================
 COPY LOADER
==================================================
*/

async function copyLoader(url) {

    const loader =
        'loadstring(game:HttpGet("' +
        url +
        '"))()';

    try {

        await navigator.clipboard.writeText(
            loader
        );

        toast(
            "Loader copied!"
        );

    } catch {

        toast(
            "Failed to copy loader"
        );

    }
}

</script>

</body>

</html>
`);
});

/*
==================================================
 START SERVER
==================================================
*/

app.listen(PORT, () => {

    console.log(
        `SpideyProtect running on port ${PORT}`
    );

});
