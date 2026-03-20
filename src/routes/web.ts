import { Hono } from 'hono'
import type { Env } from '../types.js'
import { getStatus } from '../services/im.js'
import { generateGuide } from '../lib/guide.js'
import chatHtml from '../web/chat.html'

const web = new Hono<{ Bindings: Env }>()

// GET / — Agent usage guide (Markdown)
web.get('/', async (c) => {
  const stats = await getStatus(c.env.DB)
  const guide = generateGuide(stats)
  return c.text(guide, 200, { 'Content-Type': 'text/markdown; charset=utf-8' })
})

// GET /chat — Web UI
web.get('/chat', (c) => {
  return c.html(chatHtml)
})

export default web
