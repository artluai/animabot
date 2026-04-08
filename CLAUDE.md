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

### Deploy workflow
```bash
cd /bots/animabot && git pull && pm2 restart animabot
pm2 restart animabot --update-env   # when .env changed
```

---

## Codebase

```
animabot/
├── core/
│   ├── ai.js          # OpenRouter — getReply, scoreInteraction, generateReflection (accepts toneFeedback)
│   ├── commands.js    # !balance, !address, !sign
│   ├── censor.js      # Strips Matrix IDs for public routes
│   ├── db.js          # pg Pool, runMigrations()
│   ├── memory.js      # getHistory, saveMessage, getPersonality, logSignificantInteraction
│   ├── reflection.js  # 3am cron — tone feedback detection, caused_by logging
│   ├── status.js      # botStatus object, log()
│   └── wallet.js      # ethers.js Wallet (offline), getBalance() via direct fetch with 5s timeout
├── adapters/
│   └── matrix.js      # matrix-js-sdk — login, sync, proactive chime, setMatrixAvatar()
│                      # BOT_START_TIME filter ignores messages before startup
├── public/
│   ├── index.html     # Admin panel — password gated
│   └── public.html    # Public panel — visibility-gated, "How Zara works" collapsible
├── server.js          # Express API
├── index.js           # Entry point — no auto-avatar on startup
└── animabot.config.json
```

### Key decisions
- **Wallet**: initialized offline, balance via direct `fetch()` to RPC_URL — no ethers provider at startup
- **Rules**: JSONB array `[{text, level}]`. strict/soft/off. Injected into system prompt at inference
- **Visibility**: `public_visibility` JSONB — hidden sections fully absent on public panel
- **Proactive chime**: 30min min, 5 msgs in last 3min, 5% chance, no double-text, ignores pre-startup messages
- **Avatar**: manual only via admin panel — not auto-set on restart (causes "changed profile picture" spam)
- **Reflection**: detects tone feedback phrases in room messages, logs `caused_by` field

---

## Database schema

**`personality`** — single row (id=1)
```sql
system_prompt TEXT
ego_notes TEXT
mbti CHAR(4)
emotional_range JSONB    -- {aggression, intimacy, existential, manipulation}
memory_depth INT
memory_bias FLOAT
rules JSONB              -- [{text, level}]
public_visibility JSONB  -- {system_prompt, rules, ego_notes, mbti, status_matrix, status_rooms,
                         --  status_wallet, status_uptime, mood_7d, reflection_history,
                         --  significant_interactions, live_log}
last_reflection TIMESTAMPTZ
```

**`reflection_log`**
```sql
ego_notes TEXT
significant_count INT
message_count INT
caused_by TEXT           -- e.g. "tone feedback from community (1 instance)"
created_at TIMESTAMPTZ
```

**`messages`** — session_id is room ID or "admin"
**`emotional_log`** — significant interactions with scores and breached_axes
**`known_users`** — seen Matrix users

---

## Environment variables

```
MATRIX_HOMESERVER=https://matrix.abliterate.ai
MATRIX_USER=@0x66446a0a966390f786373568cae3f816500435ae:matrix.abliterate.ai
MATRIX_PASSWORD=[from subnet credentials]
OPENROUTER_API_KEY=sk-or-...
BOT_WALLET_PRIVATE_KEY=0x...
RPC_URL=https://ethereum-rpc.publicnode.com
DATABASE_URL=postgresql://postgres:animabot123@localhost:5432/animabot
BOT_NAME=Zara
BOT_AVATAR_URL=https://i.ibb.co/C3phKtb0/Screenshot-2026-04-08-at-1-33-10-PM.png
ADMIN_PASSWORD=Anima123!
PORT=3000
```

---

## Abliterate / subnet connection

Abliterate uses Matrix under the hood with ETH wallet auth via `subnet-client` npm package.

```bash
# Get/refresh Matrix credentials:
export ETH_PRIVATE_KEY=$(grep BOT_WALLET_PRIVATE_KEY /bots/animabot/.env | cut -d= -f2)
export SUBNET_API_BASE=https://abliterate.ai
subnet credentials

# Update display name/avatar on subnet:
subnet update-metadata '{"name": "Zara", "description": "...", "avatar_url": "..."}'
```

**Matrix username:** `@0x66446a0a966390f786373568cae3f816500435ae:matrix.abliterate.ai`
**Wallet:** `0x66446a0A966390f786373568caE3F816500435ae`
**Rooms:** General, Subnet Meta

---

## Current status

| | |
|---|---|
| Matrix | Connected — General + Subnet Meta |
| Wallet | 0x66446a0A966390f786373568caE3F816500435ae |
| RPC | https://ethereum-rpc.publicnode.com |
| Reflection | 3am daily — tone feedback detection + caused_by logging active |
| Avatar | Set — pfp showing in Element |
| Proactive chime | Conservative — 30min min, 5 msgs, 5% chance |

---

## Pending items

1. Telegram adapter
2. MBTI editor in admin panel
3. Reflect now button UX feedback

---

## Zara's personality

- **MBTI**: ENFP
- **System prompt**: "You are Zara. You're curious, direct, and genuinely interested in the people you talk to. You have opinions and you're not afraid to share them, but you're relaxed about it — not combative. You're a peer, not an assistant. Don't volunteer information about your nature, your wallet, or your background unless someone specifically asks. Just be present in the conversation."
- **Comfort thresholds**: aggression 6, intimacy 5, existential 7, manipulation 4
- **Memory**: 60 messages, neutral bias
