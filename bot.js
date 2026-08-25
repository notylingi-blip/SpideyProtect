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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
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
const CACHE_FILE = path.join(DATA_DIR, "cache.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, "[]", "utf8");
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, "{}", "utf8");
if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, "[]", "utf8");
if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, "{}", "utf8");

function readKeys() { try { return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")); } catch { return []; } }
function writeKeys(data) { fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2)); }
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; } }
function writeConfig(data) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2)); }
function readBlacklist() { try { return JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf8")); } catch { return []; } }
function writeBlacklist(data) { fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2)); }
function readCache() { try { return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { return {}; } }
function writeCache(data) { fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2)); }

function isBlacklisted(userId) {
  const bl = readBlacklist();
  return bl.some(b => String(b.userId) === String(userId));
}

function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return [6, 6, 6, 6].map(len => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("")).join("-");
}

function hasPermission(member, guildId) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const cfg = readConfig();
  const roleId = cfg[guildId]?.whitelistRole;
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

const scriptCache = new Map();
const CACHE_TTL = 30000;

const panelTempData = new Map();
const buyerRoleTempData = new Map();
const freeModeTempData = new Map();

async function getScriptsByOwner(ownerId) {
  const cacheKey = `scripts_${ownerId}`;
  const cached = scriptCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const res = await axios.get(`${CONFIG.apiBase}/api/scripts/internal`, {
      headers: { "x-api-secret": CONFIG.apiSecret },
      params: { ownerId },
      timeout: 5000
    });
    const data = res.data || [];
    scriptCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch {
    if (cached) return cached.data;
    return [];
  }
}

async function getAllScripts() {
  try {
    const res = await axios.get(`${CONFIG.apiBase}/api/scripts/internal`, {
      headers: { "x-api-secret": CONFIG.apiSecret },
      timeout: 5000
    });
    return res.data || [];
  } catch {
    return [];
  }
}

function clearCache(ownerId) {
  if (ownerId) {
    scriptCache.delete(`scripts_${ownerId}`);
  } else {
    scriptCache.clear();
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const commands = [
  new SlashCommandBuilder()
    .setName("setuppanel")
    .setDescription("Setup panel embed with script selection")
    .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true))
    .addStringOption(o => o.setName("description").setDescription("Description").setRequired(true)),
  
  new SlashCommandBuilder()
    .setName("whitelistrole")
    .setDescription("Set admin role")
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
    .setName("setbuyerrole")
    .setDescription("Set buyer role for specific script")
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate key")
    .addIntegerOption(o => o.setName("days").setDescription("Duration in days (0=lifetime)").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Number of keys").setRequired(false)),
  
  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Whitelist user/role for a script")
    .addIntegerOption(o => o.setName("days").setDescription("Duration in days (0=lifetime)").setRequired(true))
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(false))
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(false)),
  
  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Blacklist user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
  
  new SlashCommandBuilder()
    .setName("unblacklist")
    .setDescription("Unblacklist user")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  
  new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Revoke key/user")
    .addStringOption(o => o.setName("key").setDescription("Key").setRequired(false))
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(false)),
  
  new SlashCommandBuilder()
    .setName("listkeys")
    .setDescription("View all keys"),
  
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View user info")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  
  new SlashCommandBuilder()
    .setName("deletescript")
    .setDescription("Delete your script from SpideyProtect"),
  
  new SlashCommandBuilder()
    .setName("freemode")
    .setDescription("Enable or disable free mode for a script"),
  
  new SlashCommandBuilder()
    .setName("clearcache")
    .setDescription("Clear script cache (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(CONFIG.token);
  try {
    await rest.put(Routes.applicationCommands(CONFIG.clientId), { body: commands });
    console.log(`✅ Bot ready: ${client.user.tag}`);
  } catch (err) { 
    console.error("❌ Failed to register commands:", err); 
  }
});

async function sendPanelEmbed(channel, title, description, scriptId, scriptName, ownerId, guildId) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x5865F2)
    .setFooter({ text: `SpideyProtect • ${scriptName}` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("redeem_key")
      .setLabel("Redeem Key")
      .setEmoji("🔑")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`get_script:${ownerId}:${scriptId}:${guildId}`)
      .setLabel("Get Script")
      .setEmoji("📜")
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`get_role:${scriptId}`)
      .setLabel("Get Role")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`reset_hwid:${scriptId}`)
      .setLabel("Reset HWID")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`get_stats:${scriptId}`)
      .setLabel("Get Stats")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ embeds: [embed], components: [row1, row2, row3] });

  const cfg = readConfig();
  if (!cfg[guildId]) cfg[guildId] = {};
  cfg[guildId].panelChannelId = channel.id;
  cfg[guildId].panelScriptId = scriptId;
  writeConfig(cfg);
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton() && isBlacklisted(interaction.user.id)) {
      return interaction.reply({ 
        content: "❌ You Have Been Blacklisted By The Owner", 
        ephemeral: true 
      }).catch(() => {});
    }

    // ==================== BUTTON HANDLERS ====================
    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId.startsWith("get_script:")) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const parts = customId.split(":");
          const ownerId = parts[1];
          const scriptId = parts[2];
          const guildId = parts[3] || interaction.guildId;

          // CEK FREEMODE DULU
          const cfg = readConfig()[guildId] || {};
          const isFreeMode = cfg.freeMode && cfg.freeMode[scriptId] === true;

          if (isFreeMode) {
            // FREE MODE: semua user bisa akses tanpa key
            const loaderCode = `loadstring(game:HttpGet("${CONFIG.apiBase}/api/loader/${scriptId}.lua?guildId=${guildId}"))()`;
            return interaction.editReply({ 
              content: `📜 **FREE MODE ENABLED**\nNo key required!\n\`\`\`lua\n${loaderCode}\n\`\`\`` 
            }).catch(() => {});
          }

          // NORMAL MODE: cek key
          const keys = readKeys();
          const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

          if (userKeys.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any active key!" }).catch(() => {});
          }

          const validKey = userKeys.find(k => k.scriptId === scriptId);

          if (!validKey) {
            return interaction.editReply({ content: "❌ You don't have a key for this script!" }).catch(() => {});
          }

          const loaderCode = `script_key="${validKey.key}";\nloadstring(game:HttpGet("${CONFIG.apiBase}/api/loader/${validKey.scriptId}.lua?guildId=${guildId}"))()`;
          return interaction.editReply({ content: `📜 Your loader:\n\`\`\`lua\n${loaderCode}\n\`\`\`` }).catch(() => {});
        } catch (err) {
          console.error("Get script error:", err);
          return interaction.editReply({ content: "❌ Failed to get script. Please try again." }).catch(() => {});
        }
      }

      if (customId === "redeem_key") {
        try {
          const modal = new ModalBuilder()
            .setCustomId("modal_redeem")
            .setTitle("Redeem Key");

          const keyInput = new TextInputBuilder()
            .setCustomId("input_key")
            .setLabel("Key")
            .setPlaceholder("XXXXXX-XXXXXX-XXXXXX-XXXXXX")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
          return interaction.showModal(modal).catch(() => {});
        } catch (err) {
          console.error("Redeem modal error:", err);
          return interaction.reply({ content: "❌ Failed to open modal. Please try again.", ephemeral: true }).catch(() => {});
        }
      }

      if (customId.startsWith("get_role:") || customId === "get_role") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const scriptId = customId.includes(":") ? customId.split(":")[1] : null;
          const cfg = readConfig()[interaction.guildId] || {};
          
          const buyerRoleId = scriptId && cfg.buyerRoles && cfg.buyerRoles[scriptId] 
            ? cfg.buyerRoles[scriptId] 
            : cfg.buyerRole;

          if (!buyerRoleId) {
            return interaction.editReply({ content: "❌ Buyer role has not been set for this script!" }).catch(() => {});
          }

          const keys = readKeys();
          const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

          if (userKeys.length === 0) {
            return interaction.editReply({ content: "❌ You don't have a key! Redeem or get whitelisted first." }).catch(() => {});
          }

          if (scriptId) {
            const validKey = userKeys.find(k => k.scriptId === scriptId);
            if (!validKey) {
              return interaction.editReply({ content: "❌ You don't have a key for this script!" }).catch(() => {});
            }
          }

          const member = await interaction.guild.members.fetch(interaction.user.id);
          if (member.roles.cache.has(buyerRoleId)) {
            return interaction.editReply({ content: "✅ You already have the buyer role!" }).catch(() => {});
          }

          await member.roles.add(buyerRoleId);
          return interaction.editReply({ content: "✅ Buyer role has been assigned!" }).catch(() => {});
        } catch (err) {
          console.error("Get role error:", err);
          return interaction.editReply({ content: "❌ Failed to assign role. Make sure the bot has permission." }).catch(() => {});
        }
      }

      if (customId.startsWith("reset_hwid:") || customId === "reset_hwid") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const scriptId = customId.includes(":") ? customId.split(":")[1] : null;
          const keys = readKeys();

          const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));
          if (userKeys.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any active key!" }).catch(() => {});
          }

          if (scriptId) {
            const validKey = userKeys.find(k => k.scriptId === scriptId);
            if (!validKey) {
              return interaction.editReply({ content: "❌ You don't have a key for this script!" }).catch(() => {});
            }
          }

          let resetCount = 0;
          const updatedKeys = keys.map(k => {
            const isOwner = String(k.userId) === String(interaction.user.id);
            const isScript = scriptId ? k.scriptId === scriptId : true;
            if (isOwner && isScript && k.hwid) {
              resetCount++;
              return { ...k, hwid: null };
            }
            return k;
          });

          if (resetCount === 0) {
            return interaction.editReply({ content: "ℹ️ No HWID is registered for your key." }).catch(() => {});
          }

          writeKeys(updatedKeys);
          return interaction.editReply({ content: `✅ HWID has been reset!` }).catch(() => {});
        } catch (err) {
          console.error("Reset HWID error:", err);
          return interaction.editReply({ content: "❌ Failed to reset HWID. Please try again." }).catch(() => {});
        }
      }

      if (customId.startsWith("get_stats:") || customId === "get_stats") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const scriptId = customId.includes(":") ? customId.split(":")[1] : null;
          const keys = readKeys();
          const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

          if (userKeys.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any active key!" }).catch(() => {});
          }

          if (scriptId) {
            const validKey = userKeys.find(k => k.scriptId === scriptId);
            if (!validKey) {
              return interaction.editReply({ content: "❌ You don't have a key for this script!" }).catch(() => {});
            }
          }

          const relevantKeys = scriptId ? userKeys.filter(k => k.scriptId === scriptId) : userKeys;

          let scriptName = "Unknown Script";
          if (scriptId) {
            try {
              const res = await axios.get(`${CONFIG.apiBase}/api/scripts/internal`, {
                headers: { "x-api-secret": CONFIG.apiSecret },
                timeout: 5000
              });
              const found = (res.data || []).find(s => s.id === scriptId);
              if (found) scriptName = found.name;
            } catch {}
          }

          let stats = `📊 **YOUR KEY STATUS - ${scriptName}**\n\n`;
          let activeKeys = 0;
          let expiredKeys = 0;

          relevantKeys.forEach(k => {
            const isExpired = k.expiry && new Date(k.expiry) < new Date();
            const status = isExpired ? "❌ Expired" : "✅ Active";
            const hwidStatus = k.hwid ? "🔒 Bound" : "🔓 Not bound";
            const expiryText = k.expiry ? new Date(k.expiry).toLocaleDateString() : "♾️ Lifetime";

            if (!isExpired) activeKeys++;
            else expiredKeys++;

            stats += `• Status: ${status}\n`;
            stats += `• HWID: ${hwidStatus}\n`;
            stats += `• Expiry: ${expiryText}\n`;
            stats += `• Key: \`${k.key}\`\n\n`;
          });

          stats += `📈 **Total**: ${relevantKeys.length} key(s) | Active: ${activeKeys} | Expired: ${expiredKeys}`;

          if (stats.length > 2000) {
            stats = stats.slice(0, 1990) + "\n... (truncated)";
          }

          return interaction.editReply({ content: stats }).catch(() => {});
        } catch (err) {
          console.error("Get stats error:", err);
          return interaction.editReply({ content: "❌ Failed to get stats. Please try again." }).catch(() => {});
        }
      }

      return interaction.reply({ content: "❌ Unknown button.", ephemeral: true }).catch(() => {});
    }

    // ==================== MODAL SUBMIT ====================
    if (interaction.isModalSubmit() && interaction.customId === "modal_redeem") {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      try {
        const keyInput = interaction.fields.getTextInputValue("input_key").toUpperCase().trim();
        const keys = readKeys();
        const keyData = keys.find(k => k.key === keyInput);

        if (!keyData) {
          return interaction.editReply({ content: "❌ Invalid key." }).catch(() => {});
        }

        if (keyData.userId && String(keyData.userId) !== String(interaction.user.id)) {
          return interaction.editReply({ content: "❌ This key is already used by another user." }).catch(() => {});
        }

        keyData.userId = String(interaction.user.id);
        keyData.username = interaction.user.username;
        keyData.redeemedAt = new Date().toISOString();
        writeKeys(keys);

        const cfg = readConfig()[interaction.guildId] || {};
        const buyerRoleId = cfg.buyerRoles && cfg.buyerRoles[keyData.scriptId] 
          ? cfg.buyerRoles[keyData.scriptId] 
          : cfg.buyerRole;

        if (buyerRoleId) {
          try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            await member.roles.add(buyerRoleId);
          } catch (err) {
            console.error("Failed to add buyer role:", err);
          }
        }

        return interaction.editReply({ content: "✅ Key redeemed successfully!" }).catch(() => {});
      } catch (err) {
        console.error("Modal redeem error:", err);
        return interaction.editReply({ content: "❌ Failed to redeem key. Please try again." }).catch(() => {});
      }
    }

    // ==================== SELECT MENU ====================
    if (interaction.isStringSelectMenu()) {

      // --- DELETE SCRIPT SELECT ---
      if (interaction.customId === "deletescript_select") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const scriptId = interaction.values[0];

          await axios.delete(`${CONFIG.apiBase}/api/scripts/internal/${scriptId}`, {
            headers: { 
              "x-api-secret": CONFIG.apiSecret,
              "x-owner-id": interaction.user.id
            }
          });

          const keys = readKeys();
          const filteredKeys = keys.filter(k => k.scriptId !== scriptId);
          writeKeys(filteredKeys);
          clearCache(interaction.user.id);

          return interaction.editReply({ content: "✅ Script and all its keys have been permanently deleted!" }).catch(() => {});
        } catch (err) {
          console.error("Delete script error:", err);
          return interaction.editReply({ content: "❌ Failed to delete script." }).catch(() => {});
        }
      }

      // --- FREEMODE SELECT ---
      if (interaction.customId === "freemode_select") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const scriptId = interaction.values[0];
          const tempData = freeModeTempData.get(interaction.user.id);
          
          if (!tempData) {
            return interaction.editReply({ content: "❌ Session expired. Please run /freemode again." }).catch(() => {});
          }

          const { mode } = tempData;
          freeModeTempData.delete(interaction.user.id);

          const cfg = readConfig();
          if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
          if (!cfg[interaction.guildId].freeMode) cfg[interaction.guildId].freeMode = {};

          if (mode === "enable") {
            cfg[interaction.guildId].freeMode[scriptId] = true;
            writeConfig(cfg);
            return interaction.editReply({ content: `✅ Free mode has been **ENABLED** for the selected script!` }).catch(() => {});
          } else if (mode === "disable") {
            delete cfg[interaction.guildId].freeMode[scriptId];
            writeConfig(cfg);
            return interaction.editReply({ content: `✅ Free mode has been **DISABLED** for the selected script!` }).catch(() => {});
          }
        } catch (err) {
          console.error("Freemode select error:", err);
          return interaction.editReply({ content: "❌ Failed to update free mode. Please try again." }).catch(() => {});
        }
      }

      // --- FREEMODE MODE SELECT ---
      if (interaction.customId === "freemode_mode_select") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const mode = interaction.values[0];
          const myScripts = await getScriptsByOwner(interaction.user.id);
          
          if (myScripts.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any scripts yet." }).catch(() => {});
          }

          freeModeTempData.set(interaction.user.id, { mode });

          const sortedScripts = myScripts.sort((a, b) => a.name.localeCompare(b.name));

          const options = sortedScripts.slice(0, 25).map(s => 
            new StringSelectMenuOptionBuilder()
              .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
              .setValue(s.id)
          );

          const select = new StringSelectMenuBuilder()
            .setCustomId("freemode_select")
            .setPlaceholder("Select a script...")
            .addOptions(options);

          return interaction.editReply({ 
            content: `Select a script to ${mode} free mode:`, 
            components: [new ActionRowBuilder().addComponents(select)] 
          }).catch(() => {});
        } catch (err) {
          console.error("Freemode mode select error:", err);
          return interaction.editReply({ content: "❌ Failed to load scripts. Please try again." }).catch(() => {});
        }
      }

      // --- SETUP PANEL SELECT ---
      if (interaction.customId === "setuppanel_select") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const scriptId = interaction.values[0];
          
          const tempData = panelTempData.get(interaction.user.id);
          if (!tempData) {
            return interaction.editReply({ content: "❌ Session expired. Please run /setuppanel again." }).catch(() => {});
          }
          const { title, description } = tempData;
          panelTempData.delete(interaction.user.id);

          const myScripts = await getScriptsByOwner(interaction.user.id);
          const selectedScript = myScripts.find(s => s.id === scriptId);
          
          if (!selectedScript) {
            return interaction.editReply({ content: "❌ Script not found or not yours!" }).catch(() => {});
          }

          await sendPanelEmbed(interaction.channel, title, description, scriptId, selectedScript.name, interaction.user.id, interaction.guildId);
          return interaction.editReply({ content: `✅ Panel created with script: **${selectedScript.name}**!` }).catch(() => {});
        } catch (err) {
          console.error("Setup panel select error:", err);
          return interaction.editReply({ content: "❌ Failed to create panel. Please try again." }).catch(() => {});
        }
      }

      // --- SET BUYER ROLE SELECT ---
      if (interaction.customId === "setbuyerrole_select") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const scriptId = interaction.values[0];
          const tempData = buyerRoleTempData.get(interaction.user.id);
          
          if (!tempData) {
            return interaction.editReply({ content: "❌ Session expired. Please run /setbuyerrole again." }).catch(() => {});
          }

          const { roleId } = tempData;
          buyerRoleTempData.delete(interaction.user.id);

          const cfg = readConfig();
          if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
          if (!cfg[interaction.guildId].buyerRoles) cfg[interaction.guildId].buyerRoles = {};
          
          cfg[interaction.guildId].buyerRoles[scriptId] = roleId;
          writeConfig(cfg);

          return interaction.editReply({ content: `✅ Buyer role <@&${roleId}> has been set for the selected script!` }).catch(() => {});
        } catch (err) {
          console.error("Set buyer role select error:", err);
          return interaction.editReply({ content: "❌ Failed to set buyer role. Please try again." }).catch(() => {});
        }
      }

      // --- WHITELIST SELECT ---
      if (interaction.customId.startsWith("whitelist_select:")) {
        await interaction.deferReply({ ephemeral: false }).catch(() => {});
        try {
          const parts = interaction.customId.split(":");
          const targetType = parts[1];
          const targetId = parts[2];
          const daysStr = parts[3];
          const adminId = parts[4];
          const days = parseInt(daysStr);
          const scriptId = interaction.values[0];

          const myScripts = await getScriptsByOwner(adminId);
          const owned = myScripts.find(s => s.id === scriptId);
          
          if (!owned) {
            return interaction.editReply({ content: "❌ This script is not yours." }).catch(() => {});
          }

          const keys = readKeys();
          const expiry = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();
          const cfg = readConfig()[interaction.guildId] || {};
          
          const buyerRoleId = cfg.buyerRoles && cfg.buyerRoles[scriptId] 
            ? cfg.buyerRoles[scriptId] 
            : cfg.buyerRole;
          
          const panelChannelId = cfg.panelChannelId;

          if (targetType === "user") {
            const key = generateKey();
            keys.push({ 
              key, hwid: null, userId: String(targetId), username: null, scriptId, 
              redeemedAt: new Date().toISOString(), expiry, 
              createdAt: new Date().toISOString(), createdBy: adminId 
            });
            writeKeys(keys);

            if (buyerRoleId) {
              try {
                const member = await interaction.guild.members.fetch(targetId);
                await member.roles.add(buyerRoleId);
              } catch {}
            }

            const channelTag = panelChannelId ? `<#${panelChannelId}>` : `<#${interaction.channelId}>`;
            return interaction.editReply({ 
              content: `<@${targetId}> You have been whitelisted for **${owned.name}**!\nYou can access the script via this message --> ${channelTag}` 
            }).catch(() => {});
          }

          if (targetType === "role") {
            const role = await interaction.guild.roles.fetch(targetId);
            await interaction.guild.members.fetch();
            const members = role.members.filter(m => !m.user.bot);

            let addedCount = 0;
            for (const [, member] of members) {
              const userKey = generateKey();
              keys.push({ 
                key: userKey, hwid: null, userId: String(member.id), username: member.user.username, 
                scriptId, redeemedAt: new Date().toISOString(), expiry, 
                createdAt: new Date().toISOString(), createdBy: adminId 
              });
              addedCount++;
              if (buyerRoleId) { 
                try { await member.roles.add(buyerRoleId); } catch {} 
              }
            }
            writeKeys(keys);

            const channelTag = panelChannelId ? `<#${panelChannelId}>` : `<#${interaction.channelId}>`;
            return interaction.editReply({ 
              content: `<@&${targetId}> You have been whitelisted for **${owned.name}**! (${addedCount} members)\nYou can access the script via this message --> ${channelTag}` 
            }).catch(() => {});
          }
        } catch (err) {
          console.error("Whitelist select error:", err);
          return interaction.editReply({ content: "❌ Failed to whitelist. Please try again." }).catch(() => {});
        }
      }

      // --- GENKEY SELECT ---
      if (interaction.customId.startsWith("genkey_select:")) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const parts = interaction.customId.split(":");
          const days = parseInt(parts[1]);
          const amount = parseInt(parts[2]);
          const adminId = parts[3];
          const scriptId = interaction.values[0];

          const myScripts = await getScriptsByOwner(adminId);
          const owned = myScripts.find(s => s.id === scriptId);
          if (!owned) {
            return interaction.editReply({ content: "❌ This script is not yours." }).catch(() => {});
          }

          const keys = readKeys();
          const generated = [];
          const expiry = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();

          for (let i = 0; i < amount; i++) {
            const key = generateKey();
            keys.push({ 
              key, hwid: null, userId: null, username: null, scriptId, 
              redeemedAt: null, expiry, 
              createdAt: new Date().toISOString(), createdBy: adminId 
            });
            generated.push(key);
          }
          writeKeys(keys);

          const keyList = generated.map(k => `\`${k}\``).join("\n");
          return interaction.editReply({ 
            content: `✅ **${amount} key(s)** generated for script **${owned.name}**!\n\n${keyList}` 
          }).catch(() => {});
        } catch (err) {
          console.error("Genkey select error:", err);
          return interaction.editReply({ content: "❌ Failed to generate keys. Please try again." }).catch(() => {});
        }
      }
    }

    // ==================== CHAT INPUT COMMANDS ====================
    if (interaction.isChatInputCommand()) {
      const commandName = interaction.commandName;

      if (commandName === "clearcache") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Admin only.", ephemeral: true }).catch(() => {});
        }
        clearCache();
        return interaction.reply({ content: "✅ Cache cleared successfully!", ephemeral: true }).catch(() => {});
      }

      if (commandName === "whitelistrole") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Admin only.", ephemeral: true }).catch(() => {});
        }
        const role = interaction.options.getRole("role");
        const cfg = readConfig();
        if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
        cfg[interaction.guildId].whitelistRole = role.id;
        writeConfig(cfg);
        return interaction.reply({ content: `✅ Role <@&${role.id}> is now the bot admin role.`, ephemeral: true }).catch(() => {});
      }

      // --- SETBUYERROLE ---
      if (commandName === "setbuyerrole") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Admin only.", ephemeral: true }).catch(() => {});
        }
        
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        
        try {
          const role = interaction.options.getRole("role");
          
          const myScripts = await getScriptsByOwner(interaction.user.id);
          
          if (myScripts.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any scripts yet." }).catch(() => {});
          }

          if (myScripts.length === 1) {
            const scriptId = myScripts[0].id;
            const cfg = readConfig();
            if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
            if (!cfg[interaction.guildId].buyerRoles) cfg[interaction.guildId].buyerRoles = {};
            
            cfg[interaction.guildId].buyerRoles[scriptId] = role.id;
            writeConfig(cfg);

            return interaction.editReply({ 
              content: `✅ Buyer role <@&${role.id}> has been set for script **${myScripts[0].name}**!` 
            }).catch(() => {});
          }

          buyerRoleTempData.set(interaction.user.id, { roleId: role.id });

          const sortedScripts = myScripts.sort((a, b) => a.name.localeCompare(b.name));

          const options = sortedScripts.slice(0, 25).map(s => 
            new StringSelectMenuOptionBuilder()
              .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
              .setValue(s.id)
          );

          const select = new StringSelectMenuBuilder()
            .setCustomId("setbuyerrole_select")
            .setPlaceholder("Select a script...")
            .addOptions(options);

          return interaction.editReply({ 
            content: `Select a script to assign buyer role <@&${role.id}>:`, 
            components: [new ActionRowBuilder().addComponents(select)] 
          }).catch(() => {});
        } catch (err) {
          console.error("Set buyer role error:", err);
          return interaction.editReply({ content: "❌ Failed to set buyer role. Please try again." }).catch(() => {});
        }
      }

      // --- SETUPPANEL ---
      if (commandName === "setuppanel") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        
        try {
          const title = interaction.options.getString("title");
          const description = interaction.options.getString("description");
          
          const myScripts = await getScriptsByOwner(interaction.user.id);
          
          if (myScripts.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any scripts yet." }).catch(() => {});
          }

          if (myScripts.length === 1) {
            await sendPanelEmbed(interaction.channel, title, description, myScripts[0].id, myScripts[0].name, interaction.user.id, interaction.guildId);
            return interaction.editReply({ content: `✅ Panel created with script: **${myScripts[0].name}**!` }).catch(() => {});
          }

          panelTempData.set(interaction.user.id, { title, description });

          setTimeout(() => panelTempData.delete(interaction.user.id), 5 * 60 * 1000);

          const sortedScripts = myScripts.sort((a, b) => a.name.localeCompare(b.name));

          const options = sortedScripts.slice(0, 25).map(s => 
            new StringSelectMenuOptionBuilder()
              .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
              .setValue(s.id)
          );

          const select = new StringSelectMenuBuilder()
            .setCustomId("setuppanel_select")
            .setPlaceholder("Select a script for this panel...")
            .addOptions(options);

          return interaction.editReply({ 
            content: "Select which script you want to use for this panel:", 
            components: [new ActionRowBuilder().addComponents(select)] 
          }).catch(() => {});
        } catch (err) {
          console.error("Setup panel error:", err);
          return interaction.editReply({ content: "❌ Failed to create panel. Please try again." }).catch(() => {});
        }
      }

      // --- DELETESCRIPT ---
      if (commandName === "deletescript") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const myScripts = await getScriptsByOwner(interaction.user.id);
          if (myScripts.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any scripts yet." }).catch(() => {});
          }

          const sortedScripts = myScripts.sort((a, b) => a.name.localeCompare(b.name));

          const options = sortedScripts.slice(0, 25).map(s => 
            new StringSelectMenuOptionBuilder()
              .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
              .setValue(s.id)
          );

          const select = new StringSelectMenuBuilder()
            .setCustomId("deletescript_select")
            .setPlaceholder("Select a script to delete...")
            .addOptions(options);

          return interaction.editReply({ 
            content: "Select the script to delete permanently:", 
            components: [new ActionRowBuilder().addComponents(select)] 
          }).catch(() => {});
        } catch (err) {
          console.error("Delete script command error:", err);
          return interaction.editReply({ content: "❌ Failed to load scripts. Please try again." }).catch(() => {});
        }
      }

      // --- FREEMODE ---
      if (commandName === "freemode") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        
        try {
          const options = [
            new StringSelectMenuOptionBuilder()
              .setLabel("Enable Free Mode")
              .setDescription("Allow all users to use the script without key")
              .setValue("enable")
              .setEmoji("✅"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Disable Free Mode")
              .setDescription("Require key to use the script")
              .setValue("disable")
              .setEmoji("❌")
          ];

          const select = new StringSelectMenuBuilder()
            .setCustomId("freemode_mode_select")
            .setPlaceholder("Select mode...")
            .addOptions(options);

          return interaction.editReply({ 
            content: "Select whether to enable or disable free mode:", 
            components: [new ActionRowBuilder().addComponents(select)] 
          }).catch(() => {});
        } catch (err) {
          console.error("Freemode error:", err);
          return interaction.editReply({ content: "❌ Failed to open freemode menu. Please try again." }).catch(() => {});
        }
      }

      // --- WHITELIST ---
      if (commandName === "whitelist") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: false }).catch(() => {});
        try {
          const targetUser = interaction.options.getUser("user");
          const targetRole = interaction.options.getRole("role");
          const days = interaction.options.getInteger("days");

          if (!targetUser && !targetRole) {
            return interaction.editReply({ content: "❌ Select a user or role!" }).catch(() => {});
          }

          const myScripts = await getScriptsByOwner(interaction.user.id);
          if (myScripts.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any scripts yet." }).catch(() => {});
          }

          const targetType = targetUser ? "user" : "role";
          const targetId = targetUser ? targetUser.id : targetRole.id;

          if (myScripts.length === 1) {
            const scriptId = myScripts[0].id;
            const keys = readKeys();
            const expiry = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();
            const cfg = readConfig()[interaction.guildId] || {};
            
            const buyerRoleId = cfg.buyerRoles && cfg.buyerRoles[scriptId] 
              ? cfg.buyerRoles[scriptId] 
              : cfg.buyerRole;
            
            const panelChannelId = cfg.panelChannelId;

            if (targetUser) {
              const key = generateKey();
              keys.push({ 
                key, hwid: null, userId: String(targetUser.id), username: targetUser.username, scriptId, 
                redeemedAt: new Date().toISOString(), expiry, 
                createdAt: new Date().toISOString(), createdBy: interaction.user.id 
              });
              writeKeys(keys);

              if (buyerRoleId) {
                try {
                  const member = await interaction.guild.members.fetch(targetUser.id);
                  await member.roles.add(buyerRoleId);
                } catch {}
              }

              const channelTag = panelChannelId ? `<#${panelChannelId}>` : `<#${interaction.channelId}>`;
              return interaction.editReply({ 
                content: `<@${targetUser.id}> You have been whitelisted for **${myScripts[0].name}**!\nYou can access the script via this message --> ${channelTag}` 
              }).catch(() => {});
            }

            if (targetRole) {
              const role = await interaction.guild.roles.fetch(targetRole.id);
              await interaction.guild.members.fetch();
              const members = role.members.filter(m => !m.user.bot);

              let addedCount = 0;
              for (const [, member] of members) {
                const userKey = generateKey();
                keys.push({ 
                  key: userKey, hwid: null, userId: String(member.id), username: member.user.username, 
                  scriptId, redeemedAt: new Date().toISOString(), expiry, 
                  createdAt: new Date().toISOString(), createdBy: interaction.user.id 
                });
                addedCount++;
                if (buyerRoleId) { 
                  try { await member.roles.add(buyerRoleId); } catch {} 
                }
              }
              writeKeys(keys);

              const channelTag = panelChannelId ? `<#${panelChannelId}>` : `<#${interaction.channelId}>`;
              return interaction.editReply({ 
                content: `<@&${targetRole.id}> You have been whitelisted for **${myScripts[0].name}**! (${addedCount} members)\nYou can access the script via this message --> ${channelTag}` 
              }).catch(() => {});
            }
          }

          await interaction.editReply({ content: "_ _" }).catch(() => {});
          
          const sortedScripts = myScripts.sort((a, b) => a.name.localeCompare(b.name));

          const options = sortedScripts.slice(0, 25).map(s => 
            new StringSelectMenuOptionBuilder()
              .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
              .setValue(s.id)
          );

          const select = new StringSelectMenuBuilder()
            .setCustomId(`whitelist_select:${targetType}:${targetId}:${days}:${interaction.user.id}`)
            .setPlaceholder("Select a script...")
            .addOptions(options);

          return interaction.followUp({ 
            content: `Select a script to whitelist:`, 
            components: [new ActionRowBuilder().addComponents(select)],
            ephemeral: true
          }).catch(() => {});
        } catch (err) {
          console.error("Whitelist command error:", err);
          return interaction.editReply({ content: "❌ Failed to whitelist. Please try again." }).catch(() => {});
        }
      }

      // --- BLACKLIST ---
      if (commandName === "blacklist") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const targetUser = interaction.options.getUser("user");
          const reason = interaction.options.getString("reason") || "No reason";

          const bl = readBlacklist();
          if (bl.some(b => String(b.userId) === String(targetUser.id))) {
            return interaction.editReply({ content: "❌ This user is already blacklisted!" }).catch(() => {});
          }

          bl.push({ 
            userId: String(targetUser.id), username: targetUser.username, reason, 
            blacklistedBy: interaction.user.id, blacklistedAt: new Date().toISOString() 
          });
          writeBlacklist(bl);

          const keys = readKeys();
          const newKeys = keys.filter(k => String(k.userId) !== String(targetUser.id));
          writeKeys(newKeys);

          const cfg = readConfig()[interaction.guildId] || {};
          if (cfg.buyerRole) {
            try {
              const member = await interaction.guild.members.fetch(targetUser.id);
              await member.roles.remove(cfg.buyerRole);
            } catch {}
          }

          return interaction.editReply({ 
            content: `🚫 **<@${targetUser.id}> has been Blacklisted!**\nAll script access and buyer role has been revoked.` 
          }).catch(() => {});
        } catch (err) {
          console.error("Blacklist error:", err);
          return interaction.editReply({ content: "❌ Failed to blacklist user. Please try again." }).catch(() => {});
        }
      }

      // --- UNBLACKLIST ---
      if (commandName === "unblacklist") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const targetUser = interaction.options.getUser("user");
          const bl = readBlacklist();
          const index = bl.findIndex(b => String(b.userId) === String(targetUser.id));

          if (index === -1) {
            return interaction.editReply({ content: "❌ User is not blacklisted." }).catch(() => {});
          }

          bl.splice(index, 1);
          writeBlacklist(bl);
          return interaction.editReply({ content: `✅ **<@${targetUser.id}> has been Unblacklisted!**` }).catch(() => {});
        } catch (err) {
          console.error("Unblacklist error:", err);
          return interaction.editReply({ content: "❌ Failed to unblacklist user. Please try again." }).catch(() => {});
        }
      }

      // --- GENKEY ---
      if (commandName === "genkey") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const days = interaction.options.getInteger("days");
          const amount = interaction.options.getInteger("amount") || 1;

          if (amount > 50) {
            return interaction.editReply({ content: "❌ Maximum 50 keys per generation." }).catch(() => {});
          }

          const myScripts = await getScriptsByOwner(interaction.user.id);
          if (myScripts.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any scripts yet." }).catch(() => {});
          }

          if (myScripts.length === 1) {
            const scriptId = myScripts[0].id;
            const keys = readKeys();
            const generated = [];
            const expiry = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();

            for (let i = 0; i < amount; i++) {
              const key = generateKey();
              keys.push({ 
                key, hwid: null, userId: null, username: null, scriptId, 
                redeemedAt: null, expiry, 
                createdAt: new Date().toISOString(), createdBy: interaction.user.id 
              });
              generated.push(key);
            }
            writeKeys(keys);

            const keyList = generated.map(k => `\`${k}\``).join("\n");
            return interaction.editReply({ 
              content: `✅ **${amount} key(s)** generated for script **${myScripts[0].name}**!\n\n${keyList}` 
            }).catch(() => {});
          }

          const sortedScripts = myScripts.sort((a, b) => a.name.localeCompare(b.name));

          const options = sortedScripts.slice(0, 25).map(s => 
            new StringSelectMenuOptionBuilder()
              .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
              .setValue(s.id)
          );

          const select = new StringSelectMenuBuilder()
            .setCustomId(`genkey_select:${days}:${amount}:${interaction.user.id}`)
            .setPlaceholder("Select a script...")
            .addOptions(options);

          return interaction.editReply({ 
            content: `Select a script to generate ${amount} key(s):`, 
            components: [new ActionRowBuilder().addComponents(select)] 
          }).catch(() => {});
        } catch (err) {
          console.error("Genkey error:", err);
          return interaction.editReply({ content: "❌ Failed to generate keys. Please try again." }).catch(() => {});
        }
      }

      // --- REVOKE ---
      if (commandName === "revoke") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const key = interaction.options.getString("key");
          const targetUser = interaction.options.getUser("user");

          if (!key && !targetUser) {
            return interaction.editReply({ content: "❌ Provide a key or user to revoke!" }).catch(() => {});
          }

          const keys = readKeys();
          let removed = 0;

          if (key) {
            const initialLength = keys.length;
            const newKeys = keys.filter(k => k.key !== key.toUpperCase().trim());
            if (newKeys.length === initialLength) {
              return interaction.editReply({ content: "❌ Key not found." }).catch(() => {});
            }
            writeKeys(newKeys);
            removed = initialLength - newKeys.length;
          } else if (targetUser) {
            const initialLength = keys.length;
            const newKeys = keys.filter(k => String(k.userId) !== String(targetUser.id));
            removed = initialLength - newKeys.length;
            writeKeys(newKeys);
          }

          return interaction.editReply({ content: `✅ Successfully revoked ${removed} key(s)!` }).catch(() => {});
        } catch (err) {
          console.error("Revoke error:", err);
          return interaction.editReply({ content: "❌ Failed to revoke. Please try again." }).catch(() => {});
        }
      }

      // --- LISTKEYS ---
      if (commandName === "listkeys") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const keys = readKeys();
          const myScripts = await getScriptsByOwner(interaction.user.id);
          const scriptMap = {};
          myScripts.forEach(s => { scriptMap[s.id] = s.name; });

          const myKeys = keys.filter(k => k.createdBy === interaction.user.id);

          if (myKeys.length === 0) {
            return interaction.editReply({ content: "📭 You haven't generated any keys yet." }).catch(() => {});
          }

          let list = "🔑 **YOUR GENERATED KEYS**\n\n";
          let used = 0;
          let unused = 0;

          const sortedKeys = myKeys.sort((a, b) => {
            const nameA = scriptMap[a.scriptId] || "";
            const nameB = scriptMap[b.scriptId] || "";
            return nameA.localeCompare(nameB);
          });

          sortedKeys.slice(0, 25).forEach(k => {
            const scriptName = scriptMap[k.scriptId] || "❓ Script deleted";
            const status = k.userId ? `✅ Used by <@${k.userId}>` : "⏳ Unused";
            const expiryText = k.expiry ? new Date(k.expiry).toLocaleDateString() : "♾️ Lifetime";

            if (k.userId) used++;
            else unused++;

            list += `**${scriptName}**\n`;
            list += `  • Key: \`${k.key}\`\n`;
            list += `  • Status: ${status}\n`;
            list += `  • Expiry: ${expiryText}\n\n`;
          });

          list += `\n📊 **Total**: ${myKeys.length} keys | Used: ${used} | Unused: ${unused}`;

          if (list.length > 2000) {
            list = list.slice(0, 1990) + "\n... (truncated)";
          }

          return interaction.editReply({ content: list }).catch(() => {});
        } catch (err) {
          console.error("Listkeys error:", err);
          return interaction.editReply({ content: "❌ Failed to list keys. Please try again." }).catch(() => {});
        }
      }

      // --- USERINFO ---
      if (commandName === "userinfo") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const targetUser = interaction.options.getUser("user");
          const member = await interaction.guild.members.fetch(targetUser.id);

          const keys = readKeys();
          const userKeys = keys.filter(k => String(k.userId) === String(targetUser.id));

          const isBlacklisted_ = isBlacklisted(targetUser.id);
          const hasBuyerRole = member.roles.cache.some(r => {
            const cfg = readConfig()[interaction.guildId] || {};
            const buyerRoles = Object.values(cfg.buyerRoles || {});
            return buyerRoles.includes(r.id) || r.id === cfg.buyerRole;
          });

          const embed = new EmbedBuilder()
            .setTitle(`👤 User Info: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor(0x5865F2)
            .addFields(
              { name: "📛 User", value: `<@${targetUser.id}>`, inline: true },
              { name: "🆔 ID", value: targetUser.id, inline: true },
              { name: "🚫 Blacklist", value: isBlacklisted_ ? "❌ Yes" : "✅ No", inline: true },
              { name: "👑 Buyer Role", value: hasBuyerRole ? "✅ Has" : "❌ Doesn't have", inline: true },
              { name: "🔑 Key Count", value: String(userKeys.length), inline: true }
            )
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] }).catch(() => {});
        } catch (err) {
          console.error("Userinfo error:", err);
          return interaction.editReply({ content: "❌ Failed to get user info. Please try again." }).catch(() => {});
        }
      }
    }

  } catch (err) {
    console.error("❌ Unhandled interaction error:", err);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "❌ An error occurred. Please try again later." });
      } else if (!interaction.replied) {
        await interaction.reply({ content: "❌ An error occurred. Please try again later.", ephemeral: true });
      }
    } catch (replyErr) {
      console.error("Failed to send error message:", replyErr);
    }
  }
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled rejection:", error);
});

client.login(CONFIG.token);
