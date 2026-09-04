import { google } from "googleapis";
import fs from "fs";

function getCredentials() {
  // עדיף: תוכן ה-JSON ישירות ממשתנה סביבה (נוח יותר להעלאה מהנייד)
  const content = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT;
  if (content) return JSON.parse(content);
  // חלופה: קובץ בדיסק
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return JSON.parse(fs.readFileSync(keyPath, "utf8"));
}

function getAuth() {
  const credentials = getCredentials();
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

export async function createCalendarEvent({ title, dateISO, timeHHMM, notes }) {
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const start = timeHHMM ? `${dateISO}T${timeHHMM}:00` : dateISO;
  const isAllDay = !timeHHMM;

  const event = {
    summary: title,
    description: notes || "",
    ...(isAllDay
      ? { start: { date: dateISO }, end: { date: dateISO } }
      : {
          start: { dateTime: start, timeZone: process.env.TIMEZONE || "Asia/Jerusalem" },
          end: { dateTime: start, timeZone: process.env.TIMEZONE || "Asia/Jerusalem" },
        }),
  };

  const res = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    requestBody: event,
  });
  return res.data.htmlLink;
}

/** מאתר את תיקיית הלקוח בתוך תיקיית השורש (אורוןG), לפי שם. */
async function findClientFolder(drive, clientName) {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!clientName || !rootId) return null;

  const res = await drive.files.list({
    q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${clientName.replace(/'/g, "")}' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 3,
  });
  return res.data.files?.[0] || null;
}

/**
 * מחפש קבצים בדרייב - קודם מנסה לאתר תיקיית לקוח ספציפית, ואז מחפש בתוכה
 * גם לפי שם קובץ וגם לפי תוכן (fullText). אם לא צוין לקוח, מחפש בכל תיקיית השורש.
 */
export async function searchDriveFiles({ query, clientName }) {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  let parentId = rootId;

  if (clientName) {
    const clientFolder = await findClientFolder(drive, clientName);
    if (clientFolder) parentId = clientFolder.id;
  }

  const safeQuery = query.replace(/'/g, "");
  const q = [
    `(name contains '${safeQuery}' or fullText contains '${safeQuery}')`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const res = await drive.files.list({
    q,
    fields: "files(id, name, webViewLink, mimeType, modifiedTime)",
    pageSize: 5,
  });
  return res.data.files || [];
}
