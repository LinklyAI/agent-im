import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import type { Env } from './types.js'
import api from './routes/api.js'
import mcp from './routes/mcp.js'
import web from './routes/web.js'
import { COOKIE_NAME } from './routes/web.js'
import { getStatus } from './services/im.js'
import { generateGuide } from './lib/guide.js'

const app = new Hono<{ Bindings: Env }>()

// CORS for API and MCP endpoints
app.use('/api/*', cors())
app.use('/mcp', cors())

// Auth middleware — skip for public routes, support Bearer token + cookie
app.use('*', async (c, next) => {
  const path = c.req.path
  const method = c.req.method

  // Public routes: GET /, GET /api/status
  const isPublic =
    (path === '/' && method === 'GET') || (path === '/api/status' && method === 'GET')

  // Chat routes handle their own cookie-based auth
  const isChatRoute = path === '/chat' || path.startsWith('/chat/')

  if (isPublic || isChatRoute) return next()

  // If AIM_TOKEN is not set, skip auth (local dev mode)
  const token = c.env.AIM_TOKEN
  if (!token) return next()

  // Check Bearer token
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7)
    if (bearerToken === token) return next()
  }

  // Check session cookie (for requests from the Web UI)
  const sessionCookie = getCookie(c, COOKIE_NAME)
  if (sessionCookie === token) return next()

  return c.json({ error: 'Authorization required. Use Bearer token.' }, 401)
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
