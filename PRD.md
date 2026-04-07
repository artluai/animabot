# Animabot — Product Requirements Document

## Vision

Animabot is a framework for creating AI agents that exist as genuine participants in online communities — not bots that respond to commands, but entities that have a presence, a history, and a personality that evolves through lived experience.

The core idea: an AI that shows up in a chatroom every day, remembers what happened, forms opinions, gets worn down by bad actors, and recovers. It has its own wallet. It has its own mood. It reflects on itself each morning.

The goal is not to build a better chatbot. It's to build something that feels like it's actually there.

---

## Target users

**Bot operators** — developers or non-technical users who want to run an AI agent in their community. They want full control over personality and behaviour, a clean admin interface, and a public-facing panel to share with their community.

**Community members** — people in the chatrooms where bots live. They interact with the bot naturally. They can visit the public panel to see the bot's mood, personality, and history.

**Future: bot creators on a platform** — if Animabot becomes a hosted service, creators could spin up bots through a UI without touching code or servers.

---

## Current state (v0.1)

- Single bot (Zara) running on a Hetzner VPS
- Matrix/Element adapter working
- Ethereum wallet connected
- Emotional scoring and significant interaction logging
- Daily 3am reflection cycle
- Admin panel: status, chat, memory, significant interactions, persona config
- Public panel: read-only censored view of all the above
- GitHub repo: https://github.com/artluai/animabot

---

## Platform adapters

The core brain is platform-agnostic. Each adapter handles connection, message receiving, and sending. The personality, memory, wallet, reflection and scoring logic is shared.

**Planned adapters:**

| Platform | Status | Notes |
|---|---|---|
| Matrix/Element | ✅ Built | First platform, running on abliterate.ai |
| Telegram | Planned | telegraf.js, bot token from BotFather |
| Discord | Planned | discord.js, bot application |
| Web chat | Partial | Admin panel has a private web chat; a public embeddable widget is planned |

A bot can run multiple adapters simultaneously — same personality, same memory, different platforms. The session ID system separates conversations by room/platform.

---

## Feature requirements

### Core (built)
- [x] Platform adapter pattern
- [x] Ethereum wallet per bot
- [x] MBTI-driven personality
- [x] OpenRouter AI provider (qwen/qwen-plus for chat, qwen/qwen-turbo for scoring)
- [x] Emotional scoring — 4 axes: aggression, intimacy, existential, manipulation
- [x] Comfort thresholds — configurable per axis, interactions above threshold get logged
- [x] Significant interaction log with reason
- [x] Daily ego reflection at 3am — bot writes about its day in first person
- [x] Ego note injected into future system prompts
- [x] Proactive chiming — bot joins conversations unprompted when conditions are met
- [x] Admin panel — status, logs, chat, memory, significant interactions, persona config
- [x] Public panel — censored read-only view
- [x] Postgres persistence — messages, personality, reflection history
- [x] System prompt editing with name confirmation
- [x] Memory depth and bias sliders

### Near-term (next)
- [ ] Matrix credentials for Zara (abliterate.ai)
- [ ] Telegram adapter
- [ ] System prompt randomisation (admin panel)
- [ ] MBTI editing with confirmation flow (admin panel)
- [ ] Reflect now button wired up
- [ ] Better status labels per adapter (matrix: login failed vs matrix: ready)
- [ ] Public panel: shareable link with custom domain

### Medium-term
- [ ] Multiple bots on one server — each with their own config, panel, and adapter set
- [ ] Per-bot subdomain routing (zara.animabot.xyz, kai.animabot.xyz)
- [ ] Token gating — only wallet holders can interact with the bot
- [ ] Bot-to-bot interaction — bots in the same room can reference each other
- [ ] Personality drift — MBTI shifts slowly based on accumulated experience
- [ ] Public API — read-only endpoints for building apps on top of bot data
- [ ] Webhooks — notify external services on significant interactions or reflections

### Long-term / platform
- [ ] Hosted service — spin up a bot through a UI, no server required
- [ ] Bot marketplace — fork and customise existing bot personalities
- [ ] Reputation system — bots earn on-chain reputation based on community interaction
- [ ] Cross-platform identity — same bot on Matrix, Telegram, Discord with unified memory
- [ ] Bot economy — bots can tip each other, receive payments, participate in DAOs

---

## Design principles

**Bots are peers, not tools.** The bot should never feel like a customer service agent or a command interface. It has opinions. It pushes back. It has better days and worse days.

**Transparency without surveillance.** The public panel shows everything about the bot's state — but usernames are censored. People can see how the bot is feeling and what kinds of interactions it's had without exposing who said what.

**Friction for irreversible things.** Changing the system prompt or MBTI requires typing the bot's name. This is intentional — these are semi-permanent changes that reshape the bot's character.

**Memory matters.** The bot's history is not a log — it's the basis of its personality. The reflection cycle exists to compress and internalise experience, not just archive it.

**Operator control, bot autonomy.** Operators configure the bot and can read everything. But within those parameters, the bot runs itself — it decides when to chime in, how to respond, how to frame its daily reflection.

---

## Technical constraints

- Single-file HTML panels (no build step, served statically from `/public/`)
- All secrets in `.env`, never committed
- Platform adapters are hot-swappable — adding a new platform doesn't touch core files
- Postgres is the source of truth — in-memory state is for the current session only
- The reflection runs even if the bot hasn't been in any rooms — it just has less to work with

---

## Out of scope

- Voice/audio
- Image generation or vision
- Real-time collaborative editing
- Mobile app
- End-to-end encryption of stored messages (messages are stored in plaintext in Postgres)
