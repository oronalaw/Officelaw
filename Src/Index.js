import "dotenv/config";
import express from "express";
import { startWhatsApp, sendToChat, listGroups } from "./whatsapp.js";
import { handleIncomingMessage } from "./taskHandler.js";
import { startReminderLoop, startDailySummary, startWeeklySummary } from "./scheduler.js";

async function main() {
  await startWhatsApp(async ({ chatId, isGroup, senderNumber, text }) => {
    // רק הודעות מתוך קבוצת המשרד (או צ'אט פרטי עם משתמש מורשה, לגמישות)
    const officeGroupId = process.env.OFFICE_GROUP_ID;
    if (isGroup && officeGroupId && chatId !== officeGroupId) return;

    // פקודת עזר חד פעמית: לשלוח "/קבוצות" כדי לגלות את ה-ID של קבוצת המשרד
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

  // שרת HTTP קטן, רק לבדיקת "בריאות" (למשל עבור Railway / uptime monitor)
  const app = express();
  app.get("/health", (_req, res) => res.send("ok"));
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Health server on :${port}`));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
