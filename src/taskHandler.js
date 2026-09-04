import { addTask, addReminder, completeTask, listOpenTasks, listTasksSince, logMessage } from "./db.js";
import { classifyMessage, handleComplexRequest, generateSummary } from "./ai.js";
import { createCalendarEvent, searchDriveFiles } from "./google.js";

const NAME_BY_NUMBER = {}; // ימולא מ-.env NAME_MAP אם תרצה, ראו README

export async function handleIncomingMessage({ senderNumber, text, sendReply }) {
  const authorized = (process.env.AUTHORIZED_NUMBERS || "").split(",").map((s) => s.trim());
  if (!authorized.includes(senderNumber)) {
    return; // מתעלם משולחים לא מורשים, לא צורך טוקן בכלל
  }

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
        await sendReply(`לא מצאתי משימה פתוחה שמתאימה ל"${classification.title}". אפשר לשלוח /משימות לרשימה המלאה.`);
      }
      break;
    }

    case "calendar_event": {
      if (!classification.due_date) {
        await sendReply(`חסר תאריך לאירוע. אפשר לשלוח שוב עם תאריך מדויק?`);
        break;
      }
      const link = await createCalendarEvent({
        title: classification.title || text,
        dateISO: classification.due_date,
        timeHHMM: classification.due_time,
        notes: text,
      });
      await sendReply(`📅 נוסף ליומן: "${classification.title || text}"\n${link}`);
      break;
    }

    case "drive_request": {
      const files = await searchDriveFiles(classification.title || text);
      if (files.length === 0) {
        await sendReply(`לא מצאתי מסמכים שתואמים ל"${classification.title || text}" בדרייב המשרדי.`);
      } else {
        const list = files.map((f) => `• ${f.name}\n  ${f.webViewLink}`).join("\n");
        await sendReply(`📁 מצאתי:\n${list}`);
      }
      break;
    }

    case "daily_summary": {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const tasks = listTasksSince(since.toISOString());
      const summary = await generateSummary(tasks, "היום");
      await sendReply(`📋 סיכום:\n\n${summary}`);
      break;
    }

    case "chit_chat": {
      // לא מפעילים מודל בכלל על סמול-טוק, חוסך טוקנים
      await sendReply("👍");
      break;
    }

    case "question":
    default: {
      const answer = classification.needs_smart_model
        ? await handleComplexRequest(text)
        : await handleComplexRequest(text); // גם שאלות "פשוטות" עדיין דורשות ניסוח, אך אפשר להחליף למודל הזול בהמשך לפי הצורך
      await sendReply(answer);
      break;
    }
  }
}
