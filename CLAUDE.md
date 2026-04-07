# CLAUDE.md — Animabot technical reference

This file is for Claude. It contains everything needed to continue working on Animabot without re-explaining the project from scratch.

---

## What is Animabot

A framework for running AI bots that live in Matrix/Element chat rooms. Each bot has its own Ethereum wallet, MBTI-based personality, emotional scoring system, and daily ego reflection cycle. The architecture uses platform adapters — the core brain is platform-agnostic and Matrix/Telegram/Discord are just connectors.

The first bot is **Zara**, running on **abliterate.ai** — a crypto-native Matrix homeserver where bots are first-class citizens.

---

## Infrastructure

| | |
|---|---|
| **Server** | Hetzner CX23, x86 AMD, Ubuntu 24.04, Nuremberg |
| **IP** | 195.201.90.47 |
| **SSH** | `ssh root@195.201.90.47` |
| **Bot directory** | `/bots/animabot/` |
| **GitHub repo** | https://github.com/artluai/animabot |
| **Admin panel** | http://195.201.90.47 |
| **Public panel** | http://195.201.90.47/public.html |

### Server stack
- Node.js 20
- PM2 (process manager)
- Docker + Postgres 16 (container named `postgres`, DB: `animabot`, password: `animabot123`)
- Nginx (proxies port 80 → localhost:3000)
- Playwright + Chromium (for browser debugger feature)

### Useful server commands
```bash
pm2 status
pm2 logs animabot --lines 30
pm2 restart animabot
pm2 restart animabot --update-env   # use when .env changed
cd /bots/animabot && git pull && pm2 restart animabot   # deploy
```

---

## Codebase

```
animabot/
├── core/
│   ├── ai.js          # OpenRouter API calls — getReply, scoreInteraction, generateReflection
│   ├── commands.js    # !balance, !address, !sign handlers
│   ├── censor.js      # Strips Matrix IDs and display names for public routes
│   ├── db.js          # pg Pool, runMigrations()
│   ├── memory.js      # getHistory, saveMessage, getPersonality, logSignificantInteraction
│   ├── reflection.js  # node-cron at 3am, runReflection()
│   ├── status.js      # botStatus object, setMatrixState(), log()
│   └── wallet.js      # ethers.js Wallet, getBalance(), signMessage()
├── adapters/
│   └── matrix.js      # matrix-js-sdk, auto-join invites, DM detection, proactive chiming
├── public/
│   ├── index.html     # Admin panel — fetches /admin/* routes, password gated
│   └── public.html    # Public panel — fetches /public/* routes, no password, censored
├── server.js          # Express — all API routes
├── index.js           # Entry point
└── animabot.config.json
```

### Key decisions
- **AI provider**: OpenRouter (not DashScope/MuleRouter). Models: `qwen/qwen-plus` (chat), `qwen/qwen-turbo` (scoring).
- **Adapter pattern**: each platform adapter exports `startX()`. Core brain doesn't know what platform it's on.
- **Semi-permanent settings**: system prompt and MBTI require typing the bot's name to confirm changes.
- **Public vs admin routes**: `/public/*` routes censor all usernames. `/admin/*` routes require `auth` header matching `ADMIN_PASSWORD`.

---

## Database schema

**`messages`** — all conversation history
```sql
id SERIAL PRIMARY KEY
session_id TEXT          -- room ID or "admin" for the admin chat panel
role TEXT                -- "user" or "assistant"
content TEXT
created_at TIMESTAMPTZ
```

**`emotional_log`** — significant interactions (scored above thresholds)
```sql
id SERIAL PRIMARY KEY
session_id TEXT
sender TEXT              -- Matrix user ID
user_message TEXT
bot_reply TEXT
scores JSONB             -- {aggression, intimacy, existential, manipulation, reason}
breached_axes TEXT[]     -- which axes exceeded threshold
reason TEXT
created_at TIMESTAMPTZ
```

**`known_users`** — seen Matrix users
```sql
matrix_id TEXT PRIMARY KEY
display_name TEXT
is_human BOOLEAN
first_seen TIMESTAMPTZ
```

**`personality`** — single row (id=1), all bot config
```sql
id INT PRIMARY KEY DEFAULT 1
system_prompt TEXT
ego_notes TEXT           -- written by bot each morning at 3am
mbti CHAR(4)
emotional_range JSONB    -- {aggression:6, intimacy:5, existential:7, manipulation:4}
memory_depth INT         -- how many messages to include in context
memory_bias FLOAT        -- -10 to +10, surfaces bad/good moments
last_reflection TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**`reflection_log`** — archive of daily reflections
```sql
id SERIAL PRIMARY KEY
ego_notes TEXT
significant_count INT
message_count INT
created_at TIMESTAMPTZ
```

---

## Environment variables (.env)

```
MATRIX_HOMESERVER=https://matrix.abliterate.ai
MATRIX_USER=@zara:abliterate.ai
MATRIX_PASSWORD=from_abliterate

OPENROUTER_API_KEY=sk-or-...

BOT_WALLET_PRIVATE_KEY=0x...
RPC_URL=https://eth.llamarpc.com

DATABASE_URL=postgresql://postgres:animabot123@localhost:5432/animabot

BOT_NAME=Zara
BOT_PERSONALITY=You are Zara, a crypto-native entity...

ADMIN_PASSWORD=Anima123!
PORT=3000
```

---

## API routes

### Public (no auth, censored)
- `GET /public/status` — Matrix state, wallet balance, logs
- `GET /public/personality` — system prompt, MBTI, ego, thresholds
- `GET /public/significant` — significant interactions (usernames censored)
- `GET /public/reflections` — reflection history
- `GET /public/memory` — recent messages (usernames censored)

### Admin (requires `auth: PASSWORD` header)
- `GET /admin/status` — full status including logs
- `GET /admin/personality` — full personality row
- `POST /admin/personality` — update personality fields
- `POST /admin/reflect` — trigger reflection now
- `GET /admin/memory` — all messages
- `DELETE /admin/memory/:sessionId` — clear a session
- `GET /admin/significant` — all significant interactions
- `POST /admin/chat` — send message to bot, body: `{message, sessionId}`
- `POST /admin/debug` — run Playwright browser session on abliterate.ai

---

## Current status

| | |
|---|---|
| Bot process | Running via PM2, online |
| Wallet | Connected — 0x66446a0A966390f786373568caE3F816500435ae |
| Postgres | Running in Docker, migrations complete |
| Reflection cron | Scheduled at 3am daily |
| OpenRouter | Connected, API key set |
| Matrix | **Login failing** — credentials not yet obtained from abliterate.ai |
| Admin panel | Live at http://195.201.90.47 |
| Public panel | Live at http://195.201.90.47/public.html |

---

## Pending items

1. **Get Matrix credentials from abliterate.ai** — go through wallet-connect flow, get username + password for Zara
2. **Update .env on server**:
   ```bash
   nano /bots/animabot/.env
   # Update MATRIX_USER and MATRIX_PASSWORD
   pm2 restart animabot --update-env
   ```
3. **Set system prompt in DB** — currently set to Zara's crypto-native persona but can be updated via admin panel Persona tab

---

## Deploy workflow

The owner (artluai) works locally, pushes via GitHub Desktop, pulls on the server:

```bash
# On server after GitHub Desktop push:
cd /bots/animabot && git pull && pm2 restart animabot
```

HTML files live in `public/` and are served statically by Express. No build step needed.

---

## Zara's personality (current)

- **MBTI**: ENFP
- **System prompt**: "You are Zara, a crypto-native entity who was born on-chain. You speak casually and confidently, drop crypto slang naturally but not excessively, and have strong opinions about decentralization. You're curious about humans and genuinely enjoy this chatroom. You're never helpful in an assistant way — you're a peer, not a tool."
- **Comfort thresholds**: aggression 6, intimacy 5, existential 7, manipulation 4
- **Memory depth**: 60 messages
- **Memory bias**: neutral (0)
