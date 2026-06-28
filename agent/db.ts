import "dotenv/config";
import Database from "better-sqlite3";

export interface RequestRecord {
	id: string;
	message: string;
	action: string;
	model: string;
	source: string | null;
	status: "pending" | "done" | "error";
	result: string | null;
	error: string | null;
	created_at: number;
	completed_at: number | null;
}

const dbPath = process.env.AGENT_DB_PATH ?? "./agent.db";
const db = new Database(dbPath);

db.exec(`
	CREATE TABLE IF NOT EXISTS requests (
		id TEXT PRIMARY KEY,
		message TEXT NOT NULL,
		action TEXT NOT NULL,
		model TEXT NOT NULL,
		source TEXT,
		status TEXT NOT NULL DEFAULT 'pending',
		result TEXT,
		error TEXT,
		created_at INTEGER NOT NULL,
		completed_at INTEGER
	)
`);

export function insertRequest(record: {
	id: string;
	message: string;
	action: string;
	model: string;
	source: string | null;
	createdAt: number;
}): void {
	db.prepare(
		`INSERT INTO requests (id, message, action, model, source, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
	).run(record.id, record.message, record.action, record.model, record.source, record.createdAt);
}

export function completeRequest(id: string, result: string, completedAt: number): void {
	db.prepare(`UPDATE requests SET status = 'done', result = ?, completed_at = ? WHERE id = ?`).run(
		result,
		completedAt,
		id,
	);
}

export function failRequest(id: string, error: string, completedAt: number): void {
	db.prepare(`UPDATE requests SET status = 'error', error = ?, completed_at = ? WHERE id = ?`).run(
		error,
		completedAt,
		id,
	);
}

export function getRequest(id: string): RequestRecord | undefined {
	return db.prepare(`SELECT * FROM requests WHERE id = ?`).get(id) as RequestRecord | undefined;
}

export function listRequests(limit: number = 20): RequestRecord[] {
	return db.prepare(`SELECT * FROM requests ORDER BY created_at DESC LIMIT ?`).all(limit) as RequestRecord[];
}
