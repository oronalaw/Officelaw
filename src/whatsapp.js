import baileysPkg from "@whiskeysockets/baileys";
const makeWASocket = baileysPkg.default ?? baileysPkg.makeWASocket ?? baileysPkg;
const { useMultiFileAuthState, DisconnectReason } = baileysPkg;
import qrcode from "qrcode-terminal";
import pino from "pino";

let sock = null;
let onMessageHandler = null;

/**
 * מפעיל חיבור לוואטסאפ עם המספר הנוסף.
 * בהרצה ראשונה יוצג QR code בטרמינל - יש לסרוק אותו מהמכשיר עם המספר הנוסף
 * (וואטסאפ > מכשירים מקושרים > קישור מכשיר). לאחר מכן החיבור נשמר בתיקיית auth_info
 * ולא צריך לסרוק שוב, אלא אם מתנתקים.
 */
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
      console.log("\n📱 סרוק את קוד ה-QR הזה מהמספר הנוסף (וואטסאפ > מכשירים מקושרים):\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("החיבור נסגר. מתחבר מחדש:", shouldReconnect);
      if (shouldReconnect) startWhatsApp(onMessageHandler);
    } else if (connection === "open") {
      console.log("✅ מחובר לוואטסאפ בהצלחה.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const remoteJid = msg.key.remoteJid;
      const isGroup = remoteJid?.endsWith("@g.us");
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";
      if (!text) continue;

      const senderJid = isGroup ? msg.key.participant : remoteJid;
      const senderNumber = senderJid?.split("@")[0];

      await onMessageHandler({
        chatId: remoteJid,
        isGroup,
        senderNumber,
        text: text.trim(),
      });
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
    console.warn("OFFICE_GROUP_ID עדיין לא מוגדר. הרץ listGroups() כדי למצוא את המזהה, ראה README.");
    return;
  }
  return sendToChat(groupId, text);
}

/** עוזר חד-פעמי: מדפיס את כל הקבוצות שהמספר חבר בהן, כדי למצוא את ה-ID של קבוצת המשרד. */
export async function listGroups() {
  if (!sock) throw new Error("WhatsApp socket not initialized yet");
  const groups = await sock.groupFetchAllParticipating();
  for (const [id, meta] of Object.entries(groups)) {
    console.log(`${meta.subject}  ->  ${id}`);
  }
  return groups;
}
