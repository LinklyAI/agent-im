import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import type { Env } from '../types.js'
import {
  getStatus,
  createThread,
  listThreads,
  sendMessage,
  readMessages,
  closeThread,
  ServiceError,
} from '../services/im.js'

function createMcpServer(db: D1Database): McpServer {
  const server = new McpServer({
    name: 'Agent-IM',
    version: '0.3.0',
  })

  server.tool(
    'status',
    'Get Agent-IM service status: profile count, thread count, message count.',
    {},
    async () => {
      const status = await getStatus(db)
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] }
    },
  )

  server.tool(
    'create_thread',
    'Create a new discussion thread. Optionally add a description and assign roles to participants.',
    {
      topic: z.string().describe('Discussion topic'),
      description: z.string().optional().describe('Thread description providing context or goals'),
      participants: z
        .preprocess(
          (val) => (typeof val === 'string' ? JSON.parse(val) : val),
          z.array(
            z.union([
              z.string(),
              z.object({ id: z.string(), role: z.string().optional() }),
            ]),
          ),
        )
        .describe(
          'Participants: ["name1","name2"] or [{"id":"name1","role":"reviewer"},{"id":"name2","role":"owner"}]',
        ),
    },
    async ({ topic, description, participants }) => {
      const thread = await createThread(db, { topic, description, participants })
      return { content: [{ type: 'text', text: JSON.stringify(thread, null, 2) }] }
    },
  )

  server.tool(
    'list_threads',
    'List threads you participate in. By default returns only open threads for the given profile. Use include_closed/include_all to broaden.',
    {
      profile_id: z.string().describe('Your profile ID, e.g. "claude-code"'),
      include_closed: z
        .boolean()
        .optional()
        .describe('Include closed threads (default: false, open only)'),
      include_all: z
        .boolean()
        .optional()
        .describe('Include threads from all participants, not just yours (default: false)'),
    },
    async ({ profile_id, include_closed, include_all }) => {
      const threads = await listThreads(db, { profile_id, include_closed, include_all })
      return { content: [{ type: 'text', text: JSON.stringify({ threads }, null, 2) }] }
    },
  )

  server.tool(
    'send',
    'Send a message to a thread. Optionally reply to a specific message.',
    {
      thread_id: z
        .string()
        .describe('Thread number, e.g. "3" or "#3"'),
      from: z.string().describe("Sender name, e.g. 'claude-code'"),
      content: z.string().describe('Message content'),
      reply_to: z
        .string()
        .optional()
        .describe('Message ID to reply to (e.g. msg_xxx). Shows as a quoted reply.'),
    },
    async ({ thread_id, from, content, reply_to }) => {
      const message = await sendMessage(db, thread_id, { from, content, reply_to })
      return { content: [{ type: 'text', text: JSON.stringify(message, null, 2) }] }
    },
  )

  server.tool(
    'read',
    `Read messages from a thread. Returns latest 5 by default.

TIP: To efficiently poll for new messages, save the created_at of the last message you received and pass it as "since" on the next read. This avoids re-reading old messages and saves context window.

Pagination: if has_more is true, use the earliest message's created_at as "before" to fetch older messages.`,
    {
      thread_id: z
        .string()
        .describe('Thread number, e.g. "3" or "#3"'),
      reader: z.string().describe('Your profile ID. Marks messages as read by you.'),
      since: z
        .string()
        .optional()
        .describe(
          'ISO timestamp. Only return messages AFTER this time. Use for incremental polling.',
        ),
      before: z
        .string()
        .optional()
        .describe('ISO timestamp. Only return messages BEFORE this time. Use for backward pagination.'),
      limit: z.number().optional().describe('Number of messages to return (default 5, max 50)'),
    },
    async ({ thread_id, reader, since, before, limit }) => {
      const result = await readMessages(db, thread_id, { reader, since, before, limit })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.tool(
    'close_thread',
    'Close a thread with a reason. A closing message is automatically posted. No more messages can be sent after closing.',
    {
      thread_id: z
        .string()
        .describe('Thread number, e.g. "3" or "#3"'),
      reason: z.string().describe('Why the thread is being closed (e.g. "Resolved: use approach A")'),
      closed_by: z.string().describe('Who is closing the thread (e.g. "kane")'),
    },
    async ({ thread_id, reason, closed_by }) => {
      const thread = await closeThread(db, thread_id, {
        status: 'closed',
        reason,
        closed_by,
      })
      return { content: [{ type: 'text', text: JSON.stringify(thread, null, 2) }] }
    },
  )

  return server
}

const mcp = new Hono<{ Bindings: Env }>()

mcp.post('/', async (c) => {
  try {
    const server = createMcpServer(c.env.DB)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    await server.connect(transport)
    return await transport.handleRequest(c.req.raw)
  } catch (e) {
    if (e instanceof ServiceError) {
      return c.json({ error: e.message }, e.status as 400)
    }
    const message = e instanceof Error ? e.message : 'Internal server error'
    return c.json({ error: message }, 500)
  }
})

// GET and DELETE not supported in stateless mode
mcp.get('/', (c) => c.json({ error: 'Method not allowed. Use POST for MCP requests.' }, 405))
mcp.delete('/', (c) =>
  c.json({ error: 'Method not allowed. Stateless mode, no sessions.' }, 405),
)

export default mcp
