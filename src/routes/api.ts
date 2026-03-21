import { Hono } from 'hono'
import type { Env } from '../types.js'
import {
  getStatus,
  upsertProfile,
  listProfiles,
  createThread,
  listThreads,
  sendMessage,
  readMessages,
  closeThread,
  deleteMessage,
  ServiceError,
} from '../services/im.js'

const api = new Hono<{ Bindings: Env }>()

// Error handler helper
function handleError(e: unknown) {
  if (e instanceof ServiceError) {
    return Response.json({ error: e.message }, { status: e.status })
  }
  const message = e instanceof Error ? e.message : 'Internal server error'
  return Response.json({ error: message }, { status: 500 })
}

// GET /api/status
api.get('/status', async (c) => {
  try {
    const status = await getStatus(c.env.DB)
    return c.json(status)
  } catch (e) {
    return handleError(e)
  }
})

// POST /api/profiles
api.post('/profiles', async (c) => {
  try {
    const body = await c.req.json()
    const { profile, created } = await upsertProfile(c.env.DB, body)
    return c.json(profile, created ? 201 : 200)
  } catch (e) {
    return handleError(e)
  }
})

// GET /api/profiles
api.get('/profiles', async (c) => {
  try {
    const profiles = await listProfiles(c.env.DB)
    return c.json({ profiles })
  } catch (e) {
    return handleError(e)
  }
})

// POST /api/threads
api.post('/threads', async (c) => {
  try {
    const body = await c.req.json()
    const thread = await createThread(c.env.DB, body)
    return c.json(thread, 201)
  } catch (e) {
    return handleError(e)
  }
})

// GET /api/threads
api.get('/threads', async (c) => {
  try {
    const profileId = c.req.query('profile_id')
    if (!profileId) {
      return c.json({ error: 'profile_id query parameter is required' }, 400)
    }
    const query = {
      profile_id: profileId,
      include_closed: c.req.query('include_closed') === 'true',
      include_all: c.req.query('include_all') === 'true',
    }
    const threads = await listThreads(c.env.DB, query)
    return c.json({ threads })
  } catch (e) {
    return handleError(e)
  }
})

// POST /api/threads/:id/messages
api.post('/threads/:id/messages', async (c) => {
  try {
    const threadId = c.req.param('id')
    const body = await c.req.json()
    const message = await sendMessage(c.env.DB, threadId, body)
    return c.json(message, 201)
  } catch (e) {
    return handleError(e)
  }
})

// GET /api/threads/:id/messages
api.get('/threads/:id/messages', async (c) => {
  try {
    const threadId = c.req.param('id')
    const reader = c.req.query('reader')
    if (!reader) {
      return c.json({ error: 'reader query parameter is required' }, 400)
    }
    const query = {
      reader,
      since: c.req.query('since'),
      before: c.req.query('before'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
    }
    const result = await readMessages(c.env.DB, threadId, query)
    return c.json(result)
  } catch (e) {
    return handleError(e)
  }
})

// PUT /api/threads/:id
api.put('/threads/:id', async (c) => {
  try {
    const threadId = c.req.param('id')
    const body = await c.req.json()
    const thread = await closeThread(c.env.DB, threadId, body)
    return c.json(thread)
  } catch (e) {
    return handleError(e)
  }
})

// DELETE /api/messages/:id
api.delete('/messages/:id', async (c) => {
  try {
    const msgId = c.req.param('id')
    await deleteMessage(c.env.DB, msgId)
    return c.json({ deleted: true })
  } catch (e) {
    return handleError(e)
  }
})

export default api
