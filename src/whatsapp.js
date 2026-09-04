import { createRequire } from "module";
const require = createRequire(import.meta.url);
const baileysPkg = require("@whiskeysockets/baileys");

const makeWASocket = baileysPkg.default ?? baileysPkg;
const { useMultiFileAuthState, DisconnectReason } = baileysPkg;

import pino from "pino";

let sock = null;
let onMessageHandler = null;
let currentQR = null;

export function getCurrentQR() {
  return currentQR;
}

export async function startWhatsApp(onMessage) {
  onMessageHandler = onMessage;
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      currentQR = qr;
      console.log("\n📱 QR חדש זמין. פתח את /qr בדפדפן כדי לסרוק אותו כתמונה.\n");
    }
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("החיבור נסגר. מתחבר מחדש:", shouldReconnect);
      if (shouldReconnect) startWhatsApp(onMessageHandler);
    } else if (connection === "open") {
      currentQR = null;
      console.log("✅ מחובר לוואטסאפ בהצלחה.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`🔔 messages.upsert אירוע, type=${type}, כמות=${messages.length}`);
    if (type !== "notify") return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) {
        console.log("⏭️ הודעה מדולגת (ריקה או ממני)");
        continue;
      }
      const remoteJid = msg.key.remoteJid;
      const isGroup = remoteJid?.endsWith("@g.us");
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";
      console.log(`📩 הודעה התקבלה: chatId=${remoteJid}, isGroup=${isGroup}, text="${text}"`);
      if (!text) continue;

      const senderJid = isGroup ? msg.key.participant : remoteJid;
      const senderNumber = senderJid?.split("@")[0];
      console.log(`👤 שולח: ${senderNumber}`);

      try {
        await onMessageHandler({
          chatId: remoteJid,
          isGroup,
          senderNumber,
          text: text.trim(),
        });
      } catch (err) {
        console.error("❌ שגיאה בטיפול בהודעה:", err);
      }
    }
  });

  return sock;
}

export async function sendToChat(chatId, text) {
  if (!sock) throw new Error("WhatsApp socket not initialized yet");
  await sock.sendMessage(chatId, { text });
}

export async function sendToOfficeGroup(text) {
  const groupId = process.env.OFFICE_GROUP_ID;
  if (!groupId) {
    console.warn("OFFICE_GROUP_ID עדיין לא מוגדר.");
    return;
  }
  return sendToChat(groupId, text);
}

export async function listGroups() {
  if (!sock) throw new Error("WhatsApp socket not initialized yet");
  const groups = await sock.groupFetchAllParticipating();
  for (const [id, meta] of Object.entries(groups)) {
    console.log(`${meta.subject}  ->  ${id}`);
  }
  return groups;
}
