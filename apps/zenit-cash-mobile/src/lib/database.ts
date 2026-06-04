import { AssistantHistoryMessage, PendingAction } from '@zenit/assistant-contracts';
import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('zenit-cash-mobile.db');
  }

  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS assistant_sessions (
      company_id INTEGER PRIMARY KEY NOT NULL,
      remote_session_id INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assistant_messages (
      id TEXT PRIMARY KEY NOT NULL,
      company_id INTEGER NOT NULL,
      remote_session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      pending_action_json TEXT
    );
    CREATE TABLE IF NOT EXISTS assistant_pending_actions (
      id INTEGER PRIMARY KEY NOT NULL,
      company_id INTEGER NOT NULL,
      remote_session_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

export async function getCachedRemoteSessionId(companyId: number): Promise<number | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ remote_session_id: number }>(
    'SELECT remote_session_id FROM assistant_sessions WHERE company_id = ?',
    [companyId]
  );

  return row?.remote_session_id ?? null;
}

export async function cacheRemoteSessionId(companyId: number, remoteSessionId: number) {
  const db = await getDatabase();
  await db.runAsync(
    `
      INSERT INTO assistant_sessions (company_id, remote_session_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(company_id)
      DO UPDATE SET remote_session_id = excluded.remote_session_id, updated_at = excluded.updated_at
    `,
    [companyId, remoteSessionId, new Date().toISOString()]
  );
}

export async function replaceCachedHistory(
  companyId: number,
  remoteSessionId: number,
  messages: AssistantHistoryMessage[]
) {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM assistant_messages WHERE company_id = ? AND remote_session_id = ?',
    [companyId, remoteSessionId]
  );

  for (const message of messages) {
    await db.runAsync(
      `
        INSERT OR REPLACE INTO assistant_messages (
          id,
          company_id,
          remote_session_id,
          role,
          text,
          created_at,
          pending_action_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        String(message.id),
        companyId,
        remoteSessionId,
        message.role,
        message.text,
        message.createdAt,
        message.pendingAction ? JSON.stringify(message.pendingAction) : null
      ]
    );
  }
}

export async function appendCachedMessage(params: {
  localId: string;
  companyId: number;
  remoteSessionId: number;
  role: string;
  text: string;
  createdAt: string;
  pendingAction?: PendingAction | null;
}) {
  const db = await getDatabase();
  await db.runAsync(
    `
      INSERT OR REPLACE INTO assistant_messages (
        id,
        company_id,
        remote_session_id,
        role,
        text,
        created_at,
        pending_action_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      params.localId,
      params.companyId,
      params.remoteSessionId,
      params.role,
      params.text,
      params.createdAt,
      params.pendingAction ? JSON.stringify(params.pendingAction) : null
    ]
  );
}

export async function upsertPendingAction(params: {
  companyId: number;
  remoteSessionId: number;
  pendingAction: PendingAction;
}) {
  const db = await getDatabase();
  await db.runAsync(
    `
      INSERT OR REPLACE INTO assistant_pending_actions (
        id,
        company_id,
        remote_session_id,
        status,
        payload_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      params.pendingAction.id,
      params.companyId,
      params.remoteSessionId,
      params.pendingAction.status,
      JSON.stringify(params.pendingAction),
      params.pendingAction.updatedAt
    ]
  );
}
