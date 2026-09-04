import Database from "better-sqlite3";

const db = new Database("office.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by TEXT,
  title TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'open',       -- open | done | cancelled
  due_date TEXT,                     -- ISO date, nullable
  assigned_to TEXT,                  -- שם חופשי, נלמד מהטקסט
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  remind_at TEXT NOT NULL,           -- ISO datetime
  sent INTEGER DEFAULT 0,
  message TEXT,
  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT,
  body TEXT,
  intent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- סיכום שיחה מתגלגל, כדי לא לשלוח היסטוריה מלאה ל-Claude בכל פעם
CREATE TABLE IF NOT EXISTS conversation_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rolling_summary TEXT DEFAULT ''
);
INSERT OR IGNORE INTO conversation_state (id, rolling_summary) VALUES (1, '');
`);

export function addTask({ createdBy, title, details, dueDate, assignedTo }) {
  const stmt = db.prepare(`
    INSERT INTO tasks (created_by, title, details, due_date, assigned_to)
    VALUES (@createdBy, @title, @details, @dueDate, @assignedTo)
  `);
  const info = stmt.run({ createdBy, title, details: details || null, dueDate: dueDate || null, assignedTo: assignedTo || null });
  return info.lastInsertRowid;
}

export function completeTask(taskId) {
  db.prepare(`UPDATE tasks SET status = 'done', completed_at = datetime('now') WHERE id = ?`).run(taskId);
}

export function listOpenTasks() {
  return db.prepare(`SELECT * FROM tasks WHERE status = 'open' ORDER BY due_date IS NULL, due_date ASC`).all();
}

export function listTasksSince(isoDate) {
  return db.prepare(`SELECT * FROM tasks WHERE created_at >= ? ORDER BY created_at ASC`).all(isoDate);
}

export function addReminder({ taskId, remindAt, message }) {
  db.prepare(`INSERT INTO reminders (task_id, remind_at, message) VALUES (?, ?, ?)`).run(taskId, remindAt, message);
}

export function getDueReminders(nowIso) {
  return db.prepare(`SELECT * FROM reminders WHERE sent = 0 AND remind_at <= ?`).all(nowIso);
}

export function markReminderSent(id) {
  db.prepare(`UPDATE reminders SET sent = 1 WHERE id = ?`).run(id);
}

export function logMessage({ sender, body, intent }) {
  db.prepare(`INSERT INTO message_log (sender, body, intent) VALUES (?, ?, ?)`).run(sender, body, intent);
}

export function getRollingSummary() {
  return db.prepare(`SELECT rolling_summary FROM conversation_state WHERE id = 1`).get().rolling_summary;
}

export function setRollingSummary(text) {
  db.prepare(`UPDATE conversation_state SET rolling_summary = ? WHERE id = 1`).run(text);
}

export default db;
