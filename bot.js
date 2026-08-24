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

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(KEYS_FILE)) {
  fs.writeFileSync(KEYS_FILE, "[]", "utf8");
}

if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, "{}", "utf8");
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

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

function readBlacklist() {
  try {
    const cfg = readConfig();
    return cfg.blacklist || {};
  } catch {
    return {};
  }
}

function writeBlacklist(blacklistData) {
  const cfg = readConfig();
  cfg.blacklist = blacklistData;
  writeConfig(cfg);
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

function generateHwid(userId) {
  return crypto
    .createHash("sha256")
    .update(userId + "-" + Date.now())
    .digest("hex")
    .toUpperCase()
    .slice(0, 32);
}

/*
==================================================
 CEK PERMISSION (whitelistrole atau Administrator)
==================================================
*/

function hasPermission(member, guildId) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const cfg = readConfig();
  const roleId = cfg[guildId]?.whitelistRole;
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

/*
==================================================
 AMBIL SCRIPT MILIK USER TERTENTU DARI SERVER
==================================================
*/

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
 CEK BLACKLIST
==================================================
*/

function isBlacklisted(guildId, userId) {
  const blacklist = readBlacklist();
  return blacklist[guildId] && blacklist[guildId][userId] ? true : false;
}

/*
==================================================
 CLIENT
==================================================
*/

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/*
==================================================
 SLASH COMMANDS
==================================================
*/

const commands = [
  new SlashCommandBuilder()
    .setName("setuppanel")
    .setDescription("Setup panel embed di channel ini (hanya script milikmu)")
    .addStringOption(opt =>
      opt.setName("title").setDescription("Judul embed").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("description").setDescription("Deskripsi embed").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("whitelistrole")
    .setDescription("Set role yang bisa menggunakan command admin bot")
    .addRoleOption(opt =>
      opt.setName("role").setDescription("Role yang diberi akses admin").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setbuyerrole")
    .setDescription("Set role yang diberikan saat user redeem key atau whitelist")
    .addRoleOption(opt =>
      opt.setName("role").setDescription("Role buyer yang akan diberikan").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate key untuk script milikmu")
    .addIntegerOption(opt =>
      opt.setName("days").setDescription("Durasi key dalam hari (0 = lifetime)").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Jumlah key (max 20, default 1)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Whitelist user atau role ke script milikmu")
    .addUserOption(opt =>
      opt.setName("user").setDescription("User yang mau di-whitelist").setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName("role").setDescription("Role yang mau di-whitelist (semua member dapat key random)").setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName("days").setDescription("Durasi akses dalam hari (0 = lifetime)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Hapus/revoke key atau akses user")
    .addStringOption(opt =>
      opt.setName("key").setDescription("Key yang mau direvoke").setRequired(false)
    )
    .addUserOption(opt =>
      opt.setName("user").setDescription("User yang mau direvoke").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("listkeys")
    .setDescription("Lihat semua key yang pernah kamu buat"),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Lihat info key/akses user")
    .addUserOption(opt =>
      opt.setName("user").setDescription("User yang mau dicek").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("deletescript")
    .setDescription("Hapus script milikmu dari SpideyProtect"),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Blacklist user dari semua script milikmu")
    .addUserOption(opt =>
      opt.setName("user").setDescription("User yang mau di-blacklist").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unblacklist")
    .setDescription("Hapus user dari blacklist")
    .addUserOption(opt =>
      opt.setName("user").setDescription("User yang mau di-unblacklist").setRequired(true)
    )
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(CONFIG.token);
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands(CONFIG.clientId),
      { body: commands }
    );
    console.log("Slash commands registered!");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

/*
==================================================
 READY
==================================================
*/

client.once("ready", async () => {
  console.log(`Bot ready: ${client.user.tag}`);
  await registerCommands();
});

/*
==================================================
 INTERACTIONS
==================================================
*/

client.on("interactionCreate", async interaction => {
  try {

  /*
  ------------------------------------------------
   /whitelistrole
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "whitelistrole") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ Hanya Administrator yang bisa set whitelistrole.", ephemeral: true });
    }

    const role = interaction.options.getRole("role");
    const cfg = readConfig();
    if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
    cfg[interaction.guildId].whitelistRole = role.id;
    writeConfig(cfg);

    return interaction.reply({
      content: `✅ Role <@&${role.id}> sekarang bisa menggunakan semua command admin bot.`,
      ephemeral: true
    });
  }

  /*
  ------------------------------------------------
   /setbuyerrole
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "setbuyerrole") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ Hanya Administrator yang bisa set buyer role.", ephemeral: true });
    }

    const role = interaction.options.getRole("role");
    const cfg = readConfig();
    if (!cfg[interaction.guildId]) cfg[interaction.guildId] = {};
    cfg[interaction.guildId].buyerRole = role.id;
    writeConfig(cfg);

    return interaction.reply({
      content: `✅ Role <@&${role.id}> sekarang menjadi buyer role!`,
      ephemeral: true
    });
  }

  /*
  ------------------------------------------------
   /blacklist
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "blacklist") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser("user");
    
    const myScripts = await getScriptsByOwner(interaction.user.id);
    const myScriptIds = new Set(myScripts.map(s => s.id));

    const keys = readKeys();
    let removed = 0;
    
    const filtered = keys.filter(k => {
      if (k.userId !== targetUser.id) return true;
      if (myScriptIds.has(k.scriptId) || k.createdBy === interaction.user.id) {
        removed++;
        return false;
      }
      return true;
    });

    keys.length = 0;
    keys.push(...filtered);
    writeKeys(keys);

    const blacklist = readBlacklist();
    if (!blacklist[interaction.guildId]) blacklist[interaction.guildId] = {};
    blacklist[interaction.guildId][targetUser.id] = {
      blacklistedAt: new Date().toISOString(),
      blacklistedBy: interaction.user.id,
      reason: "Blacklisted by owner"
    };
    writeBlacklist(blacklist);

    try {
      const cfg = readConfig();
      const buyerRoleId = cfg[interaction.guildId]?.buyerRole;
      if (buyerRoleId) {
        const member = await interaction.guild.members.fetch(targetUser.id);
        if (member.roles.cache.has(buyerRoleId)) {
          await member.roles.remove(buyerRoleId);
        }
      }
    } catch {}

    return interaction.editReply({
      content: `✅ <@${targetUser.id}> berhasil di-blacklist! (${removed} key dihapus)`
    });
  }

  /*
  ------------------------------------------------
   /unblacklist
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "unblacklist") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser("user");
    const blacklist = readBlacklist();

    if (blacklist[interaction.guildId] && blacklist[interaction.guildId][targetUser.id]) {
      delete blacklist[interaction.guildId][targetUser.id];
      if (Object.keys(blacklist[interaction.guildId]).length === 0) {
        delete blacklist[interaction.guildId];
      }
      writeBlacklist(blacklist);
      return interaction.editReply({
        content: `✅ <@${targetUser.id}> berhasil di-unblacklist!`
      });
    }

    return interaction.editReply({
      content: `❌ <@${targetUser.id}> tidak ada di blacklist.`
    });
  }

  /*
  ------------------------------------------------
   /setuppanel
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "setuppanel") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const myScripts = await getScriptsByOwner(interaction.user.id);

    if (myScripts.length === 0) {
      return interaction.editReply({
        content: "❌ Kamu belum punya script di SpideyProtect. Login ke dashboard dulu dan upload script dengan akun Discord kamu."
      });
    }

    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x5865F2)
      .setFooter({
        text: `Panel by ${interaction.user.username} • ${new Date().toLocaleString("en-US")}`
      });

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

    try {
      await interaction.channel.send({
        embeds: [embed],
        components: [row1, row2, row3]
      });
    } catch (sendErr) {
      console.error("Gagal kirim panel:", sendErr);
      return interaction.editReply({
        content: "❌ Gagal mengirim panel ke channel ini. Pastikan bot punya permission **Send Messages** dan **Embed Links** di channel ini."
      });
    }

    const cfg2 = readConfig();
    if (!cfg2[interaction.guildId]) cfg2[interaction.guildId] = {};
    cfg2[interaction.guildId].panelChannelId = interaction.channel.id;
    writeConfig(cfg2);

    return interaction.editReply({ content: "✅ Panel berhasil dibuat!" });
  }

  /*
  ------------------------------------------------
   /genkey
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "genkey") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const myScripts = await getScriptsByOwner(interaction.user.id);

    if (myScripts.length === 0) {
      return interaction.editReply({
        content: "❌ Kamu belum punya script di SpideyProtect. Login ke dashboard dengan akun Discord kamu dulu dan upload script."
      });
    }

    const days = interaction.options.getInteger("days");
    const amount = Math.min(interaction.options.getInteger("amount") || 1, 20);

    if (myScripts.length === 1) {
      return doGenKey(interaction, myScripts[0].id, days, amount);
    }

    const options = myScripts.slice(0, 25).map(s =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.name)
        .setValue(s.id)
        .setDescription(`Status: ${s.enabled ? "Enabled" : "Disabled"}`)
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId(`genkey_select:${days}:${amount}`)
      .setPlaceholder("Pilih script...")
      .addOptions(options);

    return interaction.editReply({
      content: "Pilih script yang mau digenerate keynya:",
      components: [new ActionRowBuilder().addComponents(select)]
    });
  }

  /*
  ------------------------------------------------
   SELECT MENU: genkey_select
  ------------------------------------------------
  */

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("genkey_select:")) {
    await interaction.deferUpdate();

    const parts = interaction.customId.split(":");
    const days = parseInt(parts[1]);
    const amount = parseInt(parts[2]);
    const scriptId = interaction.values[0];

    const myScripts = await getScriptsByOwner(interaction.user.id);
    const owned = myScripts.find(s => s.id === scriptId);

    if (!owned) {
      return interaction.editReply({ content: "❌ Script itu bukan milikmu.", components: [] });
    }

    return doGenKey(interaction, scriptId, days, amount);
  }

  /*
  ------------------------------------------------
   /whitelist
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "whitelist") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser("user");
    const targetRole = interaction.options.getRole("role");
    const days = interaction.options.getInteger("days");

    if (!targetUser && !targetRole) {
      return interaction.reply({ 
        content: "❌ Masukkan user atau role yang mau di-whitelist.", 
        ephemeral: true 
      });
    }

    const myScripts = await getScriptsByOwner(interaction.user.id);
    if (myScripts.length === 0) {
      return interaction.editReply({
        content: "❌ Kamu belum punya script di SpideyProtect."
      });
    }

    if (targetRole) {
      try {
        const members = await interaction.guild.members.fetch();
        const roleMembers = members.filter(m => m.roles.cache.has(targetRole.id));
        
        if (roleMembers.size === 0) {
          return interaction.editReply({
            content: `❌ Tidak ada member dengan role <@&${targetRole.id}>.`
          });
        }

        const options = myScripts.slice(0, 25).map(s =>
          new StringSelectMenuOptionBuilder()
            .setLabel(s.name)
            .setValue(s.id)
            .setDescription(`Status: ${s.enabled ? "Enabled" : "Disabled"}`)
        );

        const select = new StringSelectMenuBuilder()
          .setCustomId(`whitelist_role_script:${targetRole.id}:${days}:${interaction.user.id}`)
          .setPlaceholder("Pilih script...")
          .addOptions(options);

        return interaction.editReply({
          content: `Pilih script untuk di-whitelist ke **${roleMembers.size}** member dengan role <@&${targetRole.id}>:`,
          components: [new ActionRowBuilder().addComponents(select)]
        });

      } catch (err) {
        return interaction.editReply({ content: "❌ Gagal mengambil member role." });
      }
    }

    const options = myScripts.slice(0, 25).map(s =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.name)
        .setValue(s.id)
        .setDescription(`Status: ${s.enabled ? "Enabled" : "Disabled"}`)
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId(`whitelist_user_script:${targetUser.id}:${days}:${interaction.user.id}`)
      .setPlaceholder("Pilih script...")
      .addOptions(options);

    return interaction.editReply({
      content: `Pilih script milikmu untuk di-whitelist ke <@${targetUser.id}>:`,
      components: [new ActionRowBuilder().addComponents(select)]
    });
  }

  /*
  ------------------------------------------------
   SELECT MENU: whitelist_role_script
  ------------------------------------------------
  */

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("whitelist_role_script:")) {
    await interaction.deferReply({ ephemeral: true });

    const parts = interaction.customId.split(":");
    const roleId = parts[1];
    const days = parseInt(parts[2]);
    const adminId = parts[3];
    const scriptId = interaction.values[0];

    const myScripts = await getScriptsByOwner(adminId);
    const owned = myScripts.find(s => s.id === scriptId);
    if (!owned) {
      return interaction.editReply({
        content: "❌ Script itu bukan milikmu.",
        components: []
      });
    }

    try {
      const members = await interaction.guild.members.fetch();
      const roleMembers = members.filter(m => m.roles.cache.has(roleId));
      const keys = readKeys();
      let generated = 0;

      for (const [memberId, member] of roleMembers) {
        if (isBlacklisted(interaction.guildId, memberId)) continue;

        const existingKey = keys.find(k => 
          k.userId === memberId && 
          k.scriptId === scriptId &&
          (!k.expiry || new Date(k.expiry) > new Date())
        );

        if (existingKey) continue;

        const key = generateKey();
        const expiry = days === 0
          ? null
          : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

        keys.push({
          key,
          hwid: null,
          userId: memberId,
          username: member.user.username,
          scriptId,
          redeemedAt: new Date().toISOString(),
          lastHwidReset: null,
          expiry,
          createdAt: new Date().toISOString(),
          createdBy: adminId,
          isWhitelisted: true
        });
        generated++;
      }

      writeKeys(keys);

      const duration = days === 0 ? "Lifetime" : `${days} hari`;
      return interaction.editReply({
        content: `✅ Berhasil whitelist **${generated}** member dengan role <@&${roleId}> ke script **${owned.name}** (${duration})`,
        components: []
      });

    } catch (err) {
      return interaction.editReply({ 
        content: "❌ Gagal memproses whitelist role.", 
        components: [] 
      });
    }
  }

  /*
  ------------------------------------------------
   SELECT MENU: whitelist_user_script
  ------------------------------------------------
  */

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("whitelist_user_script:")) {
    await interaction.deferReply({ ephemeral: true });

    const parts = interaction.customId.split(":");
    const targetUserId = parts[1];
    const days = parseInt(parts[2]);
    const adminId = parts[3];
    const scriptId = interaction.values[0];

    if (isBlacklisted(interaction.guildId, targetUserId)) {
      return interaction.editReply({
        content: "❌ User ini sedang di-blacklist. Unblacklist dulu sebelum whitelist.",
        components: []
      });
    }

    const myScripts = await getScriptsByOwner(adminId);
    const owned = myScripts.find(s => s.id === scriptId);

    if (!owned) {
      return interaction.editReply({
        content: "❌ Script itu bukan milikmu.",
        components: []
      });
    }

    const keys = readKeys();
    const key = generateKey();
    const expiry = days === 0
      ? null
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    keys.push({
      key,
      hwid: null,
      userId: targetUserId,
      username: null,
      scriptId,
      redeemedAt: new Date().toISOString(),
      lastHwidReset: null,
      expiry,
      createdAt: new Date().toISOString(),
      createdBy: adminId,
      isWhitelisted: true
    });

    writeKeys(keys);

    const duration = days === 0 ? "Lifetime" : `${days} hari`;

    const embed = new EmbedBuilder()
      .setTitle("✅ User Berhasil Di-whitelist!")
      .addFields(
        { name: "User", value: `<@${targetUserId}>`, inline: true },
        { name: "Script", value: owned.name, inline: true },
        { name: "Durasi", value: duration, inline: true },
        { name: "Key", value: `\`${key}\``, inline: false }
      )
      .setColor(0x57F287)
      .setTimestamp();

    try {
      const guildCfg = readConfig()[interaction.guildId] || {};
      const panelChannelId = guildCfg.panelChannelId;
      if (panelChannelId) {
        const panelChannel = await interaction.guild.channels.fetch(panelChannelId).catch(() => null);
        if (panelChannel) {
          await panelChannel.send(
            `<@${targetUserId}> You have been whitelisted!\nYou can access the script via this message --> <#${panelChannelId}>`
          );
        }
      }
    } catch {}

    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("✅ Kamu Sudah Di-whitelist!")
        .setDescription("Gunakan key berikut untuk akses script:")
        .addFields(
          { name: "Key", value: `\`${key}\``, inline: false },
          { name: "Durasi", value: duration, inline: true }
        )
        .setColor(0x57F287)
        .setTimestamp();

      const targetUser = await client.users.fetch(targetUserId);
      await targetUser.send({ embeds: [dmEmbed] });
    } catch {}

    return interaction.editReply({ embeds: [embed] });
  }

  /*
  ------------------------------------------------
   /revoke
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "revoke") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    const keyInput = interaction.options.getString("key")?.toUpperCase().trim();
    const targetUser = interaction.options.getUser("user");

    if (!keyInput && !targetUser) {
      return interaction.reply({ content: "❌ Masukkan key atau user yang mau direvoke.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const myScripts = await getScriptsByOwner(interaction.user.id);
    const myScriptIds = new Set(myScripts.map(s => s.id));

    const keys = readKeys();
    let removed = 0;

    if (keyInput) {
      const index = keys.findIndex(k => k.key === keyInput);
      if (index !== -1) {
        const keyData = keys[index];
        if (keyData.createdBy === interaction.user.id || myScriptIds.has(keyData.scriptId)) {
          keys.splice(index, 1);
          removed++;
        } else {
          return interaction.editReply({ content: "❌ Kamu tidak bisa merevoke key yang bukan milikmu." });
        }
      }
    }

    if (targetUser) {
      const before = keys.length;
      const filtered = keys.filter(k => {
        if (k.userId !== targetUser.id) return true;
        const isMyKey = k.createdBy === interaction.user.id || myScriptIds.has(k.scriptId);
        return !isMyKey;
      });
      removed += before - filtered.length;
      keys.length = 0;
      keys.push(...filtered);
    }

    writeKeys(keys);

    if (removed === 0) {
      return interaction.editReply({ content: "❌ Key atau user tidak ditemukan, atau bukan milikmu." });
    }

    return interaction.editReply({
      content: `✅ Berhasil merevoke ${removed} key/akses.`
    });
  }

  /*
  ------------------------------------------------
   /listkeys
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "listkeys") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const allKeys = readKeys();
    const keys = allKeys.filter(k => k.createdBy === interaction.user.id);

    if (keys.length === 0) {
      return interaction.editReply({ content: "Belum ada key yang kamu buat." });
    }

    const lines = keys.map(k => {
      const status = k.userId ? `✅ ${k.username || k.userId}` : "⏳ Belum diredeeem";
      const expiry = k.expiry
        ? new Date(k.expiry).toLocaleDateString("id-ID")
        : "Lifetime";
      return `\`${k.key}\` • ${status} • ${expiry}`;
    });

    const chunks = [];
    let current = "";

    for (const line of lines) {
      if ((current + "\n" + line).length > 1900) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }

    if (current) chunks.push(current);

    await interaction.editReply({ content: chunks[0] });
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true });
    }

    return;
  }

  /*
  ------------------------------------------------
   /userinfo
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "userinfo") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser("user");
    const allKeys = readKeys();

    const myScripts = await getScriptsByOwner(interaction.user.id);
    const myScriptIds = new Set(myScripts.map(s => s.id));

    const userKeys = allKeys.filter(k =>
      k.userId === targetUser.id &&
      (k.createdBy === interaction.user.id || myScriptIds.has(k.scriptId))
    );

    if (userKeys.length === 0) {
      return interaction.editReply({
        content: `❌ <@${targetUser.id}> tidak punya key/akses dari script milikmu.`
      });
    }

    const fields = userKeys.map(k => {
      const expiry = k.expiry
        ? `<t:${Math.floor(new Date(k.expiry).getTime() / 1000)}:R>`
        : "Lifetime";
      const isExpired = k.expiry && new Date(k.expiry) < new Date();
      const status = isExpired ? "❌ Expired" : "✅ Aktif";
      const isBlacklisted = isBlacklisted(interaction.guildId, targetUser.id);

      return {
        name: `\`${k.key}\``,
        value: `Status: ${isBlacklisted ? "🚫 BLACKLISTED" : status}\nExpiry: ${expiry}\nHWID: \`${k.hwid || "Belum di-set"}\``,
        inline: false
      };
    });

    const embed = new EmbedBuilder()
      .setTitle(`📊 Info ${targetUser.username}`)
      .addFields(fields)
      .setColor(0x5865F2)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  /*
  ------------------------------------------------
   /deletescript
  ------------------------------------------------
  */

  if (interaction.isChatInputCommand() && interaction.commandName === "deletescript") {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const myScripts = await getScriptsByOwner(interaction.user.id);

    if (myScripts.length === 0) {
      return interaction.editReply({ content: "❌ Kamu belum punya script di SpideyProtect." });
    }

    const options = myScripts.slice(0, 25).map(s =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.name)
        .setValue(s.id)
        .setDescription(`Status: ${s.enabled ? "Enabled" : "Disabled"}`)
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId(`deletescript_select:${interaction.user.id}`)
      .setPlaceholder("Pilih script yang mau dihapus...")
      .addOptions(options);

    return interaction.editReply({
      content: "⚠️ Pilih script milikmu yang mau dihapus. **Tindakan ini tidak bisa dibatalkan!**",
      components: [new ActionRowBuilder().addComponents(select)]
    });
  }

  /*
  ------------------------------------------------
   SELECT MENU: deletescript_select
  ------------------------------------------------
  */

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("deletescript_select:")) {
    await interaction.deferReply({ ephemeral: true });

    const ownerId = interaction.customId.split(":")[1];
    const scriptId = interaction.values[0];

    if (ownerId !== interaction.user.id) {
      return interaction.editReply({ content: "❌ Kamu tidak bisa menghapus script orang lain.", components: [] });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirmdelete:${scriptId}:${ownerId}`)
        .setLabel("Ya, Hapus Script Ini")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("canceldelete")
        .setLabel("Batal")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.editReply({
      content: "⚠️ Yakin mau hapus script ini? Data tidak bisa dikembalikan!",
      components: [confirmRow]
    });
  }

  /*
  ------------------------------------------------
   BUTTON: confirmdelete
  ------------------------------------------------
  */

  if (interaction.isButton() && interaction.customId.startsWith("confirmdelete:")) {
    if (!hasPermission(interaction.member, interaction.guildId)) {
      return interaction.reply({ content: "❌ Kamu tidak punya permission.", ephemeral: true });
    }

    await interaction.deferUpdate();

    const parts = interaction.customId.split(":");
    const scriptId = parts[1];
    const ownerId = parts[2];

    if (interaction.user.id !== ownerId) {
      return interaction.editReply({
        content: "❌ Kamu tidak bisa menghapus script orang lain.",
        components: []
      });
    }

    try {
      const res = await axios.delete(
        `${CONFIG.apiBase}/api/scripts/internal/${scriptId}`,
        {
          headers: {
            "x-api-secret": CONFIG.apiSecret,
            "x-owner-id": ownerId
          },
          timeout: 8000
        }
      );

      const scriptName = res.data.name || scriptId;

      const embed = new EmbedBuilder()
        .setTitle("🗑️ Script Dihapus")
        .setDescription(`Script **${scriptName}** berhasil dihapus dari SpideyProtect.`)
        .setColor(0xED4245)
        .setTimestamp()
        .setFooter({ text: `Dihapus oleh ${interaction.user.username}` });

      return interaction.editReply({ embeds: [embed], components: [] });

    } catch (err) {
      const status = err?.response?.status;
      const msg =
        status === 403 ? "❌ Script itu bukan milikmu." :
        status === 404 ? "❌ Script tidak ditemukan." :
        "❌ Gagal menghapus script. Coba lagi nanti.";

      return interaction.editReply({ content: msg, components: [] });
    }
  }

  /*
  ------------------------------------------------
   BUTTON: canceldelete
  ------------------------------------------------
  */

  if (interaction.isButton() && interaction.customId === "canceldelete") {
    return interaction.update({ content: "✅ Penghapusan dibatalkan.", components: [] });
  }

  /*
  ------------------------------------------------
   BUTTON: redeem_key
  ------------------------------------------------
  */

  if (interaction.isButton() && interaction.customId === "redeem_key") {
    // Cek blacklist
    if (isBlacklisted(interaction.guildId, interaction.user.id)) {
      return interaction.reply({
        content: "❌ **You Have Been Blacklisted By The Owner**\nKamu tidak bisa redeem key.",
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("modal_redeem")
      .setTitle("Redeem Key");

    const keyInput = new TextInputBuilder()
      .setCustomId("input_key")
      .setLabel("Masukkan Key kamu")
      .setPlaceholder("XXXXXX-XXXXXX-XXXXXX-XXXXXX")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(keyInput));

    return interaction.showModal(modal);
  }

  /*
  ------------------------------------------------
   MODAL: modal_redeem
  ------------------------------------------------
  */

  if (interaction.isModalSubmit() && interaction.customId === "modal_redeem") {
    await interaction.deferReply({ ephemeral: true });

    if (isBlacklisted(interaction.guildId, interaction.user.id)) {
      return interaction.editReply({
        content: "❌ **You Have Been Blacklisted By The Owner**\nKamu tidak bisa redeem key."
      });
    }

    const keyInput = interaction.fields
      .getTextInputValue("input_key")
      .toUpperCase()
      .trim();

    const keys = readKeys();
    const keyData = keys.find(k => k.key === keyInput);

    if (!keyData) {
      return interaction.editReply({ content: "❌ Key tidak valid." });
    }

    if (keyData.expiry && new Date(keyData.expiry) < new Date()) {
      return interaction.editReply({ content: "❌ Key sudah expired." });
    }

    if (keyData.userId && keyData.userId !== interaction.user.id) {
      return interaction.editReply({ content: "❌ Key ini sudah digunakan oleh user lain." });
    }

    keyData.userId = interaction.user.id;
    keyData.username = interaction.user.username;
    keyData.redeemedAt = new Date().toISOString();
    writeKeys(keys);

    const expiry = keyData.expiry
      ? `<t:${Math.floor(new Date(keyData.expiry).getTime() / 1000)}:R>`
      : "Lifetime";

    const embed = new EmbedBuilder()
      .setTitle("✅ Key Berhasil Diredeeem!")
      .addFields(
        { name: "Key", value: `\`${keyInput}\``, inline: true },
        { name: "Expiry", value: expiry, inline: true },
        { name: "HWID", value: `\`Akan di-bind otomatis saat pertama kali run loader\``, inline: false }
      )
      .setColor(0x57F287)
      .setTimestamp();

    // Berikan buyer role jika ada
    try {
      const cfg = readConfig();
      const buyerRoleId = cfg[interaction.guildId]?.buyerRole;
      if (buyerRoleId) {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.roles.cache.has(buyerRoleId)) {
          await member.roles.add(buyerRoleId);
        }
      }
    } catch {}

    return interaction.editReply({ embeds: [embed] });
  }

  /*
  ------------------------------------------------
   BUTTON: get_script
  ------------------------------------------------
  */

  if (interaction.isButton() && interaction.customId.startsWith("get_script")) {
    await interaction.deferReply({ ephemeral: true });

    if (isBlacklisted(interaction.guildId, interaction.user.id)) {
      return interaction.editReply({
        content: "❌ **You Have Been Blacklisted By The Owner**\nKamu tidak bisa mengakses script ini."
      });
    }

    const panelOwnerId = interaction.customId.split(":")[1] || null;

    const keys = readKeys();
    const userId = interaction.user.id;

    const keyData = keys.find(k => {
      if (k.userId !== userId) return false;
      if (k.expiry && new Date(k.expiry) < new Date()) return false;
      if (panelOwnerId && k.createdBy && k.createdBy !== panelOwnerId) return false;
      return true;
    });

    if (!keyData) {
      return interaction.editReply({
        content: "❌ Kamu belum punya key aktif untuk panel ini. Redeem key dulu!"
      });
    }

    const loaderCode = `script_key="${keyData.key}";\nloadstring(game:HttpGet("${CONFIG.apiBase}/api/loader/${keyData.scriptId || "SCRIPT_ID"}.lua"))()`;

    const embed = new EmbedBuilder()
      .setTitle("📜 Script Loader")
      .setDescription(
        `Ini loader script kamu. **Jangan share ke orang lain!**\n\n\`\`\`lua\n${loaderCode}\n\`\`\``
      )
      .setColor(0x5865F2)
      .setTimestamp();

    try {
      await interaction.user.send({ embeds: [embed] });
      return interaction.editReply({ content: "✅ Script sudah dikirim ke DM kamu!" });
    } catch {
      return interaction.editReply({ content: "❌ Gagal kirim DM. Pastikan DM kamu terbuka." });
    }
  }

  /*
  ------------------------------------------------
   BUTTON: get_role
  ------------------------------------------------
  */

  if (interaction.isButton() && interaction.customId === "get_role") {
    await interaction.deferReply({ ephemeral: true });

    if (isBlacklisted(interaction.guildId, interaction.user.id)) {
      return interaction.editReply({
        content: "❌ **You Have Been Blacklisted By The Owner**\nKamu tidak bisa mendapatkan role."
      });
    }

    const keys = readKeys();
    const userId = interaction.user.id;

    const keyData = keys.find(k => {
      if (k.userId !== userId) return false;
      if (k.expiry && new Date(k.expiry) < new Date()) return false;
      return true;
    });

    if (!keyData) {
      return interaction.editReply({ content: "❌ Kamu belum punya key aktif. Redeem key dulu!" });
    }

    const cfg = readConfig();
    const roleId = cfg[interaction.guildId]?.buyerRole;

    if (!roleId) {
      return interaction.editReply({ content: "❌ Buyer role belum dikonfigurasi admin." });
    }

    try {
      const member = await interaction.guild.members.fetch(userId);
      if (member.roles.cache.has(roleId)) {
        return interaction.editReply({ content: "✅ Kamu sudah memiliki role buyer!" });
      }
      await member.roles.add(roleId);
      return interaction.editReply({ content: "✅ Role berhasil diberikan!" });
    } catch {
      return interaction.editReply({ content: "❌ Gagal memberikan role. Pastikan bot punya permission Manage Roles." });
    }
  }

  /*
  ------------------------------------------------
   BUTTON: reset_hwid
  ------------------------------------------------
  */

  if (interaction.isButton() && interaction.customId === "reset_hwid") {
    await interaction.deferReply({ ephemeral: true });

    if (isBlacklisted(interaction.guildId, interaction.user.id)) {
      return interaction.editReply({
        content: "❌ **You Have Been Blacklisted By The Owner**\nKamu tidak bisa mereset HWID."
      });
    }

    const keys = readKeys();
    const userId = interaction.user.id;
    const keyData = keys.find(k => k.userId === userId);

    if (!keyData) {
      return interaction.editReply({ content: "❌ Kamu belum punya key yang terdaftar." });
    }

    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (keyData.lastHwidReset && now - new Date(keyData.lastHwidReset).getTime() < cooldown) {
      const nextReset = new Date(new Date(keyData.lastHwidReset).getTime() + cooldown);
      return interaction.editReply({
        content: `❌ HWID reset cooldown belum selesai. Bisa reset lagi <t:${Math.floor(nextReset.getTime() / 1000)}:R>.`
      });
    }

    keyData.hwid = null;
    keyData.lastHwidReset = new Date().toISOString();
    writeKeys(keys);

    return interaction.editReply({
      content: `✅ HWID berhasil direset!\nHWID baru akan di-bind otomatis saat kamu run loader dari Roblox berikutnya.`
    });
  }

  /*
  ------------------------------------------------
   BUTTON: get_stats
  ------------------------------------------------
  */

  if (interaction.isButton() && interaction.customId === "get_stats") {
    await interaction.deferReply({ ephemeral: true });

    if (isBlacklisted(interaction.guildId, interaction.user.id)) {
      return interaction.editReply({
        content: "❌ **You Have Been Blacklisted By The Owner**\nKamu tidak bisa melihat stats."
      });
    }

    const keys = readKeys();
    const userId = interaction.user.id;
    const userKeys = keys.filter(k => k.userId === userId);

    if (userKeys.length === 0) {
      return interaction.editReply({ content: "❌ Kamu belum punya key yang terdaftar." });
    }

    const fields = userKeys.map(k => {
      const expiry = k.expiry
        ? `<t:${Math.floor(new Date(k.expiry).getTime() / 1000)}:R>`
        : "Lifetime";
      const isExpired = k.expiry && new Date(k.expiry) < new Date();
      const status = isExpired ? "❌ Expired" : "✅ Aktif";
      const nextReset = k.lastHwidReset
        ? `<t:${Math.floor((new Date(k.lastHwidReset).getTime() + 86400000) / 1000)}:R>`
        : "Bisa reset sekarang";

      return {
        name: `\`${k.key}\``,
        value: `Status: ${status}\nExpiry: ${expiry}\nHWID: \`${k.hwid || "Belum di-set"}\`\nReset HWID: ${nextReset}`,
        inline: false
      };
    });

    const embed = new EmbedBuilder()
      .setTitle("📊 Stats Kamu")
      .addFields(fields)
      .setColor(0x5865F2)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  } catch (err) {
    console.error("Interaction error:", err);
    const msg = "❌ Terjadi error internal. Coba lagi nanti.";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: msg });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch {}
  }

});

/*
==================================================
 HELPER: Generate keys untuk script tertentu
==================================================
*/

async function doGenKey(interaction, scriptId, days, amount) {
  const keys = readKeys();
  const generated = [];

  for (let i = 0; i < amount; i++) {
    const key = generateKey();
    const expiry = days === 0
      ? null
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    keys.push({
      key,
      hwid: null,
      userId: null,
      username: null,
      scriptId,
      redeemedAt: null,
      lastHwidReset: null,
      expiry,
      createdAt: new Date().toISOString(),
      createdBy: interaction.user.id
    });

    generated.push(key);
  }

  writeKeys(keys);

  const duration = days === 0 ? "Lifetime" : `${days} hari`;
  const keyList = generated.map(k => `\`${k}\``).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🔑 Key Generated")
    .setDescription(keyList)
    .addFields(
      { name: "Durasi", value: duration, inline: true },
      { name: "Jumlah", value: `${generated.length}`, inline: true }
    )
    .setColor(0x57F287)
    .setTimestamp();

  return interaction.editReply({ embeds: [embed], components: [] });
}

/*
==================================================
 LOGIN
==================================================
*/

client.login(CONFIG.token);
