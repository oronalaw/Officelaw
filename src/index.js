import "dotenv/config";
import express from "express";
import QRCode from "qrcode";
import { startWhatsApp, sendToChat, listGroups, getCurrentQR } from "./whatsapp.js";
import { handleIncomingMessage, logRawMessage } from "./taskHandler.js";
import { startReminderLoop, startDailySummary, startWeeklySummary } from "./scheduler.js";

const TRIGGER_WORD = "גימי";

async function main() {
  await startWhatsApp(async ({ chatId, isGroup, senderNumber, text }) => {
    const officeGroupId = process.env.OFFICE_GROUP_ID;
    if (isGroup && officeGroupId && chatId !== officeGroupId) return;

    const trimmed = text.trim();

    // רישום שקט של כל הודעה בקבוצה, בלי AI - כדי שנוכל לחזור אליה מאוחר יותר עם "גימי"
    logRawMessage({ senderNumber, text: trimmed });

    // פקודת עזר חד-פעמית - עובדת גם בלי מילת ההפעלה
    if (trimmed === "/קבוצות") {
      const groups = await listGroups();
      const list = Object.entries(groups)
        .map(([id, meta]) => `${meta.subject}: ${id}`)
        .join("\n");
      await sendToChat(chatId, `הקבוצות שלי:\n${list}`);
      return;
    }

    // הבוט מגיב רק אם ההודעה מתחילה במילת ההפעלה "גימי"
    if (!trimmed.startsWith(TRIGGER_WORD)) return;

    const actualText = trimmed.slice(TRIGGER_WORD.length).replace(/^[\s,:.-]+/, "").trim();
    if (!actualText) {
      await sendToChat(chatId, "כן? במה אפשר לעזור?");
      return;
    }

    await handleIncomingMessage({
      senderNumber,
      text: actualText,
      sendReply: (reply) => sendToChat(chatId, reply),
    });
  });

  startReminderLoop();
  startDailySummary();
  startWeeklySummary();

  const app = express();
  app.get("/health", (_req, res) => res.send("ok"));

  app.get("/qr", async (_req, res) => {
    const qr = getCurrentQR();
    if (!qr) {
      res.send("<h2>אין QR פעיל כרגע - כנראה כבר מחובר, או שממתין. רענן בעוד רגע.</h2>");
      return;
    }
    const png = await QRCode.toBuffer(qr, { width: 500, margin: 2 });
    res.type("png").send(png);
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Health server on :${port}`));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
