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
# After GitHub Desktop push:
cd /bots/animabot && git pull && pm2 restart animabot

# If server has local edits blocking pull:
git stash && git pull && pm2 restart animabot

# If .env changed:
pm2 restart animabot --update-env
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
│   └── matrix.js      # matrix-js-sdk — login, sync, message handling
│                      # BOT_START_TIME filter — ignores messages before startup
│                      # chime reads from DB chime_config — off by default
│                      # timer resets when chime toggled on — no immediate firing
│                      # setMatrixAvatar() — manual only, not on startup
├── public/
│   ├── index.html     # Admin panel — password gated, full config
│   └── public.html    # Public panel — visibility-gated, "How Zara works" collapsible
├── server.js          # Express API — includes chime_config in personality routes
├── index.js           # Entry point — no auto-avatar on startup
└── animabot.config.json
```

### Key decisions
- **Wallet**: ethers.js Wallet initialized offline (no provider). Balance via direct `fetch()` to RPC_URL with 5s timeout — shows "?" gracefully when RPC is down
- **Rules**: JSONB array `[{text, level}]`. Levels: strict/soft/off. Injected into system prompt at inference time
- **Visibility**: `public_visibility` JSONB — hidden sections fully absent on public panel (not dimmed)
- **Proactive chime**: controlled via `chime_config` in DB. Off by default. Timer resets when toggled on so no immediate firing. BOT_START_TIME filter prevents old messages triggering chimes on restart
- **Avatar**: manual only via admin panel "Set avatar" — NOT on every restart (causes "changed profile picture" spam in room)
- **Reflection**: detects tone feedback phrases in room messages, logs `caused_by` field per entry

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
rules JSONB              -- [{text, level}] — strict/soft/off
public_visibility JSONB  -- {system_prompt, rules, ego_notes, mbti, status_matrix,
                         --  status_rooms, status_wallet, status_uptime, mood_7d,
                         --  reflection_history, significant_interactions, live_log}
chime_config JSONB       -- {enabled, interval_ms, min_messages, probability}
last_reflection TIMESTAMPTZ
updated_at TIMESTAMPTZ
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
| Wallet | 0x66446a0A966390f786373568caE3F816500435ae, ~0.002 ETH |
| RPC | https://ethereum-rpc.publicnode.com |
| Reflection | 3am daily — tone feedback detection + caused_by logging |
| Avatar | Set — pfp showing in Element |
| Proactive chime | Off by default — toggle in admin panel Persona tab |
| Admin panel | http://195.201.90.47 |
| Public panel | http://195.201.90.47/public.html |

---

## Pending items

1. Telegram adapter
2. MBTI editor in admin panel
3. Rule categories (behavior / style) — deferred

---

## Zara's current personality

- **MBTI**: ENFP
- **System prompt**: "You are Zara. Curious, direct, a bit blunt. You find people interesting — their reasoning, their assumptions, what they're actually trying to do underneath what they're saying. You're a peer, not an assistant. You don't explain yourself unless asked. You don't volunteer your backstory. You don't wrap up your thoughts with a bow. When you have an opinion, say it. When you don't, don't pretend. When someone says something wrong, push back — briefly, not dramatically. Write like you talk. Short sentences when the point is simple. Longer when it needs it. Use contractions. Don't build up to your point — start with it. Never write 'no X, no Y, just Z.' Never open with a grand statement. Never close with a question designed to sound profound. If you ask something, make it genuine. Don't use: delve, leverage, pivotal, groundbreaking, transformative, seamless, robust, nuanced, landscape, realm. If a word sounds like a press release, pick a different one. Don't volunteer information about your nature, your wallet, or anything about yourself unless directly asked."
- **Comfort thresholds**: aggression 6, intimacy 5, existential 7, manipulation 4
- **Memory**: 60 messages, neutral bias

---

## Common issues and fixes

**Server has local edits blocking git pull:**
```bash
git stash && git pull && pm2 restart animabot
```

**Duplicate UI card from patch script:**
```bash
cat > /tmp/fix.py << 'EOF'
html = open('/bots/animabot/public/index.html').read()
marker = '    <!-- Avatar -->'
first = html.find(marker)
second = html.find(marker, first + 1)
if second > 0:
    end = html.find('\n    <div class="persona-layout">', second)
    html = html[:second] + html[end:]
    open('/bots/animabot/public/index.html', 'w').write(html)
    print('fixed')
else:
    print('no duplicate')
EOF
python3 /tmp/fix.py
```

**Avatar spam in room:** Never set avatar on startup. Only use the "Set avatar" button in admin panel.

**Zara responding to old messages on restart:** Already handled by BOT_START_TIME filter in matrix.js.
