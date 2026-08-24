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
const crypto = require("crypto");
const axios = require("axios");

/*
==================================================
 CONFIG
==================================================
*/

const CONFIG = {
  token: process.env.BOT_TOKEN || "TOKEN_LO_DISINI",
  clientId: process.env.DISCORD_CLIENT_ID || "1541101786855899177",
  apiBase: process.env.API_BASE || "https://spideyprotect-production.up.railway.app",
  apiSecret: process.env.API_SECRET || "spidey-internal-secret"
};

/*
==================================================
 DATABASE (JSON)
==================================================
*/

const DATA_DIR = path.join(__dirname, "data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const CONFIG_FILE = path.join(DATA_DIR, "botconfig.json");
const BLACKLIST_FILE = path.join(DATA_DIR, "blacklist.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(KEYS_FILE)) {
  fs.writeFileSync(KEYS_FILE, "[]", "utf8");
}

if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, "{}", "utf8");
}

if (!fs.existsSync(BLACKLIST_FILE)) {
  fs.writeFileSync(BLACKLIST_FILE, "[]", "utf8");
}

function readKeys() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")); } catch { return []; }
}

function writeKeys(data) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

function readBlacklist() {
  try { return JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf8")); } catch { return []; }
}

function writeBlacklist(data) {
  fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2));
}

function isBlacklisted(userId) {
  const bl = readBlacklist();
  return bl.some(b => b.userId === userId);
}

function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segments = [6, 6, 6, 6];
  return segments
    .map(len =>
      Array.from({ length: len }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join("")
    )
    .join("-");
}

/*
==================================================
 CEK PERMISSION
==================================================
*/

function hasPermission(member, guildId) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const cfg = readConfig();
  const roleId = cfg[guildId]?.whitelistRole;
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

async function getScriptsByOwner(ownerId) {
  try {
    const res = await axios.get(
      `${CONFIG.apiBase}/api/scripts/internal`,
      {
        headers: { "x-api-secret": CONFIG.apiSecret },
        params: { ownerId },
        timeout: 8000
      }
    );
    return res.data || [];
  } catch {
    return [];
  }
}

/*
==================================================
 CLIENT & COMMANDS
==================================================
*/

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const commands = [
  new SlashCommandBuilder()
    .setName("setuppanel")
    .setDescription("Setup panel embed di channel ini (hanya script milikmu)")
    .addStringOption(opt => opt.setName("title").setDescription("Judul embed").setRequired(true))
    .addStringOption(opt => opt.setName("description").setDescription("Deskripsi embed").setRequired(true)),

  new SlashCommandBuilder()
    .setName("whitelistrole")
    .setDescription("Set role yang bisa menggunakan command admin bot")
    .addRoleOption(opt => opt.setName("role").setDescription("Role yang diberi akses admin").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setbuyerrole")
    .setDescription("Set role buyer untuk diberikan kepada user yang di-whitelist/redeem")
    .addRoleOption(opt => opt.setName("role").setDescription("Role buyer").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate key untuk script milikmu")
    .addIntegerOption(opt => opt.setName("days").setDescription("Durasi key dalam hari (0 = lifetime)").setRequired(true))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Jumlah key (max 20, default 1)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Whitelist user atau role ke script milikmu")
    .addIntegerOption(opt => opt.setName("days").setDescription("Durasi akses dalam hari (0 = lifetime)").setRequired(true))
    .addUserOption(opt => opt.setName("user").setDescription("User yang mau di-whitelist").setRequired(false))
    .addRoleOption(opt => opt.setName("role").setDescription("Role yang semua membernya mau di-whitelist").setRequired(false)),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Blacklist user agar tidak bisa mengakses script")
    .addUserOption(opt => opt.setName("user").setDescription("User yang mau diblacklist").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Alasan blacklist").setRequired(false)),

  new SlashCommandBuilder()
    .setName("unblacklist")
    .setDescription("Hapus user dari daftar blacklist")
    .addUserOption(opt => opt.setName("user").setDescription("User yang mau di-unblacklist").setRequired(true)),

  new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Hapus/revoke key atau akses user")
    .addStringOption(opt => opt.setName("key").setDescription("Key yang mau direvoke").setRequired(false))
    .addUserOption(opt => opt.setName("user").setDescription("User yang mau direvoke").setRequired(false)),

  new SlashCommandBuilder()
    .setName("listkeys")
    .setDescription("Lihat semua key yang pernah kamu buat"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Lihat info key/akses user")
    .addUserOption(opt => opt.setName("user").setDescription("User yang mau dicek").setRequired(true)),

  new SlashCommandBuilder()
    .setName("deletescript")
    .setDescription("Hapus script milikmu dari SpideyProtect")
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(CONFIG.token);
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(CONFIG.clientId), { body: commands });
    console.log("Slash commands registered!");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

client.once("ready", async () => {
  console.log(`Bot ready: ${client.user.tag}`);
  await registerCommands();
});

/*
==================================================
 INTERACTION HANDLING
==================================================
*/

client.on("interactionCreate", async interaction => {
  try {

    // Filter Blacklist untuk seluruh tombol di panel Discord
    if (interaction.isButton() && isBlacklisted(interaction.user.id)) {
      return interaction.reply({
        content: "❌ You Have Been Blacklisted By The Owner",
        ephemeral: true
      });
    }

    /* /whitelistrole */
    if (interaction.isChatInputCommand() && interaction.commandName === "whitelistrole") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya Administrator yang bisa set whitelistrole.", ephemeral: true });
      }
      const role = interaction.options.getRole("role");
      const cfg = readConfig();
      if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
      cfg[interaction.guildId].whitelistRole = role.id;
      writeConfig(cfg);
      return interaction.reply({ content: `✅ Role <@&${role.id}> sekarang bisa menggunakan command admin bot.`, ephemeral: true });
    }

    /* /setbuyerrole */
    if (interaction.isChatInputCommand() && interaction.commandName === "setbuyerrole") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya Administrator yang bisa set buyer role.", ephemeral: true });
      }
      const role = interaction.options.getRole("role");
      const cfg = readConfig();
      if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
      cfg[interaction.guildId].buyerRole = role.id;
      writeConfig(cfg);
      return interaction.reply({ content: `✅ Buyer role berhasil di-set ke <@&${role.id}>!`, ephemeral: true });
    }

    /* /setuppanel */
    if (interaction.isChatInputCommand() && interaction.commandName === "setuppanel") {
      if (!hasPermission(interaction.member, interaction.guildId)) {
        return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const myScripts = await getScriptsByOwner(interaction.user.id);
      if (myScripts.length === 0) {
        return interaction.editReply({ content: "❌ Kamu belum punya script di SpideyProtect." });
      }

      const title = interaction.options.getString("title");
      const description = interaction.options.getString("description");
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x5865F2)
        .setFooter({ text: `Panel by ${interaction.user.username}` });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("redeem_key").setLabel("Redeem Key").setEmoji("🔑").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`get_script:${interaction.user.id}`).setLabel("Get Script").setEmoji("📜").setStyle(ButtonStyle.Primary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("get_role").setLabel("Get Role").setEmoji("👤").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("reset_hwid").setLabel("Reset HWID").setEmoji("⚙️").setStyle(ButtonStyle.Secondary)
      );
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("get_stats").setLabel("Get Stats").setEmoji("📊").setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({ embeds: [embed], components: [row1, row2, row3] });

      const cfg2 = readConfig();
      if (!cfg2[interaction.guildId]) cfg2[interaction.guildId] = {};
      cfg2[interaction.guildId].panelChannelId = interaction.channel.id;
      writeConfig(cfg2);

      return interaction.editReply({ content: "✅ Panel berhasil dibuat!" });
    }

    /* /genkey */
    if (interaction.isChatInputCommand() && interaction.commandName === "genkey") {
      if (!hasPermission(interaction.member, interaction.guildId)) {
        return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const myScripts = await getScriptsByOwner(interaction.user.id);
      if (myScripts.length === 0) return interaction.editReply({ content: "❌ Kamu belum punya script di SpideyProtect." });

      const days = interaction.options.getInteger("days");
      const amount = Math.min(interaction.options.getInteger("amount") || 1, 20);

      if (myScripts.length === 1) return doGenKey(interaction, myScripts[0].id, days, amount);

      const options = myScripts.slice(0, 25).map(s =>
        new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id)
      );
      const select = new StringSelectMenuBuilder()
        .setCustomId(`genkey_select:${days}:${amount}`)
        .setPlaceholder("Pilih script...")
        .addOptions(options);

      return interaction.editReply({ content: "Pilih script:", components: [new ActionRowBuilder().addComponents(select)] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("genkey_select:")) {
      await interaction.deferUpdate();
      const [, days, amount] = interaction.customId.split(":");
      return doGenKey(interaction, interaction.values[0], parseInt(days), parseInt(amount));
    }

    /* /whitelist */
    if (interaction.isChatInputCommand() && interaction.commandName === "whitelist") {
      if (!hasPermission(interaction.member, interaction.guildId)) {
        return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser("user");
      const targetRole = interaction.options.getRole("role");
      const days = interaction.options.getInteger("days");

      if (!targetUser && !targetRole) {
        return interaction.editReply({ content: "❌ Pilih salah satu target: User atau Role!" });
      }

      const myScripts = await getScriptsByOwner(interaction.user.id);
      if (myScripts.length === 0) return interaction.editReply({ content: "❌ Kamu belum punya script." });

      const targetType = targetUser ? "user" : "role";
      const targetId = targetUser ? targetUser.id : targetRole.id;

      const options = myScripts.slice(0, 25).map(s =>
        new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id)
      );
      const select = new StringSelectMenuBuilder()
        .setCustomId(`whitelist_select:${targetType}:${targetId}:${days}:${interaction.user.id}`)
        .setPlaceholder("Pilih script...")
        .addOptions(options);

      return interaction.editReply({
        content: `Pilih script untuk di-whitelist ke ${targetUser ? `<@${targetUser.id}>` : `role <@&${targetRole.id}>`}:`,
        components: [new ActionRowBuilder().addComponents(select)]
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("whitelist_select:")) {
      await interaction.deferReply({ ephemeral: true });
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

      if (targetType === "user") {
        const key = generateKey();
        keys.push({
          key, hwid: null, userId: targetId, username: null, scriptId,
          redeemedAt: new Date().toISOString(), expiry, createdAt: new Date().toISOString(), createdBy: adminId
        });
        writeKeys(keys);

        // Auto berikan Buyer Role jika di-set
        if (buyerRoleId) {
          try {
            const member = await interaction.guild.members.fetch(targetId);
            await member.roles.add(buyerRoleId);
          } catch {}
        }

        const embed = new EmbedBuilder()
          .setTitle("✅ Whitelisted!")
          .addFields(
            { name: "User", value: `<@${targetId}>`, inline: true },
            { name: "Script", value: owned.name, inline: true },
            { name: "Buyer Role", value: buyerRoleId ? `<@&${buyerRoleId}>` : "Belum di-set", inline: true },
            { name: "Key", value: `\`${key}\``, inline: false }
          )
          .setColor(0x57F287);

        return interaction.editReply({ embeds: [embed] });

      } else {
        // Role Whitelist - Ambil seluruh member dari role
        const role = await interaction.guild.roles.fetch(targetId);
        await interaction.guild.members.fetch(); // Cache semua member
        const members = role.members.filter(m => !m.user.bot);

        let addedCount = 0;
        for (const [, member] of members) {
          const userKey = generateKey(); // Tiap user dapet key acak (random) berbeda
          keys.push({
            key: userKey, hwid: null, userId: member.id, username: member.user.username,
            scriptId, redeemedAt: new Date().toISOString(), expiry,
            createdAt: new Date().toISOString(), createdBy: adminId
          });
          addedCount++;

          if (buyerRoleId) {
            try { await member.roles.add(buyerRoleId); } catch {}
          }
        }
        writeKeys(keys);

        const embed = new EmbedBuilder()
          .setTitle("✅ Role Whitelisted!")
          .setDescription(`Berhasil membuat **${addedCount}** key acak unik untuk semua anggota role <@&${targetId}>!`)
          .addFields(
            { name: "Script", value: owned.name, inline: true },
            { name: "Buyer Role", value: buyerRoleId ? `<@&${buyerRoleId}>` : "Belum di-set", inline: true }
          )
          .setColor(0x57F287);

        return interaction.editReply({ embeds: [embed] });
      }
    }

    /* /blacklist */
    if (interaction.isChatInputCommand() && interaction.commandName === "blacklist") {
      if (!hasPermission(interaction.member, interaction.guildId)) {
        return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "Tidak ada alasan";

      const bl = readBlacklist();
      if (bl.some(b => b.userId === targetUser.id)) {
        return interaction.editReply({ content: "❌ User ini sudah ada di blacklist!" });
      }

      bl.push({
        userId: targetUser.id,
        username: targetUser.username,
        reason,
        blacklistedBy: interaction.user.id,
        blacklistedAt: new Date().toISOString()
      });
      writeBlacklist(bl);

      // Revoke semua key milik user
      const keys = readKeys();
      const newKeys = keys.filter(k => k.userId !== targetUser.id);
      writeKeys(newKeys);

      // Cabut buyer role
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

    /* /unblacklist */
    if (interaction.isChatInputCommand() && interaction.commandName === "unblacklist") {
      if (!hasPermission(interaction.member, interaction.guildId)) {
        return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser("user");
      const bl = readBlacklist();
      const index = bl.findIndex(b => b.userId === targetUser.id);

      if (index === -1) {
        return interaction.editReply({ content: "❌ User tidak ada di daftar blacklist." });
      }

      bl.splice(index, 1);
      writeBlacklist(bl);

      return interaction.editReply({
        content: `✅ **<@${targetUser.id}> telah di-Unblacklist!**\nUser bisa melakukan redeem key dan request role kembali.`
      });
    }

    /* /revoke */
    if (interaction.isChatInputCommand() && interaction.commandName === "revoke") {
      if (!hasPermission(interaction.member, interaction.guildId)) {
        return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
      }
      const keyInput = interaction.options.getString("key")?.toUpperCase().trim();
      const targetUser = interaction.options.getUser("user");

      if (!keyInput && !targetUser) {
        return interaction.reply({ content: "❌ Masukkan key atau user.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const keys = readKeys();
      let removed = 0;

      if (keyInput) {
        const idx = keys.findIndex(k => k.key === keyInput);
        if (idx !== -1) { keys.splice(idx, 1); removed++; }
      }

      if (targetUser) {
        const before = keys.length;
        const filtered = keys.filter(k => k.userId !== targetUser.id);
        removed += before - filtered.length;
        keys.length = 0; keys.push(...filtered);
      }

      writeKeys(keys);
      return interaction.editReply({ content: `✅ Berhasil merevoke ${removed} key/akses.` });
    }

    /* /listkeys */
    if (interaction.isChatInputCommand() && interaction.commandName === "listkeys") {
      if (!hasPermission(interaction.member, interaction.guildId)) {
        return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const keys = readKeys().filter(k => k.createdBy === interaction.user.id);
      if (keys.length === 0) return interaction.editReply({ content: "Belum ada key yang dibuat." });

      const lines = keys.map(k => `\`${k.key}\` • ${k.userId ? `<@${k.userId}>` : "Belum di-redeem"}`);
      return interaction.editReply({ content: lines.slice(0, 20).join("\n") });
    }

    /* /userinfo */
    if (interaction.isChatInputCommand() && interaction.commandName === "userinfo") {
      if (!hasPermission(interaction.member, interaction.guildId)) {
        return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const targetUser = interaction.options.getUser("user");
      const blacklisted = isBlacklisted(targetUser.id);

      const userKeys = readKeys().filter(k => k.userId === targetUser.id);

      const embed = new EmbedBuilder()
        .setTitle(`📊 Info ${targetUser.username}`)
        .addFields(
          { name: "Status Blacklist", value: blacklisted ? "🚫 **BLACKLISTED**" : "✅ Normal", inline: true },
          { name: "Total Key Aktif", value: `${userKeys.length}`, inline: true }
        )
        .setColor(blacklisted ? 0xED4245 : 0x5865F2);

      return interaction.editReply({ embeds: [embed] });
    }

    /* BUTTON: redeem_key */
    if (interaction.isButton() && interaction.customId === "redeem_key") {
      const modal = new ModalBuilder().setCustomId("modal_redeem").setTitle("Redeem Key");
      const keyInput = new TextInputBuilder()
        .setCustomId("input_key").setLabel("Key").setPlaceholder("XXXXXX-XXXXXX-XXXXXX-XXXXXX").setStyle(TextInputStyle.Short);
      modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "modal_redeem") {
      await interaction.deferReply({ ephemeral: true });
      const keyInput = interaction.fields.getTextInputValue("input_key").toUpperCase().trim();
      const keys = readKeys();
      const keyData = keys.find(k => k.key === keyInput);

      if (!keyData) return interaction.editReply({ content: "❌ Key tidak valid." });
      if (keyData.userId && keyData.userId !== interaction.user.id) {
        return interaction.editReply({ content: "❌ Key sudah dipakai user lain." });
      }

      keyData.userId = interaction.user.id;
      keyData.username = interaction.user.username;
      keyData.redeemedAt = new Date().toISOString();
      writeKeys(keys);

      // Auto berikan Buyer Role jika terkonfigurasi
      const cfg = readConfig()[interaction.guildId] || {};
      if (cfg.buyerRole) {
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(cfg.buyerRole);
        } catch {}
      }

      return interaction.editReply({ content: "✅ Key berhasil di-redeem! Anda telah diberi akses & buyer role." });
    }

    /* BUTTON: get_script */
    if (interaction.isButton() && interaction.customId.startsWith("get_script")) {
      await interaction.deferReply({ ephemeral: true });
      const keyData = readKeys().find(k => k.userId === interaction.user.id);
      if (!keyData) return interaction.editReply({ content: "❌ Kamu belum punya key aktif!" });

      const loaderCode = `script_key="${keyData.key}";\nloadstring(game:HttpGet("${CONFIG.apiBase}/api/loader/${keyData.scriptId}.lua"))()`;
      return interaction.editReply({ content: `📜 Loader kamu:\n\`\`\`lua\n${loaderCode}\n\`\`\`` });
    }

    /* BUTTON: get_role */
    if (interaction.isButton() && interaction.customId === "get_role") {
      await interaction.deferReply({ ephemeral: true });
      const cfg = readConfig()[interaction.guildId] || {};
      if (!cfg.buyerRole) return interaction.editReply({ content: "❌ Buyer role belum di-set admin." });

      const keyData = readKeys().find(k => k.userId === interaction.user.id);
      if (!keyData) return interaction.editReply({ content: "❌ Kamu harus redeem key dulu untuk dapet role!" });

      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(cfg.buyerRole);
        return interaction.editReply({ content: "✅ Buyer role berhasil diberikan!" });
      } catch {
        return interaction.editReply({ content: "❌ Gagal memberi role. Cek permission bot." });
      }
    }

    /* BUTTON: get_stats */
    if (interaction.isButton() && interaction.customId === "get_stats") {
      await interaction.deferReply({ ephemeral: true });
      const blacklisted = isBlacklisted(interaction.user.id);
      const userKeys = readKeys().filter(k => k.userId === interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle("📊 Status Kamu")
        .addFields(
          { name: "Status Account", value: blacklisted ? "🚫 Blacklisted" : "✅ Normal", inline: true },
          { name: "Total Keys", value: `${userKeys.length}`, inline: true }
        )
        .setColor(blacklisted ? 0xED4245 : 0x5865F2);

      return interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
  }
});

async function doGenKey(interaction, scriptId, days, amount) {
  const keys = readKeys();
  const generated = [];
  for (let i = 0; i < amount; i++) {
    const key = generateKey();
    const expiry = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();
    keys.push({ key, hwid: null, userId: null, scriptId, expiry, createdAt: new Date().toISOString(), createdBy: interaction.user.id });
    generated.push(key);
  }
  writeKeys(keys);
  return interaction.editReply({ content: `🔑 **Generated Keys:**\n${generated.map(k => `\`${k}\``).join("\n")}` });
}

client.login(CONFIG.token);
