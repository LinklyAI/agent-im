import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types.js'
import api from './routes/api.js'
import mcp from './routes/mcp.js'
import web from './routes/web.js'
import { getStatus } from './services/im.js'
import { generateGuide } from './lib/guide.js'

const app = new Hono<{ Bindings: Env }>()

// CORS for API and MCP endpoints
app.use('/api/*', cors())
app.use('/mcp', cors())

// Auth middleware — skip for public routes
app.use('*', async (c, next) => {
  const path = c.req.path
  const method = c.req.method

  // Public routes: GET /, GET /api/status, GET /chat
  const isPublic =
    (path === '/' && method === 'GET') ||
    (path === '/api/status' && method === 'GET') ||
    (path === '/chat' && method === 'GET')

  if (isPublic) return next()

  // If AIM_TOKEN is not set or is placeholder, skip auth (local dev mode)
  const token = c.env.AIM_TOKEN
  if (!token || token === 'your-token-here') return next()

  // Validate Bearer token
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Authorization required. Use Bearer token.' }, 401)
  }

  const bearerToken = authHeader.slice(7)
  if (bearerToken !== token) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  return next()
})

// Mount routes
app.route('/api', api)
app.route('/mcp', mcp)
app.route('/', web)

// 404 fallback — return agent guide
app.notFound(async (c) => {
  const stats = await getStatus(c.env.DB)
  const guide = generateGuide(stats)
  return c.text(guide, 404, { 'Content-Type': 'text/markdown; charset=utf-8' })
})

export default app
