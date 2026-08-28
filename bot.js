const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CONFIG = {
  token: process.env.BOT_TOKEN || "TOKEN_LO_DISINI",
  clientId: process.env.DISCORD_CLIENT_ID || "1541101786855899177",
  apiBase: process.env.API_BASE || "https://spideyprotect-production.up.railway.app",
  apiSecret: process.env.API_SECRET || "spidey-internal-secret"
};

const DATA_DIR = path.join(__dirname, "data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const CONFIG_FILE = path.join(DATA_DIR, "botconfig.json");
const BLACKLIST_FILE = path.join(DATA_DIR, "blacklist.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, "[]", "utf8");
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, "{}", "utf8");
if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, "[]", "utf8");

function readKeys() { try { return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")); } catch { return []; } }
function writeKeys(data) { fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2)); }
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; } }
function writeConfig(data) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2)); }

function generateKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

async function updateGuildsList() {
  try {
    const guilds = client.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      memberCount: g.memberCount
    }));

    await axios.post(`${CONFIG.apiBase}/api/admin/guilds/update`, { guilds }, {
      headers: { "x-api-secret": CONFIG.apiSecret }
    });
  } catch (err) {
    console.error("Failed to sync guilds to backend:", err.message);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate a new access key")
    .addStringOption(opt => opt.setName("script_id").setDescription("Script ID").setRequired(true))
    .addIntegerOption(opt => opt.setName("days").setDescription("Expiry duration in days (0 for lifetime)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("resetkey")
    .setDescription("Reset HWID of a key")
    .addStringOption(opt => opt.setName("key").setDescription("Key string").setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(CONFIG.token);

client.once("ready", async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CONFIG.clientId), { body: commands });
    console.log("Slash Commands registered successfully.");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
  await updateGuildsList();
});

client.on("guildCreate", updateGuildsList);
client.on("guildDelete", updateGuildsList);

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: "❌ You don't have permission to use this command.", flags: 64 });
  }

  if (commandName === "genkey") {
    const scriptId = options.getString("script_id");
    const days = options.getInteger("days") || 0;

    const key = generateKey();
    const expiry = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;

    const keys = readKeys();
    keys.push({
      key,
      scriptId,
      hwid: null,
      expiry,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString()
    });
    writeKeys(keys);

    const embed = new EmbedBuilder()
      .setTitle("🔑 Key Generated")
      .setColor(0x00FF88)
      .addFields(
        { name: "Key", value: `\`\`\`${key}\`\`\`` },
        { name: "Script ID", value: scriptId, inline: true },
        { name: "Expires In", value: days > 0 ? `${days} Days` : "Lifetime", inline: true }
      );

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (commandName === "resetkey") {
    const targetKey = options.getString("key");
    const keys = readKeys();
    const keyData = keys.find(k => k.key === targetKey);

    if (!keyData) {
      return interaction.reply({ content: "❌ Key not found.", flags: 64 });
    }

    keyData.hwid = null;
    writeKeys(keys);

    return interaction.reply({ content: `✅ HWID for key \`${targetKey}\` has been reset.`, flags: 64 });
  }
});

client.login(CONFIG.token);
