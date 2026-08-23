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
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/*
==================================================
 CONFIG - isi sesuai kebutuhan
==================================================
*/

const CONFIG = {
  token: process.env.BOT_TOKEN || "TOKEN_LO_DISINI",
  clientId: process.env.DISCORD_CLIENT_ID || "1541101786855899177",
  scriptUrl: process.env.SCRIPT_URL || "https://spideyprotect-production.up.railway.app/api/execute/SCRIPT_ID_LO",
  adminIds: (process.env.ADMIN_IDS || "").split(",").filter(Boolean)
};

/*
==================================================
 DATABASE (JSON)
==================================================
*/

const DATA_DIR = path.join(__dirname, "data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(KEYS_FILE)) {
  fs.writeFileSync(KEYS_FILE, "[]", "utf8");
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
 REGISTER SLASH COMMANDS
==================================================
*/

const commands = [
  new SlashCommandBuilder()
    .setName("setuppanel")
    .setDescription("Setup panel embed di channel ini")
    .addStringOption(opt =>
      opt
        .setName("title")
        .setDescription("Judul embed")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("description")
        .setDescription("Deskripsi embed")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate key baru")
    .addIntegerOption(opt =>
      opt
        .setName("days")
        .setDescription("Durasi key dalam hari (0 = lifetime)")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName("amount")
        .setDescription("Jumlah key yang digenerate (default: 1)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Hapus/revoke key")
    .addStringOption(opt =>
      opt
        .setName("key")
        .setDescription("Key yang mau direvoke")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("listkeys")
    .setDescription("Lihat semua key")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
 SLASH COMMANDS
==================================================
*/

client.on("interactionCreate", async interaction => {

  /*
  ------------------------------------------------
   /setuppanel
  ------------------------------------------------
  */

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "setuppanel"
  ) {

    const title =
      interaction.options.getString("title");

    const description =
      interaction.options.getString("description");

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x5865F2)
      .setFooter({
        text: `Sent by ${interaction.user.username} • ${new Date().toLocaleString("en-US")}`
      });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("redeem_key")
        .setLabel("Redeem Key")
        .setEmoji("🔑")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("get_script")
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

    await interaction.reply({
      content: "✅ Panel berhasil dibuat!",
      ephemeral: true
    });

    return;
  }

  /*
  ------------------------------------------------
   /genkey
  ------------------------------------------------
  */

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "genkey"
  ) {

    const days =
      interaction.options.getInteger("days");

    const amount =
      interaction.options.getInteger("amount") || 1;

    const keys = readKeys();
    const generated = [];

    for (let i = 0; i < Math.min(amount, 20); i++) {

      const key = generateKey();

      const expiry =
        days === 0
          ? null
          : new Date(
              Date.now() + days * 24 * 60 * 60 * 1000
            ).toISOString();

      keys.push({
        key,
        hwid: null,
        userId: null,
        username: null,
        redeemedAt: null,
        expiry,
        createdAt: new Date().toISOString(),
        createdBy: interaction.user.id
      });

      generated.push(key);
    }

    writeKeys(keys);

    const duration =
      days === 0
        ? "Lifetime"
        : `${days} hari`;

    const keyList =
      generated.map(k => `\`${k}\``).join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🔑 Key Generated")
      .setDescription(keyList)
      .addFields(
        { name: "Durasi", value: duration, inline: true },
        { name: "Jumlah", value: `${generated.length}`, inline: true }
      )
      .setColor(0x57F287)
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

    return;
  }

  /*
  ------------------------------------------------
   /revoke
  ------------------------------------------------
  */

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "revoke"
  ) {

    const keyInput =
      interaction.options.getString("key").toUpperCase();

    const keys = readKeys();
    const index = keys.findIndex(k => k.key === keyInput);

    if (index === -1) {
      return interaction.reply({
        content: "❌ Key tidak ditemukan.",
        ephemeral: true
      });
    }

    keys.splice(index, 1);
    writeKeys(keys);

    await interaction.reply({
      content: `✅ Key \`${keyInput}\` berhasil direvoke.`,
      ephemeral: true
    });

    return;
  }

  /*
  ------------------------------------------------
   /listkeys
  ------------------------------------------------
  */

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "listkeys"
  ) {

    const keys = readKeys();

    if (keys.length === 0) {
      return interaction.reply({
        content: "Belum ada key.",
        ephemeral: true
      });
    }

    const lines = keys.map(k => {
      const status =
        k.hwid
          ? `✅ Redeemed by ${k.username || k.userId}`
          : "⏳ Belum diredeeem";

      const expiry =
        k.expiry
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

    await interaction.reply({
      content: chunks[0],
      ephemeral: true
    });

    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({
        content: chunks[i],
        ephemeral: true
      });
    }

    return;
  }

  /*
  ------------------------------------------------
   BUTTON: redeem_key
  ------------------------------------------------
  */

  if (
    interaction.isButton() &&
    interaction.customId === "redeem_key"
  ) {

    const modal = new ModalBuilder()
      .setCustomId("modal_redeem")
      .setTitle("Redeem Key");

    const keyInput = new TextInputBuilder()
      .setCustomId("input_key")
      .setLabel("Masukkan Key kamu")
      .setPlaceholder("XXXXXX-XXXXXX-XXXXXX-XXXXXX")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const hwidInput = new TextInputBuilder()
      .setCustomId("input_hwid")
      .setLabel("HWID kamu")
      .setPlaceholder("Masukkan HWID dari executor kamu")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(keyInput),
      new ActionRowBuilder().addComponents(hwidInput)
    );

    await interaction.showModal(modal);
    return;
  }

  /*
  ------------------------------------------------
   MODAL: modal_redeem
  ------------------------------------------------
  */

  if (
    interaction.isModalSubmit() &&
    interaction.customId === "modal_redeem"
  ) {

    await interaction.deferReply({ ephemeral: true });

    const keyInput =
      interaction.fields
        .getTextInputValue("input_key")
        .toUpperCase()
        .trim();

    const hwid =
      interaction.fields
        .getTextInputValue("input_hwid")
        .trim();

    const keys = readKeys();
    const keyData = keys.find(k => k.key === keyInput);

    if (!keyData) {
      return interaction.editReply({
        content: "❌ Key tidak valid."
      });
    }

    if (
      keyData.expiry &&
      new Date(keyData.expiry) < new Date()
    ) {
      return interaction.editReply({
        content: "❌ Key sudah expired."
      });
    }

    if (keyData.hwid && keyData.hwid !== hwid) {
      return interaction.editReply({
        content: "❌ HWID tidak cocok dengan key ini."
      });
    }

    if (keyData.userId && keyData.userId !== interaction.user.id) {
      return interaction.editReply({
        content: "❌ Key ini sudah digunakan oleh user lain."
      });
    }

    keyData.hwid = hwid;
    keyData.userId = interaction.user.id;
    keyData.username = interaction.user.username;
    keyData.redeemedAt = new Date().toISOString();
    writeKeys(keys);

    const expiry =
      keyData.expiry
        ? `<t:${Math.floor(new Date(keyData.expiry).getTime() / 1000)}:R>`
        : "Lifetime";

    const embed = new EmbedBuilder()
      .setTitle("✅ Key Berhasil Diredeeem!")
      .addFields(
        { name: "Key", value: `\`${keyInput}\``, inline: true },
        { name: "Expiry", value: expiry, inline: true },
        { name: "HWID", value: `\`${hwid}\``, inline: false }
      )
      .setColor(0x57F287)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  /*
  ------------------------------------------------
   BUTTON: get_script
  ------------------------------------------------
  */

  if (
    interaction.isButton() &&
    interaction.customId === "get_script"
  ) {

    await interaction.deferReply({ ephemeral: true });

    const keys = readKeys();
    const userId = interaction.user.id;

    const keyData = keys.find(k => {
      if (k.userId !== userId) return false;
      if (k.expiry && new Date(k.expiry) < new Date()) return false;
      return true;
    });

    if (!keyData) {
      return interaction.editReply({
        content: "❌ Kamu belum punya key aktif. Redeem key dulu!"
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📜 Script Loader")
      .setDescription(
        `Ini loader script kamu. **Jangan share ke orang lain!**\n\n\`\`\`lua\nloadstring(game:HttpGet("${CONFIG.scriptUrl}"))() \n\`\`\``
      )
      .setColor(0x5865F2)
      .setTimestamp();

    try {
      await interaction.user.send({ embeds: [embed] });
      await interaction.editReply({
        content: "✅ Script sudah dikirim ke DM kamu!"
      });
    } catch {
      await interaction.editReply({
        content: "❌ Gagal kirim DM. Pastikan DM kamu terbuka."
      });
    }

    return;
  }

  /*
  ------------------------------------------------
   BUTTON: get_role
  ------------------------------------------------
  */

  if (
    interaction.isButton() &&
    interaction.customId === "get_role"
  ) {

    await interaction.deferReply({ ephemeral: true });

    const keys = readKeys();
    const userId = interaction.user.id;

    const keyData = keys.find(k => {
      if (k.userId !== userId) return false;
      if (k.expiry && new Date(k.expiry) < new Date()) return false;
      return true;
    });

    if (!keyData) {
      return interaction.editReply({
        content: "❌ Kamu belum punya key aktif. Redeem key dulu!"
      });
    }

    const roleId = process.env.BUYER_ROLE_ID;

    if (!roleId) {
      return interaction.editReply({
        content: "❌ Role belum dikonfigurasi oleh admin."
      });
    }

    try {

      const member = await interaction.guild.members.fetch(userId);
      await member.roles.add(roleId);

      await interaction.editReply({
        content: "✅ Role berhasil diberikan!"
      });

    } catch (err) {

      console.error("Get role error:", err);

      await interaction.editReply({
        content: "❌ Gagal memberikan role. Pastikan bot punya permission Manage Roles."
      });
    }

    return;
  }

  /*
  ------------------------------------------------
   BUTTON: reset_hwid
  ------------------------------------------------
  */

  if (
    interaction.isButton() &&
    interaction.customId === "reset_hwid"
  ) {

    await interaction.deferReply({ ephemeral: true });

    const keys = readKeys();
    const userId = interaction.user.id;

    const keyData = keys.find(k => k.userId === userId);

    if (!keyData) {
      return interaction.editReply({
        content: "❌ Kamu belum punya key yang terdaftar."
      });
    }

    keyData.hwid = null;
    writeKeys(keys);

    await interaction.editReply({
      content: "✅ HWID berhasil direset! Silakan redeem ulang key kamu dengan HWID baru."
    });

    return;
  }

  /*
  ------------------------------------------------
   BUTTON: get_stats
  ------------------------------------------------
  */

  if (
    interaction.isButton() &&
    interaction.customId === "get_stats"
  ) {

    await interaction.deferReply({ ephemeral: true });

    const keys = readKeys();
    const userId = interaction.user.id;

    const userKeys = keys.filter(k => k.userId === userId);

    if (userKeys.length === 0) {
      return interaction.editReply({
        content: "❌ Kamu belum punya key yang terdaftar."
      });
    }

    const fields = userKeys.map(k => {

      const expiry =
        k.expiry
          ? `<t:${Math.floor(new Date(k.expiry).getTime() / 1000)}:R>`
          : "Lifetime";

      const isExpired =
        k.expiry && new Date(k.expiry) < new Date();

      const status = isExpired ? "❌ Expired" : "✅ Aktif";

      return {
        name: `\`${k.key}\``,
        value:
          `Status: ${status}\nExpiry: ${expiry}\nHWID: \`${k.hwid || "Belum di-set"}\`\nRedeemed: ${k.redeemedAt ? `<t:${Math.floor(new Date(k.redeemedAt).getTime() / 1000)}:R>` : "Belum"}`,
        inline: false
      };
    });

    const embed = new EmbedBuilder()
      .setTitle("📊 Stats Kamu")
      .addFields(fields)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

});

/*
==================================================
 LOGIN
==================================================
*/

client.login(CONFIG.token);
