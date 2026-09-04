import { google } from "googleapis";
import fs from "fs";

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const credentials = JSON.parse(fs.readFileSync(keyPath, "utf8"));
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

export async function searchDriveFiles(query) {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const q = [
    `name contains '${query.replace(/'/g, "")}'`,
    "trashed = false",
    folderId ? `'${folderId}' in parents` : null,
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
