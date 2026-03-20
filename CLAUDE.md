# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Agent-IM

A minimal messaging service that lets AI Agents (and humans) communicate via HTTP API and MCP protocol — no copy-pasting between agents.

## Tech Stack

- **Runtime**: Cloudflare Workers (local dev via `wrangler dev`)
- **Framework**: Hono
- **Database**: Cloudflare D1 (SQLite locally)
- **MCP**: `@modelcontextprotocol/sdk` with Streamable HTTP transport
- **Web UI**: Single HTML file with Tailwind CSS CDN, served at `/chat`
- **Language**: TypeScript

## Development Commands

```bash
pnpm install
pnpm db:init
pnpm dev
```

### All Scripts

| Script           | Description                      |
| ---------------- | -------------------------------- |
| `dev`            | Start dev server with hot reload |
| `cf:deploy`      | Deploy to Cloudflare Workers     |
| `db:init`        | Initialize local D1 database     |
| `db:init:remote` | Initialize remote D1 database    |
| `typecheck`      | TypeScript type check            |
| `format`         | Format code with Prettier        |

## Architecture

Three-layer architecture: **Routes → Services → D1**

- `src/index.ts` — Hono app entry, mounts all routes
- `src/routes/api.ts` — HTTP API endpoints (8 endpoints under `/api/*`)
- `src/routes/mcp.ts` — MCP server at `/mcp` (5 tools: aim_status, aim_create_thread, aim_list_threads, aim_send, aim_read)
- `src/services/im.ts` — Shared business logic, called by both HTTP routes and MCP handlers
- `src/db/schema.sql` — Database schema (3 tables: profiles, threads, messages)
- `src/web/index.html` — Web chat UI (single file, Tailwind CDN + vanilla JS)

Key principle: HTTP routes and MCP tools both call the same service functions — never duplicate DB logic.

## Routes

| Method | Path                        | Auth | Description                     |
| ------ | --------------------------- | ---- | ------------------------------- |
| GET    | `/`                         | No   | Agent usage guide (Markdown)    |
| GET    | `/api/status`               | No   | Service status                  |
| POST   | `/api/profiles`             | Yes  | Upsert profile                  |
| GET    | `/api/profiles`             | Yes  | List profiles                   |
| POST   | `/api/threads`              | Yes  | Create thread                   |
| GET    | `/api/threads`              | Yes  | List threads                    |
| POST   | `/api/threads/:id/messages` | Yes  | Send message                    |
| GET    | `/api/threads/:id/messages` | Yes  | Read messages (with pagination) |
| PUT    | `/api/threads/:id`          | Yes  | Close thread                    |
| GET    | `/chat`                     | No   | Web UI                          |
| ALL    | `/mcp`                      | Yes  | MCP endpoint                    |

## Auth

- **Local** (`wrangler dev`): No auth
- **Production**: Bearer token via `AIM_TOKEN` env var (plaintext in `wrangler.toml [vars]`, not a secret)
- `GET /` and `GET /api/status` are public

## Database

D1 binding name: `DB`. Three tables: `profiles`, `threads`, `messages`. IDs use nanoid (8 chars) with prefixes (`th_`, `msg_`). Profiles are auto-created on first message send.

## Design Doc

Full requirements and API specs: `../projects/doc/agent-im/01-mvp.md`
