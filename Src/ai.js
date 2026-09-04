import Anthropic from "@anthropic-ai/sdk";
import { getRollingSummary, setRollingSummary } from "./db.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// מודל זול ומהיר לרוב ההודעות (סיווג, משימות פשוטות, תזכורות)
const MODEL_FAST = "claude-haiku-4-5-20251001";
// מודל חזק יותר, רק כשבאמת צריך (ניסוח מסמכים, שאלות מורכבות, סיכומים ארוכים)
const MODEL_SMART = "claude-sonnet-4-6";

// System prompt קבוע - עובר עם cache_control כדי לא להיטען מחדש (ומחיר) בכל קריאה
const SYSTEM_PROMPT = `אתה העוזר הדיגיטלי של משרד עורכי דין קטן.
בקבוצת הוואטסאפ נמצאים: אורטל (מנהלת משרד), מורן (מתמחה), אורון (עורך הדין, הבעלים), הילה (עורכת דין מסייעת, אש
