// runner.mjs  —  SD AI Bot Bağlayıcısı
// Kurulum:  npm init -y && npm pkg set type=module && npm i mineflayer bedrock-protocol
// Çalıştır: node runner.mjs      (bu pencere AÇIK kalmalı, yoksa bot oyuna giremez)

const API = "https://sdyapay.lovable.app/api/public/v1/bot";
const KEY = "sdai_..."; // /api-key sayfasından alın

const call = async (body) => {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) console.error("API hatası:", r.status, j);
  return j;
};

let bot = null;
let edition = null;
let cfgName = "SD_AI";

const say = (msg) => {
  if (!bot) return;
  if (edition === "java") bot.chat(msg);
  else
    bot.queue("text", {
      type: "chat",
      needs_translation: false,
      source_name: cfgName,
      xuid: "",
      platform_chat_id: "",
      message: msg,
      filtered_message: "",
    });
};

async function connect(cfg) {
  edition = cfg.edition;
  cfgName = cfg.edition === "bedrock" ? cfg.gamertag || cfg.bot_name : cfg.bot_name;
  await call({ action: "status", status: "starting", message: "Bağlanılıyor: " + cfg.host + ":" + cfg.port });

  if (cfg.edition === "java") {
    const mineflayer = (await import("mineflayer")).default;
    bot = mineflayer.createBot({
      host: cfg.host,
      port: cfg.port,
      username: cfg.bot_name,
      auth: "offline", // premium sunucu ise "microsoft" yapın
      ...(cfg.version ? { version: cfg.version } : {}),
    });
    bot.once("spawn", () => call({ action: "status", status: "online", message: "Oyuna girdi" }));
    bot.on("chat", async (username, message) => {
      if (username === cfg.bot_name) return;
      const res = await call({ action: "ask", player: username, text: message });
      if (res.reply) say(res.reply);
      if (res.command) say(res.command);
    });
    bot.on("kicked", (r) => call({ action: "status", status: "error", message: "Atıldı: " + String(r).slice(0, 200) }));
    bot.on("error", (e) => call({ action: "status", status: "error", message: String(e.message || e).slice(0, 200) }));
    bot.on("end", () => { bot = null; call({ action: "status", status: "offline", message: "Bağlantı kapandı" }); });
  } else {
    const bp = await import("bedrock-protocol");
    // İlk çalıştırmada konsolda Microsoft cihaz kodu çıkar: microsoft.com/link adresine girip kodu yazın.
    bot = bp.createClient({
      host: cfg.host,
      port: cfg.port || 19132,
      username: cfg.gamertag || cfg.bot_name,
      offline: false,
      profilesFolder: "./auth-cache",
      ...(cfg.version ? { version: cfg.version } : {}),
    });
    bot.on("spawn", () => call({ action: "status", status: "online", message: "Oyuna girdi" }));
    bot.on("text", async (packet) => {
      if (packet.type !== "chat") return;
      const player = packet.source_name;
      if (!player || player === cfgName) return;
      const res = await call({ action: "ask", player, text: packet.message });
      if (res.reply) say(res.reply);
      if (res.command) say(res.command);
    });
    bot.on("kick", (r) =>
      call({ action: "status", status: "error", message: "Atıldı: " + JSON.stringify(r).slice(0, 200) }),
    );
    bot.on("error", (e) => call({ action: "status", status: "error", message: String(e.message || e).slice(0, 200) }));
    bot.on("close", () => { bot = null; call({ action: "status", status: "offline", message: "Bağlantı kapandı" }); });
  }
}

console.log("SD AI runner başladı, panel bekleniyor…");
setInterval(async () => {
  try {
    const { bot: cfg, commands, error } = await call({ action: "poll" });
    if (error) return console.error(error);
    if (cfg.desired_state === "online" && !bot) await connect(cfg);
    if (cfg.desired_state === "offline" && bot) {
      try { bot.quit ? bot.quit() : bot.close(); } catch {}
      bot = null;
      await call({ action: "status", status: "offline", message: "Durduruldu" });
    }
    for (const c of commands ?? []) {
      try {
        say(c.command);
        await call({ action: "result", command_id: c.id, status: "done" });
      } catch (e) {
        await call({ action: "result", command_id: c.id, status: "error", result: String(e) });
      }
    }
  } catch (e) {
    console.error("poll hatası:", e.message);
  }
}, 3000);