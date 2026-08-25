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

// FIX: Simpan title/description sementara di sini supaya ga perlu masuk ke customId
const panelTempData = new Map(); // key: userId, value: { title, description }

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
    .setDescription("Set buyer role")
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

// Helper: buat dan kirim panel embed ke channel
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
      .setCustomId(`get_script:${ownerId}:${scriptId}`)
      .setLabel("Get Script")
      .setEmoji("📜")
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("get_role")
      .setLabel("Get Role")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("reset_hwid")
      .setLabel("Reset HWID")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("get_stats")
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
          const scriptId = parts[2]; // scriptId spesifik panel ini

          const keys = readKeys();
          const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

          if (userKeys.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any active key!" }).catch(() => {});
          }

          // Cari key yang scriptId-nya cocok dengan panel ini
          const validKey = userKeys.find(k => k.scriptId === scriptId);

          if (!validKey) {
            return interaction.editReply({ content: "❌ You don't have a key for this script!" }).catch(() => {});
          }

          const loaderCode = `script_key="${validKey.key}";\nloadstring(game:HttpGet("${CONFIG.apiBase}/api/loader/${validKey.scriptId}.lua"))()`;
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

      if (customId === "get_role") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const cfg = readConfig()[interaction.guildId] || {};
          const buyerRoleId = cfg.buyerRole;

          if (!buyerRoleId) {
            return interaction.editReply({ content: "❌ Buyer role has not been set by admin!" }).catch(() => {});
          }

          const keys = readKeys();
          const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

          if (userKeys.length === 0) {
            return interaction.editReply({ content: "❌ You haven't redeemed a key yet!" }).catch(() => {});
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

      if (customId === "reset_hwid") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const keys = readKeys();
          const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

          if (userKeys.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any active key!" }).catch(() => {});
          }

          let resetCount = 0;
          const updatedKeys = keys.map(k => {
            if (String(k.userId) === String(interaction.user.id) && k.hwid) {
              resetCount++;
              return { ...k, hwid: null };
            }
            return k;
          });

          if (resetCount === 0) {
            return interaction.editReply({ content: "ℹ️ No HWID is registered for your keys." }).catch(() => {});
          }

          writeKeys(updatedKeys);
          return interaction.editReply({ content: `✅ HWID has been reset for ${resetCount} key(s)!` }).catch(() => {});
        } catch (err) {
          console.error("Reset HWID error:", err);
          return interaction.editReply({ content: "❌ Failed to reset HWID. Please try again." }).catch(() => {});
        }
      }

      if (customId === "get_stats") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const keys = readKeys();
          const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

          if (userKeys.length === 0) {
            return interaction.editReply({ content: "❌ You don't have any active key!" }).catch(() => {});
          }

          const myScripts = await getScriptsByOwner(interaction.user.id);
          const scriptMap = {};
          myScripts.forEach(s => { scriptMap[s.id] = s.name; });

          let stats = "📊 **YOUR KEY STATUS**\n\n";
          let totalKeys = userKeys.length;
          let activeKeys = 0;
          let expiredKeys = 0;

          userKeys.forEach(k => {
            const scriptName = scriptMap[k.scriptId] || "❓ Script deleted";
            const isExpired = k.expiry && new Date(k.expiry) < new Date();
            const status = isExpired ? "❌ Expired" : "✅ Active";
            const hwidStatus = k.hwid ? "🔒 Bound" : "🔓 Not bound";
            const expiryText = k.expiry ? new Date(k.expiry).toLocaleDateString() : "♾️ Lifetime";

            if (!isExpired) activeKeys++;
            else expiredKeys++;

            stats += `**${scriptName}**\n`;
            stats += `  • Status: ${status}\n`;
            stats += `  • HWID: ${hwidStatus}\n`;
            stats += `  • Expiry: ${expiryText}\n`;
            stats += `  • Key: \`${k.key}\`\n\n`;
          });

          stats += `\n📈 **Total**: ${totalKeys} keys | Active: ${activeKeys} | Expired: ${expiredKeys}`;

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
        if (cfg.buyerRole) {
          try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            await member.roles.add(cfg.buyerRole);
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

      // --- SETUP PANEL SELECT ---
      // FIX: customId sekarang cuma "setuppanel_select", title/description diambil dari panelTempData
      if (interaction.customId === "setuppanel_select") {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
        try {
          const scriptId = interaction.values[0];
          
          // Ambil title/description dari temp storage
          const tempData = panelTempData.get(interaction.user.id);
          if (!tempData) {
            return interaction.editReply({ content: "❌ Session expired. Please run /setuppanel again." }).catch(() => {});
          }
          const { title, description } = tempData;
          panelTempData.delete(interaction.user.id); // cleanup

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
          const buyerRoleId = cfg.buyerRole;
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

      if (commandName === "setbuyerrole") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Admin only.", ephemeral: true }).catch(() => {});
        }
        const role = interaction.options.getRole("role");
        const cfg = readConfig();
        if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
        cfg[interaction.guildId].buyerRole = role.id;
        writeConfig(cfg);
        return interaction.reply({ content: `✅ Buyer role set to <@&${role.id}>!`, ephemeral: true }).catch(() => {});
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

          // Satu script: langsung buat panel
          if (myScripts.length === 1) {
            await sendPanelEmbed(interaction.channel, title, description, myScripts[0].id, myScripts[0].name, interaction.user.id, interaction.guildId);
            return interaction.editReply({ content: `✅ Panel created with script: **${myScripts[0].name}**!` }).catch(() => {});
          }

          // Banyak script: simpan title/description ke temp, tampilkan dropdown
          panelTempData.set(interaction.user.id, { title, description });

          // Auto cleanup setelah 5 menit
          setTimeout(() => panelTempData.delete(interaction.user.id), 5 * 60 * 1000);

          const options = myScripts.slice(0, 25).map(s => 
            new StringSelectMenuOptionBuilder()
              .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
              .setValue(s.id)
          );

          const select = new StringSelectMenuBuilder()
            .setCustomId("setuppanel_select")  // FIX: customId simpel, data ada di panelTempData
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

          const options = myScripts.slice(0, 25).map(s => 
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

      // --- WHITELIST ---
      if (commandName === "whitelist") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true }).catch(() => {});
        }
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
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
            const buyerRoleId = cfg.buyerRole;
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

          const options = myScripts.slice(0, 25).map(s => 
            new StringSelectMenuOptionBuilder()
              .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
              .setValue(s.id)
          );

          const select = new StringSelectMenuBuilder()
            .setCustomId(`whitelist_select:${targetType}:${targetId}:${days}:${interaction.user.id}`)
            .setPlaceholder("Select a script...")
            .addOptions(options);

          return interaction.editReply({ 
            content: `Select a script to whitelist:`, 
            components: [new ActionRowBuilder().addComponents(select)] 
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

          const options = myScripts.slice(0, 25).map(s => 
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

          myKeys.slice(0, 25).forEach(k => {
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
            return r.id === cfg.buyerRole;
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
