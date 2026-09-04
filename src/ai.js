import Anthropic from "@anthropic-ai/sdk";
import { getRollingSummary, setRollingSummary } from "./db.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// מודל זול ומהיר לרוב ההודעות (סיווג, משימות פשוטות, תזכורות)
const MODEL_FAST = "claude-haiku-4-5-20251001";
// מודל חזק יותר, רק כשבאמת צריך (ניסוח מסמכים, שאלות מורכבות, סיכומים ארוכים)
const MODEL_SMART = "claude-sonnet-4-6";

// System prompt קבוע - עובר עם cache_control כדי לא להיטען מחדש (ומחיר) בכל קריאה
const SYSTEM_PROMPT = `אתה העוזר הדיגיטלי של משרד עורכי דין קטן.
בקבוצת הוואטסאפ נמצאים: אורטל (מנהלת משרד), מורן (מתמחה), אורון (עורך הדין, הבעלים), הילה (עורכת דין מסייעת, אשתו של אורון).
תפקידך: לזהות מתוך הודעות חופשיות משימות, תזכורות, בקשות ליומן או לדרייב, ולהחזיר תשובה תמציתית ומקצועית בעברית.
אל תמציא פרטים שלא נאמרו. אם חסר מידע קריטי (כמו תאריך), ציין זאת בקצרה במקום לנחש.`;

/**
 * מסווג הודעה נכנסת לסוג הפעולה, בעזרת המודל הזול.
 * מחזיר: { intent, title, dueDate, assignedTo, needsCalendar, needsDrive, needsSmartModel }
 */
export async function classifyMessage(text) {
  const resp = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 300,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT + `

החזר אך ורק JSON תקני בפורמט הבא, ללא טקסט נוסף:
{
  "intent": "new_task | complete_task | calendar_event | drive_request | daily_summary | question | chit_chat",
  "title": "כותרת קצרה למשימה, אם רלוונטי",
  "due_date": "YYYY-MM-DD או null",
  "due_time": "HH:MM או null",
  "assigned_to": "שם מהקבוצה אם צוין, אחרת null",
  "needs_smart_model": true/false
}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: text }],
  });

  const raw = resp.content.find((b) => b.type === "text")?.text || "{}";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { intent: "question", needs_smart_model: true };
  }
}

/**
 * מטפל בבקשה שדורשת ניסוח/הבנה מורכבת (המודל החזק), עם היסטוריה מצומצמת בלבד.
 */
export async function handleComplexRequest(text, extraContext = "") {
  const summary = getRollingSummary();
  const resp = await anthropic.messages.create({
    model: MODEL_SMART,
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `סיכום שיחה עד כה: ${summary || "(אין עדיין)"}

הקשר נוסף: ${extraContext || "(אין)"}

הודעה נוכחית: ${text}`,
      },
    ],
  });
  const answer = resp.content.find((b) => b.type === "text")?.text || "";
  await updateRollingSummary(text, answer);
  return answer;
}

/**
 * מעדכן סיכום גלגלי קצר של השיחה במקום לשמור היסטוריה מלאה - חוסך המון טוקנים לאורך זמן.
 * משתמש במודל הזול בלבד.
 */
async function updateRollingSummary(userText, assistantText) {
  const prevSummary = getRollingSummary();
  const resp = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 150,
    system: "סכם בעברית, במשפט או שניים בלבד, את מצב השיחה העדכני של המשרד. היה תמציתי ביותר.",
    messages: [
      {
        role: "user",
        content: `סיכום קודם: ${prevSummary}\nהודעה חדשה: ${userText}\nתשובה: ${assistantText}\n\nסיכום מעודכן:`,
      },
    ],
  });
  const newSummary = resp.content.find((b) => b.type === "text")?.text || prevSummary;
  setRollingSummary(newSummary.trim());
}

/**
 * מייצר סיכום משימות יומי/תקופתי מתוך רשימת משימות - טקסט בלבד, בלי צורך במודל חכם.
 */
export async function generateSummary(tasks, periodLabel) {
  if (tasks.length === 0) return `אין משימות שנרשמו ${periodLabel}.`;
  const listText = tasks
    .map((t) => `- ${t.title}${t.assigned_to ? ` (${t.assigned_to})` : ""}${t.due_date ? ` — עד ${t.due_date}` : ""} [${t.status === "done" ? "בוצע" : "פתוח"}]`)
    .join("\n");

  const resp = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 500,
    system: "סכם רשימת משימות משרדיות בעברית, בצורה ברורה ומאורגנת, עם קבוצות של 'פתוח' ו'בוצע'.",
    messages: [{ role: "user", content: `רשימת משימות ${periodLabel}:\n${listText}` }],
  });
  return resp.content.find((b) => b.type === "text")?.text || listText;
}

export { MODEL_FAST, MODEL_SMART };
