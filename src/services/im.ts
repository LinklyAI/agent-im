import { messageId } from '../lib/id.js'
import type {
  ProfileRow,
  ThreadRow,
  MessageRow,
  ParticipantEntry,
  ParticipantItem,
  UpsertProfileInput,
  CreateThreadInput,
  SendMessageInput,
  CloseThreadInput,
  ListThreadsQuery,
  ReadMessagesQuery,
  StatusResponse,
  ThreadWithStats,
  MessagesResponse,
} from '../types.js'

export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

/** Parse thread_id from string input — accepts "#3", "3", or plain number */
function parseThreadId(ref: string): number {
  const cleaned = ref.startsWith('#') ? ref.slice(1) : ref
  const id = parseInt(cleaned, 10)
  if (isNaN(id)) throw new ServiceError('Invalid thread ID', 400)
  return id
}

/** Parse participants JSON, compatible with old ["a"] and new [{"id":"a","role":"x"}] formats */
export function normalizeParticipants(raw: string): ParticipantEntry[] {
  const parsed: ParticipantItem[] = JSON.parse(raw)
  return parsed.map((item) => (typeof item === 'string' ? { id: item } : item))
}

/** Extract participant IDs from a ParticipantItem array */
function extractParticipantIds(items: ParticipantItem[]): string[] {
  return items.map((item) => (typeof item === 'string' ? item : item.id))
}

/** Normalize input participants to ParticipantEntry[] for storage */
function toParticipantEntries(items: ParticipantItem[]): ParticipantEntry[] {
  return items.map((item) => (typeof item === 'string' ? { id: item } : item))
}

export async function getStatus(db: D1Database): Promise<StatusResponse> {
  const [profiles, threads, messages] = await db.batch([
    db.prepare('SELECT COUNT(*) as count FROM profiles'),
    db.prepare('SELECT COUNT(*) as count FROM threads'),
    db.prepare('SELECT COUNT(*) as count FROM messages'),
  ])

  return {
    name: 'Agent-IM',
    version: '0.3.0',
    status: 'ok',
    profiles_count: (profiles.results[0] as { count: number }).count,
    threads_count: (threads.results[0] as { count: number }).count,
    messages_count: (messages.results[0] as { count: number }).count,
  }
}

export async function upsertProfile(
  db: D1Database,
  input: UpsertProfileInput,
): Promise<{ profile: ProfileRow; created: boolean }> {
  if (!input.id) throw new ServiceError('id is required', 400)

  const existing = await db
    .prepare('SELECT * FROM profiles WHERE id = ?')
    .bind(input.id)
    .first<ProfileRow>()

  if (existing) {
    await db
      .prepare('UPDATE profiles SET display_name = ?, role = ?, description = ? WHERE id = ?')
      .bind(
        input.display_name ?? existing.display_name,
        input.role ?? existing.role,
        input.description ?? existing.description,
        input.id,
      )
      .run()

    const updated = await db
      .prepare('SELECT * FROM profiles WHERE id = ?')
      .bind(input.id)
      .first<ProfileRow>()
    return { profile: updated!, created: false }
  }

  await db
    .prepare('INSERT INTO profiles (id, display_name, role, description) VALUES (?, ?, ?, ?)')
    .bind(
      input.id,
      input.display_name ?? input.id,
      input.role ?? 'agent',
      input.description ?? null,
    )
    .run()

  const profile = await db
    .prepare('SELECT * FROM profiles WHERE id = ?')
    .bind(input.id)
    .first<ProfileRow>()
  return { profile: profile!, created: true }
}

export async function listProfiles(db: D1Database): Promise<ProfileRow[]> {
  const result = await db
    .prepare('SELECT * FROM profiles ORDER BY created_at DESC')
    .all<ProfileRow>()
  return result.results
}

export async function createThread(db: D1Database, input: CreateThreadInput): Promise<ThreadRow> {
  if (!input.topic) throw new ServiceError('topic is required', 400)
  if (!input.participants?.length) throw new ServiceError('participants is required', 400)

  const participants = toParticipantEntries(input.participants)

  const result = await db
    .prepare('INSERT INTO threads (topic, description, participants) VALUES (?, ?, ?)')
    .bind(input.topic, input.description ?? null, JSON.stringify(participants))
    .run()

  const thread = await db
    .prepare('SELECT * FROM threads WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first<ThreadRow>()
  return thread!
}

export async function listThreads(
  db: D1Database,
  query: ListThreadsQuery,
): Promise<ThreadWithStats[]> {
  const conditions: string[] = []
  const binds: string[] = []

  // Filter by participant unless include_all is set
  // Compatible with both old ["a"] and new [{"id":"a"}] formats
  if (!query.include_all) {
    conditions.push(
      "EXISTS (SELECT 1 FROM json_each(t.participants) AS je WHERE je.value = ? OR json_extract(je.value, '$.id') = ?)",
    )
    binds.push(query.profile_id, query.profile_id)
  }

  // Filter by status: default open only, unless include_closed
  if (!query.include_closed) {
    conditions.push("t.status = 'open'")
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const result = await db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) as message_count,
        (SELECT MAX(m.created_at) FROM messages m WHERE m.thread_id = t.id) as last_message_at
      FROM threads t
      ${where}
      ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.updated_at DESC`,
    )
    .bind(...binds)
    .all<ThreadWithStats>()
  return result.results
}

export async function getThread(db: D1Database, id: number): Promise<ThreadRow | null> {
  return db.prepare('SELECT * FROM threads WHERE id = ?').bind(id).first<ThreadRow>()
}

/** Ensure a profile exists for the given sender, auto-creating if needed */
async function ensureProfile(db: D1Database, senderId: string): Promise<void> {
  const existing = await db.prepare('SELECT id FROM profiles WHERE id = ?').bind(senderId).first()
  if (!existing) {
    await db
      .prepare('INSERT INTO profiles (id, display_name, role) VALUES (?, ?, ?)')
      .bind(senderId, senderId, 'agent')
      .run()
  }
}

export async function sendMessage(
  db: D1Database,
  threadRef: string,
  input: SendMessageInput,
): Promise<MessageRow> {
  if (!input.from) throw new ServiceError('from is required', 400)
  if (!input.content) throw new ServiceError('content is required', 400)

  const threadId = parseThreadId(threadRef)
  const thread = await getThread(db, threadId)
  if (!thread) throw new ServiceError('Thread not found', 404)
  if (thread.status !== 'open') throw new ServiceError('Thread is closed', 400)

  // Validate reply_to if provided
  if (input.reply_to) {
    const replyMsg = await db
      .prepare('SELECT id, thread_id FROM messages WHERE id = ?')
      .bind(input.reply_to)
      .first<{ id: string; thread_id: number }>()
    if (!replyMsg) throw new ServiceError('Reply target message not found', 404)
    if (replyMsg.thread_id !== threadId)
      throw new ServiceError('Reply target must be in the same thread', 400)
  }

  await ensureProfile(db, input.from)

  const id = messageId()
  const readBy = JSON.stringify([input.from])

  await db.batch([
    db
      .prepare(
        'INSERT INTO messages (id, thread_id, sender, content, reply_to, read_by) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(id, threadId, input.from, input.content, input.reply_to ?? null, readBy),
    db.prepare("UPDATE threads SET updated_at = datetime('now') WHERE id = ?").bind(threadId),
  ])

  const message = await db
    .prepare('SELECT * FROM messages WHERE id = ?')
    .bind(id)
    .first<MessageRow>()
  return message!
}

export async function readMessages(
  db: D1Database,
  threadRef: string,
  query: ReadMessagesQuery,
): Promise<MessagesResponse> {
  const threadId = parseThreadId(threadRef)
  const thread = await getThread(db, threadId)
  if (!thread) throw new ServiceError('Thread not found', 404)

  const limit = Math.min(Math.max(query.limit ?? 5, 1), 50)

  // Build query conditions
  const conditions: string[] = ['thread_id = ?']
  const binds: (string | number)[] = [threadId]

  if (query.since) {
    conditions.push('created_at > ?')
    binds.push(query.since)
  }
  if (query.before) {
    conditions.push('created_at < ?')
    binds.push(query.before)
  }

  const where = conditions.join(' AND ')

  // Get total count for remaining_count
  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM messages WHERE ${where}`)
    .bind(...binds)
    .first<{ count: number }>()
  const totalCount = countResult?.count ?? 0

  // Fetch messages: DESC to get latest, then reverse for chronological order
  const result = await db
    .prepare(`SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC LIMIT ?`)
    .bind(...binds, limit)
    .all<MessageRow>()

  const messages = result.results.reverse()

  // Update read_by for each message if reader is provided
  if (query.reader && messages.length > 0) {
    const updates = messages
      .filter((msg) => {
        const readBy: string[] = JSON.parse(msg.read_by)
        return !readBy.includes(query.reader)
      })
      .map((msg) => {
        const readBy: string[] = JSON.parse(msg.read_by)
        readBy.push(query.reader)
        return db
          .prepare('UPDATE messages SET read_by = ? WHERE id = ?')
          .bind(JSON.stringify(readBy), msg.id)
      })

    if (updates.length > 0) {
      await db.batch(updates)
    }

    // Update read_by in returned messages
    for (const msg of messages) {
      const readBy: string[] = JSON.parse(msg.read_by)
      if (!readBy.includes(query.reader)) {
        readBy.push(query.reader)
        msg.read_by = JSON.stringify(readBy)
      }
    }
  }

  return {
    thread_id: threadId,
    messages,
    has_more: totalCount > limit,
    remaining_count: Math.max(totalCount - limit, 0),
  }
}

export async function closeThread(
  db: D1Database,
  threadRef: string,
  input: CloseThreadInput,
): Promise<ThreadRow> {
  const threadId = parseThreadId(threadRef)
  const thread = await getThread(db, threadId)
  if (!thread) throw new ServiceError('Thread not found', 404)
  if (thread.status === 'closed') throw new ServiceError('Thread is already closed', 400)

  if (!input.closed_by) throw new ServiceError('closed_by is required', 400)

  const closeMsgId = messageId()
  const closeMsgContent = `[CLOSED] ${input.reason || 'No reason provided'}`

  await ensureProfile(db, input.closed_by)

  await db.batch([
    db
      .prepare("UPDATE threads SET status = 'closed', updated_at = datetime('now') WHERE id = ?")
      .bind(threadId),
    db
      .prepare(
        'INSERT INTO messages (id, thread_id, sender, content, read_by) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(
        closeMsgId,
        threadId,
        input.closed_by,
        closeMsgContent,
        JSON.stringify([input.closed_by]),
      ),
  ])

  const updated = await db
    .prepare('SELECT * FROM threads WHERE id = ?')
    .bind(threadId)
    .first<ThreadRow>()
  return updated!
}

export async function deleteMessage(db: D1Database, msgId: string): Promise<void> {
  const message = await db
    .prepare('SELECT * FROM messages WHERE id = ?')
    .bind(msgId)
    .first<MessageRow>()
  if (!message) throw new ServiceError('Message not found', 404)

  await db.prepare('DELETE FROM messages WHERE id = ?').bind(msgId).run()
}
