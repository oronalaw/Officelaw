import "dotenv/config";
import express from "express";
import QRCode from "qrcode";
import { startWhatsApp, sendToChat, listGroups, getCurrentQR } from "./whatsapp.js";
import { handleIncomingMessage } from "./taskHandler.js";
import { startReminderLoop, startDailySummary, startWeeklySummary } from "./scheduler.js";

async function main() {
  await startWhatsApp(async ({ chatId, isGroup, senderNumber, text }) => {
    const officeGroupId = process.env.OFFICE_GROUP_ID;
    if (isGroup && officeGroupId && chatId !== officeGroupId) return;

    if (text.trim() === "/קבוצות") {
      const groups = await listGroups();
      const list = Object.entries(groups)
        .map(([id, meta]) => `${meta.subject}: ${id}`)
        .join("\n");
      await sendToChat(chatId, `הקבוצות שלי:\n${list}`);
      return;
    }

    await handleIncomingMessage({
      senderNumber,
      text,
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
