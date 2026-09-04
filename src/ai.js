import Anthropic from "@anthropic-ai/sdk";
import { getRollingSummary, setRollingSummary } from "./db.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL_FAST = "claude-haiku-4-5-20251001";
const MODEL_SMART = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `אתה "גימי", העוזר הדיגיטלי של משרד עורכי דין קטן.
בקבוצת הוואטסאפ נמצאים: אורטל (מנהלת משרד), מורן (מתמחה), אורון (עורך הדין, הבעלים), הילה (עורכת דין מסייעת).
תפקידך: לזהות מתוך הודעות חופשיות משימות, תזכורות, חיובים, בקשות ליומן/דרייב, ולהחזיר תשובה תמציתית ומקצועית בעברית.
אל תמציא פרטים שלא נאמרו. אם חסר מידע קריטי, ציין זאת בקצרה במקום לנחש.`;

export async function classifyMessage(text) {
  const resp = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 350,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT + `

החזר אך ורק JSON תקני בפורמט הבא, ללא טקסט נוסף:
{
  "intent": "new_task | complete_task | remove_task | calendar_event | drive_request | daily_summary | new_charge | recall_messages | question | chit_chat",
  "title": "כותרת קצרה למשימה, אם רלוונטי",
  "due_date": "YYYY-MM-DD או null",
  "due_time": "HH:MM או null",
  "assigned_to": "שם מהקבוצה אם צוין, אחרת null",
  "client_name": "שם לקוח אם צוין, אחרת null",
  "charge_type": "סוג החיוב (אגרה/שליחות/שכ״ט וכו׳) אם רלוונטי, אחרת null",
  "amount": "מספר בלבד (ללא סימן ₪) אם רלוונטי, אחרת null",
  "since_minutes": "מספר דקות אחורה אם ביקשו טווח זמן (למשל 'שעה אחרונה' = 60), אחרת null"
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
    return { intent: "question" };
  }
}

export async function handleComplexRequest(text, extraContext = "") {
  const summary = getRollingSummary();
  const resp = await anthropic.messages.create({
    model: MODEL_SMART,
    max_tokens: 800,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `סיכום שיחה עד כה: ${summary || "(אין עדיין)"}\n\nהקשר נוסף: ${extraContext || "(אין)"}\n\nהודעה נוכחית: ${text}`,
      },
    ],
  });
  const answer = resp.content.find((b) => b.type === "text")?.text || "";
  await updateRollingSummary(text, answer);
  return answer;
}

async function updateRollingSummary(userText, assistantText) {
  const prevSummary = getRollingSummary();
  const resp = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 150,
    system: "סכם בעברית, במשפט או שניים בלבד, את מצב השיחה העדכני של המשרד. היה תמציתי ביותר.",
    messages: [
      { role: "user", content: `סיכום קודם: ${prevSummary}\nהודעה חדשה: ${userText}\nתשובה: ${assistantText}\n\nסיכום מעודכן:` },
    ],
  });
  const newSummary = resp.content.find((b) => b.type === "text")?.text || prevSummary;
  setRollingSummary(newSummary.trim());
}

export async function generateSummary(tasks, periodLabel) {
  if (tasks.length === 0) return `אין משימות שנרשמו ${periodLabel}.`;
  const listText = tasks
    .map((t) => `- [${t.id}] ${t.title}${t.assigned_to ? ` (${t.assigned_to})` : ""}${t.due_date ? ` — עד ${t.due_date}` : ""} [${t.status === "done" ? "בוצע" : "פתוח"}]`)
    .join("\n");

  const resp = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 600,
    system: "סכם רשימת משימות משרדיות בעברית, בצורה ברורה ומאורגנת, עם קבוצות 'פתוח' ו'בוצע'. השאר את מספרי ה-ID בסוגריים מרובעים ליד כל משימה, כדי שאפשר יהיה להתייחס אליהם אחר כך.",
    messages: [{ role: "user", content: `רשימת משימות ${periodLabel}:\n${listText}` }],
  });
  return resp.content.find((b) => b.type === "text")?.text || listText;
}

/** מסכם הודעות גולמיות מהקבוצה לפי טווח זמן, בתשובה לבקשות כמו "מה נכתב בשעה האחרונה" */
export async function summarizeRecentMessages(messages, rangeLabel) {
  if (messages.length === 0) return `לא נכתבו הודעות ${rangeLabel}.`;
  const text = messages.map((m) => `[${m.sender}]: ${m.body}`).join("\n");
  const resp = await anthropic.messages.create({
    model: MODEL_SMART,
    max_tokens: 700,
    system: "אתה מסכם שיחת וואטסאפ משרדית בעברית. תן תמצית ברורה של מה שנדון ומה שהוחלט, לא תמלול מילה-במילה.",
    messages: [{ role: "user", content: `הודעות ${rangeLabel}:\n${text}` }],
  });
  return resp.content.find((b) => b.type === "text")?.text || text;
}

export function generateChargeSummary(charges) {
  if (charges.length === 0) return "אין חיובים רשומים.";
  const total = charges.reduce((sum, c) => sum + (c.amount || 0), 0);
  const list = charges
    .map((c) => `- ${c.charge_type || "חיוב"}${c.client_name ? ` עבור ${c.client_name}` : ""}: ${c.amount ? `${c.amount} ₪` : "ללא סכום"}`)
    .join("\n");
  return `${list}\n\nסה"כ: ${total} ₪`;
}

export { MODEL_FAST, MODEL_SMART };
