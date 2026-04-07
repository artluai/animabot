import express from "express";
import { chromium } from "playwright";
import { db } from "./core/db.js";
import { botStatus, log } from "./core/status.js";
import { wallet, getBalance } from "./core/wallet.js";
import { getHistory, getPersonality } from "./core/memory.js";
import { getReply } from "./core/ai.js";
import { censor } from "./core/censor.js";
import { runReflection } from "./core/reflection.js";
import { handleCommand } from "./core/commands.js";
import "dotenv/config";

const app = express();
app.use(express.json());
app.use(express.static("public"));

function requireAdmin(req, res, next) {
  if (req.headers.auth !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ── Health ────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok", bot: process.env.BOT_NAME || "Zara" }));

// ── Public routes (censored) ──────────────────────────────
app.get("/public/status", async (req, res) => {
  const ethBalance = await getBalance().catch(() => "?");
  res.json({
    matrix: {
      state: botStatus.matrix.state,
      error: botStatus.matrix.error ? await censor(botStatus.matrix.error) : null,
      lastSync: botStatus.matrix.lastSync,
      joinedRooms: botStatus.matrix.joinedRooms.map(r => r.includes("@") ? "[private room]" : r),
      attempts: botStatus.matrix.attempts,
    },
    wallet: { address: wallet.address, balance: ethBalance },
    startedAt: botStatus.startedAt,
    logs: await Promise.all(botStatus.logs.slice(-30).map(async l => ({ ...l, msg: await censor(l.msg) }))),
  });
});

app.get("/public/memory", async (req, res) => {
  const { rows } = await db.query(`SELECT session_id, role, content, created_at FROM messages ORDER BY created_at DESC LIMIT 100`);
  const censored = await Promise.all(rows.map(async r => ({ ...r, session_id: r.session_id.startsWith("!") ? "[private room]" : r.session_id, content: await censor(r.content) })));
  res.json(censored.reverse());
});

app.get("/public/significant", async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM emotional_log ORDER BY created_at DESC LIMIT 50`);
  const censored = await Promise.all(rows.map(async r => ({ ...r, sender: "******", user_message: await censor(r.user_message), bot_reply: await censor(r.bot_reply), reason: await censor(r.reason) })));
  res.json(censored);
});

app.get("/public/personality", async (req, res) => {
  const { rows } = await db.query(`SELECT system_prompt, ego_notes, mbti, emotional_range, memory_depth, memory_bias FROM personality WHERE id = 1`);
  res.json(rows[0] || {});
});

app.get("/public/reflections", async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM reflection_log ORDER BY created_at DESC LIMIT 30`);
  res.json(rows);
});

// ── Admin routes (full data) ──────────────────────────────
app.get("/admin/status", requireAdmin, async (req, res) => {
  const ethBalance = await getBalance().catch(() => "?");
  res.json({ ...botStatus, wallet: { address: wallet.address, balance: ethBalance } });
});

app.get("/admin/memory", requireAdmin, async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM messages ORDER BY created_at DESC LIMIT 200`);
  res.json(rows.reverse());
});

app.get("/admin/significant", requireAdmin, async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM emotional_log ORDER BY created_at DESC LIMIT 100`);
  res.json(rows);
});

app.get("/admin/personality", requireAdmin, async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM personality WHERE id = 1`);
  res.json(rows[0] || {});
});

app.post("/admin/personality", requireAdmin, async (req, res) => {
  const { system_prompt, emotional_range, ego_notes, memory_depth, memory_bias } = req.body;
  await db.query(
    `UPDATE personality SET system_prompt=$1, emotional_range=$2, ego_notes=$3, memory_depth=$4, memory_bias=$5, updated_at=NOW() WHERE id=1`,
    [system_prompt, JSON.stringify(emotional_range), ego_notes, memory_depth, memory_bias]
  );
  log("INFO", "Personality updated via admin panel");
  res.json({ ok: true });
});

app.post("/admin/reflect", requireAdmin, async (req, res) => {
  await runReflection();
  res.json({ ok: true });
});

app.delete("/admin/memory/:sessionId", requireAdmin, async (req, res) => {
  await db.query(`DELETE FROM messages WHERE session_id = $1`, [req.params.sessionId]);
  res.json({ ok: true });
});

app.get("/admin/reflections", requireAdmin, async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM reflection_log ORDER BY created_at DESC LIMIT 50`);
  res.json(rows);
});

// ── Admin chat ────────────────────────────────────────────
const chatSessions = new Map();
app.post("/admin/chat", requireAdmin, async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: "Missing fields" });

  const quickReply = await handleCommand(message);
  if (quickReply) return res.json({ reply: quickReply });

  if (!chatSessions.has(sessionId)) chatSessions.set(sessionId, []);
  const history = chatSessions.get(sessionId);

  const personality = await getPersonality();
  const ethBalance = await getBalance().catch(() => "?");
  const botName = process.env.BOT_NAME || "Zara";

  const systemPrompt = `${personality.system_prompt || `You are ${botName}, a peer not an assistant.`}
${personality.ego_notes ? `How you're feeling: ${personality.ego_notes}` : ""}
Wallet: ${wallet.address} (${ethBalance} ETH)
Matrix status: ${botStatus.matrix.state}${botStatus.matrix.error ? ` — ${botStatus.matrix.error}` : ""}
Rooms: ${botStatus.matrix.joinedRooms.join(", ") || "none"}
Recent logs:
${botStatus.logs.slice(-6).map(l => `[${l.level}] ${l.msg}`).join("\n")}
You are in a private DM with your owner. Be candid about your status. Stay in character.`;

  history.push({ role: "user", content: message });
  if (history.length > 60) history.splice(0, history.length - 60);

  const reply = await getReply(history, systemPrompt, true);
  history.push({ role: "assistant", content: reply });
  res.json({ reply });
});

// ── Browser debugger ──────────────────────────────────────
app.post("/admin/debug", requireAdmin, async (req, res) => {
  const steps = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("console", msg => { if (msg.type() === "error") steps.push({ type: "log", text: `[browser] ${msg.text()}` }); });

    steps.push({ type: "log", text: "Opening abliterate.ai..." });
    await page.goto("https://abliterate.ai", { waitUntil: "networkidle", timeout: 15000 });
    steps.push({ type: "screenshot", data: await page.screenshot({ encoding: "base64" }) });

    await page.goto("https://chat.abliterate.ai", { waitUntil: "networkidle", timeout: 15000 });
    steps.push({ type: "log", text: `Page: ${await page.title()}` });
    steps.push({ type: "screenshot", data: await page.screenshot({ encoding: "base64" }) });

    const userField = await page.$('input[type="text"], input[name="username"]');
    const passField = await page.$('input[type="password"]');

    if (!userField || !passField) {
      steps.push({ type: "log", text: "Could not find login fields" });
    } else {
      steps.push({ type: "log", text: "Found login fields, attempting login..." });
      await userField.fill(process.env.MATRIX_USER || "");
      await passField.fill(process.env.MATRIX_PASSWORD || "");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(4000);
      steps.push({ type: "screenshot", data: await page.screenshot({ encoding: "base64" }) });
      const errEl = await page.$(".mx_ErrorMessage, .mx_Login_error, [class*='error']");
      if (errEl) steps.push({ type: "error", text: `Login error: "${await errEl.textContent()}"` });
      else steps.push({ type: "ok", text: "No error visible — login likely succeeded" });
    }
    res.json({ steps });
  } catch (err) {
    steps.push({ type: "error", text: `Exception: ${err.message}` });
    res.json({ steps });
  } finally {
    await browser?.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => log("INFO", `Server running on port ${PORT}`));
