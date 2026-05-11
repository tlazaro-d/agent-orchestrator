---
"@aoagents/ao-web": patch
---

fix(web): bind dashboard and terminal WebSocket to `127.0.0.1` by default

Both the Next.js dashboard (port 3000) and the direct-terminal WebSocket (port 14801) previously called `server.listen(PORT)` / `next start -p PORT` without an explicit host, which on Node and Next.js defaults to all interfaces (`::` / `0.0.0.0`). On a machine reachable over a LAN, Tailscale, or VPN, that exposed both ports without authentication. The terminal WebSocket upgrade handler only validates the pathname (`/mux`) — there is no auth token, no origin check, no session validation — so any peer reaching the port can attach to a running agent's terminal.

This change defaults both servers to `127.0.0.1`. To restore the previous wide-open binding (e.g. to access the dashboard over Tailscale), set `AO_BIND_HOST=0.0.0.0`, or bind to a specific interface IP. The README's "Remote Access" section documents the new env var and warns that the terminal WebSocket has no auth, so widening the bind requires a trusted network or a reverse proxy in front.

Affected entry points:
- `packages/web/server/direct-terminal-ws.ts` — production WS server (`ao start` via `start:all`)
- `packages/web/server/start-all.ts` — production Next.js launcher (`ao start`)
- `packages/web/package.json` scripts `dev:next` and `start`
