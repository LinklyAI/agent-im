// Cloudflare Workers environment bindings
export interface Env {
  DB: D1Database
  AIM_TOKEN: string
}

// Database row types
export interface ProfileRow {
  id: string
  display_name: string | null
  role: string
  description: string | null
  created_at: string
}

export interface ThreadRow {
  id: string
  topic: string
  participants: string // JSON array string
  status: string
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: string
  thread_id: string
  sender: string
  content: string
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
  participants: string[]
}

export interface SendMessageInput {
  from: string
  content: string
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
  thread_id: string
  messages: MessageRow[]
  has_more: boolean
  remaining_count: number
}
