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
