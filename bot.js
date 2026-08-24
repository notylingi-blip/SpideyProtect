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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, "[]", "utf8");
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, "{}", "utf8");
if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, "[]", "utf8");

function readKeys() { try { return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")); } catch { return []; } }
function writeKeys(data) { fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2)); }
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; } }
function writeConfig(data) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2)); }
function readBlacklist() { try { return JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf8")); } catch { return []; } }
function writeBlacklist(data) { fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2)); }

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

async function getScriptsByOwner(ownerId) {
  try {
    const res = await axios.get(`${CONFIG.apiBase}/api/scripts/internal`, {
      headers: { "x-api-secret": CONFIG.apiSecret },
      params: { ownerId },
      timeout: 8000
    });
    return res.data || [];
  } catch {
    return [];
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const commands = [
  new SlashCommandBuilder().setName("setuppanel").setDescription("Setup panel embed").addStringOption(o => o.setName("title").setDescription("Judul").setRequired(true)).addStringOption(o => o.setName("description").setDescription("Deskripsi").setRequired(true)),
  new SlashCommandBuilder().setName("whitelistrole").setDescription("Set role admin").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName("setbuyerrole").setDescription("Set role buyer").addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName("genkey").setDescription("Generate key").addIntegerOption(o => o.setName("days").setDescription("Durasi hari (0=lifetime)").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Jumlah key").setRequired(false)),
  new SlashCommandBuilder().setName("whitelist").setDescription("Whitelist user/role").addIntegerOption(o => o.setName("days").setDescription("Durasi hari (0=lifetime)").setRequired(true)).addUserOption(o => o.setName("user").setDescription("User").setRequired(false)).addRoleOption(o => o.setName("role").setDescription("Role").setRequired(false)),
  new SlashCommandBuilder().setName("blacklist").setDescription("Blacklist user").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addStringOption(o => o.setName("reason").setDescription("Alasan").setRequired(false)),
  new SlashCommandBuilder().setName("unblacklist").setDescription("Unblacklist user").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder().setName("revoke").setDescription("Revoke key/user").addStringOption(o => o.setName("key").setDescription("Key").setRequired(false)).addUserOption(o => o.setName("user").setDescription("User").setRequired(false)),
  new SlashCommandBuilder().setName("listkeys").setDescription("Lihat semua key"),
  new SlashCommandBuilder().setName("userinfo").setDescription("Lihat info user").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)),
  new SlashCommandBuilder().setName("deletescript").setDescription("Hapus script milikmu dari SpideyProtect")
].map(c => c.toJSON());

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(CONFIG.token);
  try {
    await rest.put(Routes.applicationCommands(CONFIG.clientId), { body: commands });
    console.log(`Bot ready: ${client.user.tag}`);
  } catch (err) { console.error(err); }
});

client.on("interactionCreate", async interaction => {
  try {
    // ==================== BLACKLIST CHECK ====================
    if (interaction.isButton() && isBlacklisted(interaction.user.id)) {
      return interaction.reply({ content: "❌ You Have Been Blacklisted By The Owner", ephemeral: true });
    }

    // ==================== HANDLER TOMBOL ====================
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // --- TOMBOL GET SCRIPT ---
      if (customId.startsWith("get_script:")) {
        await interaction.deferReply({ ephemeral: true });

        const [, ownerId] = customId.split(":");
        const keys = readKeys();
        const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

        if (userKeys.length === 0) {
          return interaction.editReply({ content: "❌ Kamu belum punya key aktif!" });
        }

        const myScripts = await getScriptsByOwner(ownerId);
        const activeScriptIds = myScripts.map(s => s.id);

        const validKey = userKeys.find(k => activeScriptIds.includes(k.scriptId));

        if (!validKey) {
          return interaction.editReply({ content: "❌ Script untuk key milikmu sudah dihapus atau tidak ditemukan!" });
        }

        const loaderCode = `script_key="${validKey.key}";\nloadstring(game:HttpGet("${CONFIG.apiBase}/api/loader/${validKey.scriptId}.lua"))()`;
        return interaction.editReply({ content: `📜 Loader kamu:\n\`\`\`lua\n${loaderCode}\n\`\`\`` });
      }

      // --- TOMBOL REDEEM KEY ---
      if (customId === "redeem_key") {
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
        return interaction.showModal(modal);
      }

      // --- TOMBOL GET ROLE ---
      if (customId === "get_role") {
        await interaction.deferReply({ ephemeral: true });

        const cfg = readConfig()[interaction.guildId] || {};
        const buyerRoleId = cfg.buyerRole;

        if (!buyerRoleId) {
          return interaction.editReply({ content: "❌ Buyer role belum di-set oleh admin!" });
        }

        const keys = readKeys();
        const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

        if (userKeys.length === 0) {
          return interaction.editReply({ content: "❌ Kamu belum redeem key! Redeem dulu ya." });
        }

        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          if (member.roles.cache.has(buyerRoleId)) {
            return interaction.editReply({ content: "✅ Kamu sudah memiliki role buyer!" });
          }

          await member.roles.add(buyerRoleId);
          return interaction.editReply({ content: "✅ Role buyer berhasil diberikan!" });
        } catch (err) {
          return interaction.editReply({ content: "❌ Gagal memberikan role. Pastikan bot memiliki permission." });
        }
      }

      // --- TOMBOL RESET HWID ---
      if (customId === "reset_hwid") {
        await interaction.deferReply({ ephemeral: true });

        const keys = readKeys();
        const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

        if (userKeys.length === 0) {
          return interaction.editReply({ content: "❌ Kamu belum punya key aktif!" });
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
          return interaction.editReply({ content: "ℹ️ Tidak ada HWID yang terdaftar untuk key kamu." });
        }

        writeKeys(updatedKeys);
        return interaction.editReply({ content: `✅ HWID berhasil di-reset untuk ${resetCount} key!` });
      }

      // --- TOMBOL GET STATS ---
      if (customId === "get_stats") {
        await interaction.deferReply({ ephemeral: true });

        const keys = readKeys();
        const userKeys = keys.filter(k => String(k.userId) === String(interaction.user.id));

        if (userKeys.length === 0) {
          return interaction.editReply({ content: "❌ Kamu belum punya key aktif!" });
        }

        const myScripts = await getScriptsByOwner(interaction.user.id);
        const scriptMap = {};
        myScripts.forEach(s => { scriptMap[s.id] = s.name; });

        let stats = "📊 **STATUS KEY KAMU**\n\n";
        let totalKeys = userKeys.length;
        let activeKeys = 0;
        let expiredKeys = 0;

        userKeys.forEach(k => {
          const scriptName = scriptMap[k.scriptId] || "❓ Script dihapus";
          const isExpired = k.expiry && new Date(k.expiry) < new Date();
          const status = isExpired ? "❌ Expired" : "✅ Aktif";
          const hwidStatus = k.hwid ? "🔒 Terikat" : "🔓 Belum terikat";
          const expiryText = k.expiry ? new Date(k.expiry).toLocaleDateString() : "♾️ Lifetime";

          if (!isExpired) activeKeys++;
          else expiredKeys++;

          stats += `**${scriptName}**\n`;
          stats += `  • Status: ${status}\n`;
          stats += `  • HWID: ${hwidStatus}\n`;
          stats += `  • Expiry: ${expiryText}\n`;
          stats += `  • Key: \`${k.key}\`\n\n`;
        });

        stats += `\n📈 **Total**: ${totalKeys} key | Aktif: ${activeKeys} | Expired: ${expiredKeys}`;

        if (stats.length > 2000) {
          stats = stats.slice(0, 1990) + "\n... (truncated)";
        }

        return interaction.editReply({ content: stats });
      }

      // Tombol tidak dikenal
      return interaction.reply({ content: "❌ Tombol tidak dikenal.", ephemeral: true });
    }

    // ==================== MODAL SUBMIT ====================
    if (interaction.isModalSubmit() && interaction.customId === "modal_redeem") {
      await interaction.deferReply({ ephemeral: true });
      const keyInput = interaction.fields.getTextInputValue("input_key").toUpperCase().trim();
      const keys = readKeys();
      const keyData = keys.find(k => k.key === keyInput);

      if (!keyData) return interaction.editReply({ content: "❌ Key tidak valid." });
      if (keyData.userId && String(keyData.userId) !== String(interaction.user.id)) {
        return interaction.editReply({ content: "❌ Key sudah dipakai user lain." });
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
        } catch {}
      }

      return interaction.editReply({ content: "✅ Key berhasil di-redeem!" });
    }

    // ==================== SELECT MENU ====================
    if (interaction.isStringSelectMenu()) {
      // --- DELETE SCRIPT SELECT ---
      if (interaction.customId === "deletescript_select") {
        await interaction.deferReply({ ephemeral: true });
        const scriptId = interaction.values[0];

        try {
          await axios.delete(`${CONFIG.apiBase}/api/scripts/internal/${scriptId}`, {
            headers: { 
              "x-api-secret": CONFIG.apiSecret,
              "x-owner-id": interaction.user.id
            }
          });

          const keys = readKeys();
          const filteredKeys = keys.filter(k => k.scriptId !== scriptId);
          writeKeys(filteredKeys);

          return interaction.editReply({ content: "✅ Script beserta seluruh key miliknya berhasil dihapus permanen!" });
        } catch (err) {
          return interaction.editReply({ content: "❌ Gagal menghapus script." });
        }
      }

      // --- WHITELIST SELECT ---
      if (interaction.customId.startsWith("whitelist_select:")) {
        await interaction.deferReply({ ephemeral: false });

        const [, targetType, targetId, daysStr, adminId] = interaction.customId.split(":");
        const days = parseInt(daysStr);
        const scriptId = interaction.values[0];

        const myScripts = await getScriptsByOwner(adminId);
        const owned = myScripts.find(s => s.id === scriptId);
        if (!owned) return interaction.editReply({ content: "❌ Script bukan milikmu." });

        const keys = readKeys();
        const expiry = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();
        const cfg = readConfig()[interaction.guildId] || {};
        const buyerRoleId = cfg.buyerRole;
        const panelChannelId = cfg.panelChannelId;

        if (targetType === "user") {
          const key = generateKey();
          keys.push({ 
            key, 
            hwid: null, 
            userId: String(targetId), 
            username: null, 
            scriptId, 
            redeemedAt: new Date().toISOString(), 
            expiry, 
            createdAt: new Date().toISOString(), 
            createdBy: adminId 
          });
          writeKeys(keys);

          if (buyerRoleId) {
            try {
              const member = await interaction.guild.members.fetch(targetId);
              await member.roles.add(buyerRoleId);
            } catch {}
          }

          const channelTag = panelChannelId ? `<#${panelChannelId}>` : `<#${interaction.channelId}>`;
          return interaction.editReply({ content: `<@${targetId}> You have been whitelisted!\nYou can access the script via this message --> ${channelTag}` });

        } else {
          const role = await interaction.guild.roles.fetch(targetId);
          await interaction.guild.members.fetch();
          const members = role.members.filter(m => !m.user.bot);

          let addedCount = 0;
          for (const [, member] of members) {
            const userKey = generateKey();
            keys.push({ 
              key: userKey, 
              hwid: null, 
              userId: String(member.id), 
              username: member.user.username, 
              scriptId, 
              redeemedAt: new Date().toISOString(), 
              expiry, 
              createdAt: new Date().toISOString(), 
              createdBy: adminId 
            });
            addedCount++;
            if (buyerRoleId) { try { await member.roles.add(buyerRoleId); } catch {} }
          }
          writeKeys(keys);

          const channelTag = panelChannelId ? `<#${panelChannelId}>` : `<#${interaction.channelId}>`;
          return interaction.editReply({ content: `<@&${targetId}> You have been whitelisted! (${addedCount} members)\nYou can access the script via this message --> ${channelTag}` });
        }
      }
    }

    // ==================== CHAT INPUT COMMANDS ====================
    if (interaction.isChatInputCommand()) {
      const commandName = interaction.commandName;

      // --- WHITELISTROLE ---
      if (commandName === "whitelistrole") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Hanya Admin.", ephemeral: true });
        }
        const role = interaction.options.getRole("role");
        const cfg = readConfig();
        if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
        cfg[interaction.guildId].whitelistRole = role.id;
        writeConfig(cfg);
        return interaction.reply({ content: `✅ Role <@&${role.id}> sekarang admin bot.`, ephemeral: true });
      }

      // --- SETBUYERROLE ---
      if (commandName === "setbuyerrole") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Hanya Admin.", ephemeral: true });
        }
        const role = interaction.options.getRole("role");
        const cfg = readConfig();
        if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
        cfg[interaction.guildId].buyerRole = role.id;
        writeConfig(cfg);
        return interaction.reply({ content: `✅ Buyer role di-set ke <@&${role.id}>!`, ephemeral: true });
      }

      // --- SETUPPANEL ---
      if (commandName === "setuppanel") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        
        const myScripts = await getScriptsByOwner(interaction.user.id);
        if (myScripts.length === 0) {
          return interaction.editReply({ content: "❌ Kamu belum punya script." });
        }

        const embed = new EmbedBuilder()
          .setTitle(interaction.options.getString("title"))
          .setDescription(interaction.options.getString("description"))
          .setColor(0x5865F2)
          .setFooter({ text: "SpideyProtect • Panel" })
          .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("redeem_key")
            .setLabel("Redeem Key")
            .setEmoji("🔑")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`get_script:${interaction.user.id}`)
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

        await interaction.channel.send({ 
          embeds: [embed], 
          components: [row1, row2, row3] 
        });

        const cfg = readConfig();
        if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
        cfg[interaction.guildId].panelChannelId = interaction.channel.id;
        writeConfig(cfg);

        return interaction.editReply({ content: "✅ Panel dibuat!" });
      }

      // --- DELETESCRIPT ---
      if (commandName === "deletescript") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const myScripts = await getScriptsByOwner(interaction.user.id);
        if (myScripts.length === 0) {
          return interaction.editReply({ content: "❌ Kamu belum punya script." });
        }

        const options = myScripts.slice(0, 25).map(s => 
          new StringSelectMenuOptionBuilder()
            .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
            .setValue(s.id)
        );

        const select = new StringSelectMenuBuilder()
          .setCustomId("deletescript_select")
          .setPlaceholder("Pilih script yang mau dihapus...")
          .addOptions(options);

        return interaction.editReply({ 
          content: "Pilih script yang akan dihapus permanen:", 
          components: [new ActionRowBuilder().addComponents(select)] 
        });
      }

      // --- WHITELIST ---
      if (commandName === "whitelist") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser("user");
        const targetRole = interaction.options.getRole("role");
        const days = interaction.options.getInteger("days");

        if (!targetUser && !targetRole) {
          return interaction.editReply({ content: "❌ Pilih user atau role!" });
        }

        const myScripts = await getScriptsByOwner(interaction.user.id);
        if (myScripts.length === 0) {
          return interaction.editReply({ content: "❌ Kamu belum punya script." });
        }

        const targetType = targetUser ? "user" : "role";
        const targetId = targetUser ? targetUser.id : targetRole.id;

        const options = myScripts.slice(0, 25).map(s => 
          new StringSelectMenuOptionBuilder()
            .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
            .setValue(s.id)
        );

        const select = new StringSelectMenuBuilder()
          .setCustomId(`whitelist_select:${targetType}:${targetId}:${days}:${interaction.user.id}`)
          .setPlaceholder("Pilih script...")
          .addOptions(options);

        return interaction.editReply({ 
          content: `Pilih script untuk di-whitelist:`, 
          components: [new ActionRowBuilder().addComponents(select)] 
        });
      }

      // --- BLACKLIST ---
      if (commandName === "blacklist") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason";

        const bl = readBlacklist();
        if (bl.some(b => String(b.userId) === String(targetUser.id))) {
          return interaction.editReply({ content: "❌ User ini sudah ada di blacklist!" });
        }

        bl.push({ 
          userId: String(targetUser.id), 
          username: targetUser.username, 
          reason, 
          blacklistedBy: interaction.user.id, 
          blacklistedAt: new Date().toISOString() 
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
          content: `🚫 **<@${targetUser.id}> telah di-Blacklist!**\nSeluruh akses script dan role buyer telah dicabut.` 
        });
      }

      // --- UNBLACKLIST ---
      if (commandName === "unblacklist") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser("user");
        const bl = readBlacklist();
        const index = bl.findIndex(b => String(b.userId) === String(targetUser.id));

        if (index === -1) {
          return interaction.editReply({ content: "❌ User tidak ada di blacklist." });
        }

        bl.splice(index, 1);
        writeBlacklist(bl);
        return interaction.editReply({ content: `✅ **<@${targetUser.id}> telah di-Unblacklist!**` });
      }

      // --- GENKEY ---
      if (commandName === "genkey") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const days = interaction.options.getInteger("days");
        const amount = interaction.options.getInteger("amount") || 1;

        if (amount > 50) {
          return interaction.editReply({ content: "❌ Maksimal 50 key dalam sekali generate." });
        }

        const myScripts = await getScriptsByOwner(interaction.user.id);
        if (myScripts.length === 0) {
          return interaction.editReply({ content: "❌ Kamu belum punya script." });
        }

        if (myScripts.length === 1) {
          // Langsung generate tanpa pilihan
          const scriptId = myScripts[0].id;
          const keys = readKeys();
          const generated = [];
          const expiry = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();

          for (let i = 0; i < amount; i++) {
            const key = generateKey();
            keys.push({ 
              key, 
              hwid: null, 
              userId: null, 
              username: null, 
              scriptId, 
              redeemedAt: null, 
              expiry, 
              createdAt: new Date().toISOString(), 
              createdBy: interaction.user.id 
            });
            generated.push(key);
          }
          writeKeys(keys);

          const keyList = generated.map(k => `\`${k}\``).join("\n");
          return interaction.editReply({ 
            content: `✅ **${amount} key** berhasil dibuat untuk script **${myScripts[0].name}**!\n\n${keyList}` 
          });
        }

        // Tampilkan pilihan script
        const options = myScripts.slice(0, 25).map(s => 
          new StringSelectMenuOptionBuilder()
            .setLabel(s.name.length > 50 ? s.name.slice(0, 47) + "..." : s.name)
            .setValue(s.id)
        );

        const select = new StringSelectMenuBuilder()
          .setCustomId(`genkey_select:${days}:${amount}:${interaction.user.id}`)
          .setPlaceholder("Pilih script...")
          .addOptions(options);

        return interaction.editReply({ 
          content: `Pilih script untuk membuat ${amount} key:`, 
          components: [new ActionRowBuilder().addComponents(select)] 
        });
      }

      // --- GENKEY SELECT MENU ---
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("genkey_select:")) {
        await interaction.deferReply({ ephemeral: true });

        const [, daysStr, amountStr, adminId] = interaction.customId.split(":");
        const days = parseInt(daysStr);
        const amount = parseInt(amountStr);
        const scriptId = interaction.values[0];

        const myScripts = await getScriptsByOwner(adminId);
        const owned = myScripts.find(s => s.id === scriptId);
        if (!owned) return interaction.editReply({ content: "❌ Script bukan milikmu." });

        const keys = readKeys();
        const generated = [];
        const expiry = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();

        for (let i = 0; i < amount; i++) {
          const key = generateKey();
          keys.push({ 
            key, 
            hwid: null, 
            userId: null, 
            username: null, 
            scriptId, 
            redeemedAt: null, 
            expiry, 
            createdAt: new Date().toISOString(), 
            createdBy: adminId 
          });
          generated.push(key);
        }
        writeKeys(keys);

        const keyList = generated.map(k => `\`${k}\``).join("\n");
        return interaction.editReply({ 
          content: `✅ **${amount} key** berhasil dibuat untuk script **${owned.name}**!\n\n${keyList}` 
        });
      }

      // --- REVOKE ---
      if (commandName === "revoke") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const key = interaction.options.getString("key");
        const targetUser = interaction.options.getUser("user");

        if (!key && !targetUser) {
          return interaction.editReply({ content: "❌ Masukkan key atau user yang akan di-revoke!" });
        }

        const keys = readKeys();
        let removed = 0;

        if (key) {
          const initialLength = keys.length;
          const newKeys = keys.filter(k => k.key !== key.toUpperCase().trim());
          if (newKeys.length === initialLength) {
            return interaction.editReply({ content: "❌ Key tidak ditemukan." });
          }
          writeKeys(newKeys);
          removed = initialLength - newKeys.length;
        } else if (targetUser) {
          const initialLength = keys.length;
          const newKeys = keys.filter(k => String(k.userId) !== String(targetUser.id));
          removed = initialLength - newKeys.length;
          writeKeys(newKeys);
        }

        return interaction.editReply({ content: `✅ Berhasil me-revoke ${removed} key!` });
      }

      // --- LISTKEYS ---
      if (commandName === "listkeys") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const keys = readKeys();
        const myScripts = await getScriptsByOwner(interaction.user.id);
        const scriptMap = {};
        myScripts.forEach(s => { scriptMap[s.id] = s.name; });

        const myKeys = keys.filter(k => k.createdBy === interaction.user.id);

        if (myKeys.length === 0) {
          return interaction.editReply({ content: "📭 Belum ada key yang kamu buat." });
        }

        let list = "🔑 **DAFTAR KEY YANG KAMU BUAT**\n\n";
        let used = 0;
        let unused = 0;

        myKeys.slice(0, 25).forEach(k => {
          const scriptName = scriptMap[k.scriptId] || "❓ Script dihapus";
          const status = k.userId ? `✅ Dipakai oleh <@${k.userId}>` : "⏳ Belum dipakai";
          const expiryText = k.expiry ? new Date(k.expiry).toLocaleDateString() : "♾️ Lifetime";

          if (k.userId) used++;
          else unused++;

          list += `**${scriptName}**\n`;
          list += `  • Key: \`${k.key}\`\n`;
          list += `  • Status: ${status}\n`;
          list += `  • Expiry: ${expiryText}\n\n`;
        });

        list += `\n📊 **Total**: ${myKeys.length} key | Dipakai: ${used} | Belum dipakai: ${unused}`;

        if (list.length > 2000) {
          list = list.slice(0, 1990) + "\n... (truncated)";
        }

        return interaction.editReply({ content: list });
      }

      // --- USERINFO ---
      if (commandName === "userinfo") {
        if (!hasPermission(interaction.member, interaction.guildId)) {
          return interaction.reply({ content: "❌ No Permission.", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

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
          .setTitle(`👤 Info User: ${targetUser.username}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setColor(0x5865F2)
          .addFields(
            { name: "📛 User", value: `<@${targetUser.id}>`, inline: true },
            { name: "🆔 ID", value: targetUser.id, inline: true },
            { name: "🚫 Blacklist", value: isBlacklisted_ ? "❌ Ya" : "✅ Tidak", inline: true },
            { name: "👑 Buyer Role", value: hasBuyerRole ? "✅ Punya" : "❌ Tidak", inline: true },
            { name: "🔑 Jumlah Key", value: String(userKeys.length), inline: true }
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }
    }

  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "❌ Terjadi error. Coba lagi nanti." }).catch(() => {});
    } else {
      await interaction.reply({ content: "❌ Terjadi error. Coba lagi nanti.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(CONFIG.token);
