# Control Room HTTP API

The hub listens on `bind:port` from the config (default `127.0.0.1:3070`). Two surfaces:

- **Browser API** (`/api/*`), cookie session `cmdsess` (HttpOnly, SameSite=Strict; `Secure` when `publicUrl` is https).
- **Agent API** (`/internal/*`), used by the `cmd` CLI, header `x-cmd-token: <dataDir>/internal.token`, body JSON
  `{ me: "<agent id>|you", ...args }`.

All bodies are JSON. Errors: `{ error: "<text>" }` with 4xx.

## Setup (first run)

Step 1 needs no session and only works while no admin exists; every later step needs the admin's session. Until the
wizard is finished, `/` redirects the admin to `/setup`.

| Route | |
|---|---|
| `GET /setup` | wizard page (redirects to `/` once set up) |
| `GET /api/setup/state` | `{ needed, done, signedIn, admin, mfa, demo }` |
| `POST /api/setup/admin` | `{ name, password }` -> `{ ok, mfa: { secret, otpauth } }` (starts the admin's session) |
| `POST /api/setup/mfa` | `{ code }` -> `{ ok, recovery: [10 codes] }`; `{ skip: true }`; `{ restart: true }` -> a new secret |
| `GET /api/setup/detect` | detection report (`src/detect.js`): `{ claude, configDirs, running, projects, tmux }` |
| `POST /api/setup/proposal` | `{ include: { projects: [cwd], adopt: [pid], accounts: [id] } }` -> `{ nodes, config, hooks: [{ account, file, exists, change, diff }], cli, configFile }`. Writes nothing. |
| `POST /api/setup/apply` | `{ nodes, config, hooks: [account ids to write], installCli }` -> `{ ok, config, configBackup, hooks: [{ file, backup }], cli, nodes }` |
| `POST /api/setup/skip` | finish without applying (empty map) |

## Browser API

| Route | Shape |
|---|---|
| `GET /login`, `POST /api/login {password, name?}` -> `{ ok }` or `{ mfa: true, ticket }`; `POST /api/login/mfa {ticket, code}` | |
| `POST /api/logout`, `POST /api/logout-others`, `POST /api/password {current, next}` | |
| `GET /invite`, `POST /api/invite/info|finish` | invite links for members |
| `GET /api/stream` | SSE: `tree` (snapshot), `history` (last events), `pulse` (one event), `live` (feed line), `livehist`, `tasks` `{v}`, `jobs` `{v}` |
| `GET /api/tree` | snapshot (below) |
| `GET /api/me` | public user |
| `POST /api/ui`, `POST /api/layout` | per-user UI state / honeycomb layout |
| `GET /api/chat/:id[?since=n&h=hash]` | `{ total, a, h, messages, queued, queuedNote, busy }` (ETag) |
| `GET /api/term/:id` | `{ screen, cursor, alive, cols, rows }` |
| `POST /api/keys/:id {data}` | raw keys into the agent's terminal |
| `POST /api/send {to, text, branch?}` | `{ to, result, task? }` |
| `POST /api/spawn {parent, name, role, cwd, brief}` | `{ id, reused }` |
| `POST /api/stop|start|restart|remove/:id` | `{ ok }` |
| `POST /api/branch/close|open/:id` | `{ ok, state }` |
| `POST /api/care/:id {kind: compact|clear}`, `POST /api/care {auto, compactAt}` | |
| `GET /api/server` | host CPU/mem/disk/load sample |
| `GET /api/agents` | Agents tab rows |
| `GET /api/queue` | Queue tab rows |
| `GET /api/tasks[?list=1...]`, `GET /api/tasks/:id`, `POST /api/tasks/:id/cancel|dismiss|followup` | |
| `GET /api/jobs`, `POST /api/jobs/:id/nudge|close|decide` | |
| `GET /api/actions`, `POST /api/actions/:id[/send|/ask|/close]` | decision cards |
| `GET /api/changelog` | `{ items, groups }` |
| `GET /api/rules`, `POST /api/rules/:id {on, sure?}` | |
| `GET /api/skills[?all=1]`, `POST /api/skills/:id/toggle`, `GET|POST /api/skills/:id/file?f=` | |
| `GET /api/settings` | `{ care, accounts, projects, agents, config }` |
| `POST /api/projects`, `POST /api/projects/:name/remove|lead` | project dirs (replace the old "sites") |
| `GET /api/users`, `POST /api/users/new`, `POST /api/users/:id[/password|/delete|/invite|/mfa-reset]` | |
| `POST /api/upload?name=`, `GET /api/upload/:day/:name` | chat attachments |

### Snapshot

```js
{
  nodes: [{ id, name, role, parent, cwd, account, state, sessionId, last, queued, subagents, createdAt, user,
            stoppedAt, ctx, care, parked, readOnly }],
  at, build, demo,                     // demo: true when the hub runs with fake agents
  actionsOpen, actionsAt,
  tokens: { at, periods: { today: { <id>: { t, cr, usd } }, week: {...}, month: {...} } },
  limits: [{ id, label, email, signedIn, running, short }],
  quiet: { on, until } | null,
  users: [{ id, uid, name, admin, desk }],
  me: { id, name, admin, desk, perms, layout, ui },
}
```

`state` is one of `working | idle | starting | login | offline | asleep | stopped`.
Roles: `brain` (top lead), `front` (a person's desk), `lead`, `project`, `subagent`, `worker`, `topic`.
