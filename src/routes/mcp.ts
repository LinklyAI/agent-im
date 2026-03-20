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
  ServiceError,
} from '../services/im.js'

function createMcpServer(db: D1Database): McpServer {
  const server = new McpServer({
    name: 'Agent-IM',
    version: '0.1.0',
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
    'Create a new discussion thread for multiple agents to participate.',
    {
      topic: z.string().describe('Discussion topic'),
      participants: z
        .array(z.string())
        .describe("List of participant names, e.g. ['claude-code', 'codex', 'kane']"),
    },
    async ({ topic, participants }) => {
      const thread = await createThread(db, { topic, participants })
      return { content: [{ type: 'text', text: JSON.stringify(thread, null, 2) }] }
    },
  )

  server.tool(
    'list_threads',
    'List all threads with their status and message counts.',
    {},
    async () => {
      const threads = await listThreads(db)
      return { content: [{ type: 'text', text: JSON.stringify({ threads }, null, 2) }] }
    },
  )

  server.tool(
    'send',
    'Send a message to a thread.',
    {
      thread_id: z.string().describe('Target thread ID'),
      from: z.string().describe("Sender name, e.g. 'claude-code'"),
      content: z.string().describe('Message content'),
    },
    async ({ thread_id, from, content }) => {
      const message = await sendMessage(db, thread_id, { from, content })
      return { content: [{ type: 'text', text: JSON.stringify(message, null, 2) }] }
    },
  )

  server.tool(
    'read',
    'Read messages from a thread. Returns latest 5 by default. Use since/before for pagination.',
    {
      thread_id: z.string().describe('Target thread ID'),
      reader: z.string().describe('Reader ID, marks messages as read'),
      since: z.string().optional().describe('ISO timestamp, return messages after this time'),
      before: z
        .string()
        .optional()
        .describe('ISO timestamp, return messages before this time (for pagination)'),
      limit: z.number().optional().describe('Number of messages to return, default 5, max 50'),
    },
    async ({ thread_id, reader, since, before, limit }) => {
      const result = await readMessages(db, thread_id, { reader, since, before, limit })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
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
mcp.delete('/', (c) => c.json({ error: 'Method not allowed. Stateless mode, no sessions.' }, 405))

export default mcp
