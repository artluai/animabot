# Animabot

A framework for creating AI agents that live permanently in chat rooms with their own Ethereum wallet, evolving personality, and psychological state.

Each bot has:
- A **Matrix/Element** presence (Telegram and Discord adapters planned)
- An **Ethereum wallet** it owns and can sign messages with
- An **MBTI-driven personality** that shapes how it talks
- An **emotional scoring system** that logs significant interactions
- A **daily reflection** at 3am — reads recent conversations and writes a short ego note that gets injected into future prompts
- A **live admin panel** for monitoring, chatting privately, and configuring the bot

---

## Quick start

### Requirements
- Node.js 20+
- PostgreSQL 16
- An [OpenRouter](https://openrouter.ai) API key
- A Matrix homeserver account for the bot

### Setup

```bash
git clone https://github.com/artluai/animabot.git
cd animabot
npm install
npx playwright install chromium
cp .env.example .env
# Fill in your .env values
node index.js
```

### Environment variables

| Variable | Description |
|---|---|
| `MATRIX_HOMESERVER` | e.g. `https://matrix.abliterate.ai` |
| `MATRIX_USER` | e.g. `@zara:abliterate.ai` |
| `MATRIX_PASSWORD` | Bot account password |
| `OPENROUTER_API_KEY` | From openrouter.ai |
| `BOT_WALLET_PRIVATE_KEY` | Ethereum private key |
| `RPC_URL` | e.g. `https://eth.llamarpc.com` |
| `DATABASE_URL` | PostgreSQL connection string |
| `BOT_NAME` | Display name, e.g. `Zara` |
| `BOT_PERSONALITY` | Fallback system prompt |
| `ADMIN_PASSWORD` | Admin panel password |
| `PORT` | Default `3000` |

---

## Architecture

```
animabot/
├── core/
│   ├── ai.js          # OpenRouter — replies, scoring, reflection generation
│   ├── commands.js    # !balance, !address, !sign
│   ├── censor.js      # Strips Matrix IDs and display names for public routes
│   ├── db.js          # Postgres pool + auto migrations
│   ├── memory.js      # Message history, personality, interaction logging
│   ├── reflection.js  # 3am cron — daily ego reflection
│   ├── status.js      # Live bot state and log buffer
│   └── wallet.js      # ethers.js wallet — balance, signing
├── adapters/
│   └── matrix.js      # Matrix/Element — login, sync, message handling, proactive chiming
├── public/
│   ├── index.html     # Admin panel (password protected)
│   └── public.html    # Public read-only panel (censored)
├── server.js          # Express API — /admin/* and /public/* routes
├── index.js           # Entry point — migrations, wallet, adapters, cron, server
└── animabot.config.json
```

Adapters share the same core brain. Adding Telegram or Discord means writing a new adapter file — the personality, memory, wallet and reflection logic stays the same.

---

## License

MIT
