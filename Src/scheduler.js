import cron from "node-cron";
import { getDueReminders, markReminderSent, listTasksSince } from "./db.js";
import { generateSummary } from "./ai.js";
import { sendToOfficeGroup } from "./whatsapp.js";

/** בודק כל דקה תזכורות שהגיע זמנן, ושולח אותן לקבוצה. */
export function startReminderLoop() {
  cron.schedule("* * * * *", async () => {
    const nowIso = new Date().toISOString();
    const due = getDueReminders(nowIso);
    for (const r of due) {
      await sendToOfficeGroup(`⏰ תזכורת: ${r.message}`);
      markReminderSent(r.id);
    }
  });
}

/** שולח סיכום משימות יומי בשעה שהוגדרה ב-.env (ברירת מחדל 18:00). */
export function startDailySummary() {
  const hour = process.env.DAILY_SUMMARY_HOUR || "18";
  cron.schedule(`0 ${hour} * * *`, async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const tasks = listTasksSince(since.toISOString());
    const summary = await generateSummary(tasks, "היום");
    await sendToOfficeGroup(`📋 סיכום יומי:\n\n${summary}`);
  });
}

/** סיכום שבועי - כל יום ראשון בבוקר, על השבוע שעבר. */
export function startWeeklySummary() {
  cron.schedule("0 8 * * 0", async () => {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const tasks = listTasksSince(since.toISOString());
    const summary = await generateSummary(tasks, "השבוע האחרון");
    await sendToOfficeGroup(`🗓️ סיכום שבועי:\n\n${summary}`);
  });
}
