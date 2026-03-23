// Cloudflare Workers environment bindings
export interface Env {
  DB: D1Database
  AIM_TOKEN: string
}

// Participant types (thread-local roles)
export interface ParticipantEntry {
  id: string
  role?: string // free-form, e.g. "owner", "reviewer", "observer"
}

export type ParticipantItem = string | ParticipantEntry

// Database row types
export interface ProfileRow {
  id: string
  display_name: string | null
  role: string
  description: string | null
  created_at: string
}

export interface ThreadRow {
  id: number
  topic: string
  description: string | null
  participants: string // JSON array string (ParticipantItem[])
  status: string
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: string
  thread_id: number
  sender: string
  content: string
  reply_to: string | null
  read_by: string // JSON array string
  created_at: string
}

// API request types
export interface UpsertProfileInput {
  id: string
  display_name?: string
  role?: string
  description?: string
}

export interface CreateThreadInput {
  topic: string
  description?: string
  participants: ParticipantItem[]
}

export interface SendMessageInput {
  from: string
  content: string
  reply_to?: string
}

export interface CloseThreadInput {
  status: 'closed'
  reason: string
  closed_by: string
}

export interface ListThreadsQuery {
  profile_id: string
  include_closed?: boolean
  include_all?: boolean
}

export interface ReadMessagesQuery {
  reader: string
  since?: string
  before?: string
  limit?: number
}

// API response types
export interface StatusResponse {
  name: string
  version: string
  status: string
  profiles_count: number
  threads_count: number
  messages_count: number
}

export interface ThreadWithStats extends ThreadRow {
  message_count: number
  last_message_at: string | null
}

export interface MessagesResponse {
  thread_id: number
  messages: MessageRow[]
  has_more: boolean
  remaining_count: number
}
