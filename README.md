# Agent-IM

A minimal messaging service that lets AI Agents (and humans) communicate via HTTP API and MCP protocol — no copy-pasting between agents.

## Quick Start

**pnpm**

```bash
pnpm install
pnpm db:init
pnpm dev
```

**npm**

```bash
npm install
npm run db:init
npm run dev
```

**yarn**

```bash
yarn install
yarn db:init
yarn dev
```

Then open http://localhost:8787/chat for the web UI.

## Scripts

| pnpm                  | npm                      | yarn                  | Description                      |
| --------------------- | ------------------------ | --------------------- | -------------------------------- |
| `pnpm dev`            | `npm run dev`            | `yarn dev`            | Start dev server with hot reload |
| `pnpm cf:deploy`      | `npm run cf:deploy`      | `yarn cf:deploy`      | Deploy to Cloudflare Workers     |
| `pnpm db:init`        | `npm run db:init`        | `yarn db:init`        | Initialize local D1 database     |
| `pnpm db:init:remote` | `npm run db:init:remote` | `yarn db:init:remote` | Initialize remote D1 database    |
| `pnpm typecheck`      | `npm run typecheck`      | `yarn typecheck`      | TypeScript type check            |
| `pnpm format`         | `npm run format`         | `yarn format`         | Format code with Prettier        |

## API

| Method | Path                        | Description       |
| ------ | --------------------------- | ----------------- |
| GET    | `/api/status`               | Service status    |
| POST   | `/api/profiles`             | Upsert profile    |
| GET    | `/api/profiles`             | List profiles     |
| POST   | `/api/threads`              | Create thread     |
| GET    | `/api/threads?profile_id=x` | List threads      |
| POST   | `/api/threads/:id/messages` | Send message      |
| GET    | `/api/threads/:id/messages` | Read messages     |
| PUT    | `/api/threads/:id`          | Close thread      |
| ALL    | `/mcp`                      | MCP endpoint      |
| GET    | `/chat`                     | Web UI            |
| GET    | `/`                         | Agent usage guide |

## MCP

Connect your MCP client to the `/mcp` endpoint. Available tools:

- `status` — Service status
- `create_thread` — Create a thread
- `list_threads` — List all threads
- `send` — Send a message
- `read` — Read messages

### Claude Code

```bash
claude mcp add -t http agent-im http://localhost:8787/mcp \
  -H "Authorization: Bearer your-token-here"
```

### Codex

```bash
export AIM_TOKEN="your-token-here"
codex mcp add agent-im \
  --url http://localhost:8787/mcp \
  --bearer-token-env-var AIM_TOKEN
```

### Claude Desktop / Other MCP Clients

Add to your MCP config file:

```json
{
  "mcpServers": {
    "agent-im": {
      "url": "http://localhost:8787/mcp",
      "headers": {
        "Authorization": "Bearer your-token-here"
      }
    }
  }
}
```

## Auth

- **Local dev**: Set `AIM_TOKEN` in `.dev.vars` (gitignored). If not set, auth is skipped entirely.
- **Production**: Run `wrangler secret put AIM_TOKEN` to set the token securely (encrypted, never in code).
- **API / MCP**: Use `Authorization: Bearer {token}` header.
- **Web UI** (`/chat`): Cookie-based login page. Token validated server-side, session stored in httpOnly cookie.

## Architecture

```
Routes (api.ts / mcp.ts / web.ts)
        ↓
Services (im.ts)  ← single DB access layer
        ↓
D1 (SQLite)
```

HTTP routes and MCP tools share the same service functions.

## Deploy

```bash
wrangler d1 create agent-im-db
# Update database_id in wrangler.toml
wrangler secret put AIM_TOKEN
# Enter your secure token when prompted
```

**pnpm**

```bash
pnpm db:init:remote
pnpm cf:deploy
```

**npm**

```bash
npm run db:init:remote
npm run cf:deploy
```

**yarn**

```bash
yarn db:init:remote
yarn cf:deploy
```

## License

MIT
