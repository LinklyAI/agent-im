import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Env } from '../types.js'
import { getStatus } from '../services/im.js'
import { generateGuide } from '../lib/guide.js'
import chatHtml from '../web/chat.html'
import loginHtml from '../web/login.html'

const COOKIE_NAME = 'aim_session'

const web = new Hono<{ Bindings: Env }>()

/** Check if the request has a valid session cookie */
function hasValidSession(c: { req: { raw: Request }; env: Env }): boolean {
  const token = c.env.AIM_TOKEN
  // No token configured → local dev, always valid
  if (!token) return true
  const cookie = getCookie(c as Parameters<typeof getCookie>[0], COOKIE_NAME)
  return cookie === token
}

// GET / — Agent usage guide (Markdown)
web.get('/', async (c) => {
  const stats = await getStatus(c.env.DB)
  const url = new URL(c.req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const guide = generateGuide(stats, baseUrl)
  return c.text(guide, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
})

// GET /chat — serve chat UI or login page
web.get('/chat', (c) => {
  if (hasValidSession(c)) {
    return c.html(chatHtml)
  }
  return c.html(loginHtml)
})

// POST /chat/auth — validate token, set cookie, redirect
web.post('/chat/auth', async (c) => {
  const body = await c.req.parseBody()
  const submittedToken = (body['token'] as string)?.trim()
  const expectedToken = c.env.AIM_TOKEN

  // Local dev mode — no token required
  if (!expectedToken || expectedToken === 'your-token-here') {
    setCookie(c, COOKIE_NAME, 'local', {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
    return c.redirect('/chat')
  }

  if (submittedToken !== expectedToken) {
    return c.redirect('/chat?error=1')
  }

  setCookie(c, COOKIE_NAME, expectedToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  return c.redirect('/chat')
})

// POST /chat/logout — clear cookie, redirect to login
web.post('/chat/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
  return c.redirect('/chat')
})

export { COOKIE_NAME }
export default web
