import {
  addTask,
  addReminder,
  completeTask,
  removeTaskByTitleMatch,
  listOpenTasks,
  listTasksSince,
  addCharge,
  listChargesSince,
  getMessagesSince,
  logMessage,
} from "./db.js";
import { classifyMessage, handleComplexRequest, generateSummary, summarizeRecentMessages, generateChargeSummary } from "./ai.js";
import { createCalendarEvent, searchDriveFiles } from "./google.js";

export async function handleIncomingMessage({ senderNumber, text, sendReply }) {
  // הבוט כבר מוגבל לקבוצת המשרד הפרטית בלבד (index.js), אז אין צורך בבדיקת מספרים נוספת -
  // במיוחד לאור זה שוואטסאפ לפעמים מציג מזהה LID אנונימי במקום המספר האמיתי.
  const classification = await classifyMessage(text);
  logMessage({ sender: senderNumber, body: text, intent: classification.intent });

  switch (classification.intent) {
    case "new_task": {
      const taskId = addTask({
        createdBy: senderNumber,
        title: classification.title || text,
        details: text,
        dueDate: classification.due_date,
        assignedTo: classification.assigned_to,
      });
      if (classification.due_date) {
        const remindAt = classification.due_time
          ? `${classification.due_date}T${classification.due_time}:00`
          : `${classification.due_date}T09:00:00`;
        addReminder({ taskId, remindAt, message: classification.title || text });
      }
      await sendReply(`✅ נרשמה משימה: "${classification.title || text}"${classification.due_date ? ` (עד ${classification.due_date})` : ""}`);
      break;
    }

    case "complete_task": {
      const open = listOpenTasks();
      const match = open.find((t) => t.title.includes(classification.title || ""));
      if (match) {
        completeTask(match.id);
        await sendReply(`✔️ סומן כבוצע: "${match.title}"`);
      } else {
        await sendReply(`לא מצאתי משימה פתוחה שמתאימה ל"${classification.title}".`);
      }
      break;
    }

    case "remove_task": {
      const removed = removeTaskByTitleMatch(classification.title || "");
      if (removed) {
        await sendReply(`🗑️ הוסרה משימה: "${removed.title}"`);
      } else {
        await sendReply(`לא מצאתי משימה פתוחה שמתאימה ל"${classification.title}" להסרה.`);
      }
      break;
    }

    case "calendar_event": {
      if (!classification.due_date) {
        await sendReply(`חסר תאריך לאירוע. אפשר לשלוח שוב עם תאריך מדויק?`);
        break;
      }
      try {
        const link = await createCalendarEvent({
          title: classification.title || text,
          dateISO: classification.due_date,
          timeHHMM: classification.due_time,
          notes: text,
        });
        await sendReply(`📅 נוסף ליומן: "${classification.title || text}"\n${link}`);
      } catch (err) {
        console.error(err);
        await sendReply(`⚠️ לא הצלחתי להוסיף ליומן - כנראה חסר חיבור לגוגל. בדוק עם המנהל.`);
      }
      break;
    }

    case "drive_request": {
      try {
        const files = await searchDriveFiles({
          query: classification.title || text,
          clientName: classification.client_name,
        });
        if (files.length === 0) {
          await sendReply(`לא מצאתי מסמכים שתואמים ל"${classification.title || text}"${classification.client_name ? ` עבור ${classification.client_name}` : ""}.`);
        } else {
          const list = files.map((f) => `• ${f.name}\n  ${f.webViewLink}`).join("\n");
          await sendReply(`📁 מצאתי:\n${list}`);
        }
      } catch (err) {
        console.error(err);
        await sendReply(`⚠️ לא הצלחתי לחפש בדרייב - כנראה חסר חיבור לגוגל. בדוק עם המנהל.`);
      }
      break;
    }

    case "new_charge": {
      addCharge({
        createdBy: senderNumber,
        chargeType: classification.charge_type,
        description: text,
        amount: classification.amount ? parseFloat(classification.amount) : null,
        clientName: classification.client_name,
      });
      await sendReply(`💰 החיוב נרשם!${classification.charge_type ? ` (${classification.charge_type}` : ""}${classification.client_name ? ` עבור ${classification.client_name}` : ""}${classification.amount ? `, ${classification.amount} ₪)` : classification.charge_type ? ")" : ""}`);
      break;
    }

    case "recall_messages": {
      const minutes = classification.since_minutes || 60;
      const since = new Date(Date.now() - minutes * 60000);
      const messages = getMessagesSince(since.toISOString());
      const label = minutes >= 1440 ? `ב-${Math.round(minutes / 1440)} הימים האחרונים` : `ב-${minutes} הדקות האחרונות`;
      const summary = await summarizeRecentMessages(messages, label);
      await sendReply(`🕓 סיכום ${label}:\n\n${summary}`);
      break;
    }

    case "daily_summary": {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const tasks = listTasksSince(since.toISOString());
      const charges = listChargesSince(since.toISOString());
      const taskSummary = await generateSummary(tasks, "היום");
      const chargeSummary = generateChargeSummary(charges);
      await sendReply(`📋 סיכום משימות:\n\n${taskSummary}\n\n💰 חיובים:\n${chargeSummary}`);
      break;
    }

    case "chit_chat": {
      await sendReply("👍");
      break;
    }

    case "question":
    default: {
      const answer = await handleComplexRequest(text);
      await sendReply(answer);
      break;
    }
  }
}

export function logRawMessage({ senderNumber, text }) {
  logMessage({ sender: senderNumber, body: text, intent: "raw" });
}
