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

const DEFAULT_VISIBILITY = {
  system_prompt: false,
  rules: true,
  ego_notes: true,
  mbti: true,
  status_matrix: true,
  status_rooms: true,
  status_wallet: true,
  status_uptime: false,
  mood_7d: true,
  reflection_history: false,
  significant_interactions: false,
  live_log: false,
};

function parseVisibility(raw) {
  if (!raw) return DEFAULT_VISIBILITY;
  const v = typeof raw === "string" ? JSON.parse(raw) : raw;
  return { ...DEFAULT_VISIBILITY, ...v };
}

function parseRules(raw) {
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

app.get("/health", (_, res) => res.json({ status: "ok", bot: process.env.BOT_NAME || "Zara" }));

// ── Public routes ─────────────────────────────────────────
app.get("/public/status", async (req, res) => {
  const p = await getPersonality().catch(() => null);
  const vis = parseVisibility(p?.public_visibility);
  const ethBalance = await getBalance().catch(() => null);
  const matrix = botStatus.matrix;
  const statusCards = {};
  if (vis.status_matrix) statusCards.matrix = { state: matrix.state, label: matrix.label, error: matrix.error ? await censor(matrix.error) : null, lastSync: matrix.lastSync };
  if (vis.status_rooms) statusCards.rooms = { count: matrix.joinedRooms?.length ?? 0, names: matrix.joinedRooms?.map(r => r.includes("@") ? "[private room]" : r) ?? [] };
  if (vis.status_wallet) statusCards.wallet = { address: wallet?.address, balance: ethBalance };
  if (vis.status_uptime) statusCards.uptime = { startedAt: botStatus.startedAt };
  const logs = vis.live_log ? await Promise.all(botStatus.logs.slice(-30).map(async l => ({ ...l, msg: await censor(l.msg) }))) : [];
  res.json({ statusCards, logs, visibility: vis });
});

app.get("/public/personality", async (req, res) => {
  const { rows } = await db.query(`SELECT system_prompt, ego_notes, mbti, emotional_range, memory_depth, memory_bias, rules, public_visibility, last_reflection FROM personality WHERE id = 1`);
  const p = rows[0] || {};
  const vis = parseVisibility(p.public_visibility);
  const rules = parseRules(p.rules);
  const result = { visibility: vis, emotional_range: p.emotional_range, memory_depth: p.memory_depth, memory_bias: p.memory_bias };
  if (vis.system_prompt) result.system_prompt = p.system_prompt;
  if (vis.ego_notes) { result.ego_notes = p.ego_notes; result.last_reflection = p.last_reflection; }
  if (vis.mbti) result.mbti = p.mbti;
  if (vis.rules) result.rules = rules.filter(r => r.level !== "off");
  res.json(result);
});

app.get("/public/significant", async (req, res) => {
  const p = await getPersonality().catch(() => null);
  const vis = parseVisibility(p?.public_visibility);
  if (!vis.significant_interactions) return res.json([]);
  const { rows } = await db.query(`SELECT * FROM emotional_log ORDER BY created_at DESC LIMIT 50`);
  const censored = await Promise.all(rows.map(async r => ({ ...r, sender: "******", user_message: await censor(r.user_message), bot_reply: await censor(r.bot_reply), reason: await censor(r.reason) })));
  res.json(censored);
});

app.get("/public/reflections", async (req, res) => {
  const p = await getPersonality().catch(() => null);
  const vis = parseVisibility(p?.public_visibility);
  if (!vis.reflection_history) return res.json([]);
  const { rows } = await db.query(`SELECT * FROM reflection_log ORDER BY created_at DESC LIMIT 30`);
  res.json(rows);
});

app.get("/public/memory", async (req, res) => {
  const { rows } = await db.query(`SELECT session_id, role, content, created_at FROM messages ORDER BY created_at DESC LIMIT 100`);
  const censored = await Promise.all(rows.map(async r => ({ ...r, session_id: r.session_id.startsWith("!") ? "[private room]" : r.session_id, content: await censor(r.content) })));
  res.json(censored.reverse());
});

// ── Admin routes ──────────────────────────────────────────
app.get("/admin/status", requireAdmin, async (req, res) => {
  const ethBalance = await getBalance().catch(() => null);
  res.json({ ...botStatus, wallet: { address: wallet?.address, balance: ethBalance } });
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
  const p = rows[0] || {};
  res.json({ ...p, rules: parseRules(p.rules), public_visibility: parseVisibility(p.public_visibility) });
});

app.post("/admin/personality", requireAdmin, async (req, res) => {
  const { system_prompt, emotional_range, ego_notes, memory_depth, memory_bias, rules, public_visibility } = req.body;
  await db.query(
    `UPDATE personality SET system_prompt=$1, emotional_range=$2, ego_notes=$3, memory_depth=$4, memory_bias=$5, rules=$6, public_visibility=$7, updated_at=NOW() WHERE id=1`,
    [system_prompt, JSON.stringify(emotional_range), ego_notes, memory_depth, memory_bias, JSON.stringify(rules || []), JSON.stringify(public_visibility || DEFAULT_VISIBILITY)]
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

const chatSessions = new Map();
app.post("/admin/chat", requireAdmin, async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) return res.status(400).json({ error: "Missing fields" });
  const quickReply = await handleCommand(message);
  if (quickReply) return res.json({ reply: quickReply });
  if (!chatSessions.has(sessionId)) chatSessions.set(sessionId, []);
  const history = chatSessions.get(sessionId);
  const personality = await getPersonality();
  const ethBalance = await getBalance().catch(() => null);
  const botName = process.env.BOT_NAME || "Zara";
  const { buildRulesBlock } = await import("./core/ai.js");
  const rulesBlock = buildRulesBlock(parseRules(personality.rules));
  const systemPrompt = `${personality.system_prompt || `You are ${botName}, a peer not an assistant.`}
${personality.ego_notes ? `How you're feeling: ${personality.ego_notes}` : ""}${rulesBlock}
Wallet: ${wallet?.address || "not configured"} (${ethBalance || "?"} ETH)
Matrix status: ${botStatus.matrix.label || botStatus.matrix.state}${botStatus.matrix.error ? ` — ${botStatus.matrix.error}` : ""}
Rooms: ${botStatus.matrix.joinedRooms?.join(", ") || "none"}
Recent logs:
${botStatus.logs.slice(-6).map(l => `[${l.level}] ${l.msg}`).join("\n")}
You are in a private DM with your owner. Be candid about your status. Stay in character.`;
  history.push({ role: "user", content: message });
  if (history.length > 60) history.splice(0, history.length - 60);
  const reply = await getReply(history, systemPrompt, true);
  history.push({ role: "assistant", content: reply });
  res.json({ reply });
});

app.post("/admin/debug", requireAdmin, async (req, res) => {
  const steps = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    steps.push({ type: "log", text: "Opening abliterate.ai..." });
    await page.goto("https://abliterate.ai", { waitUntil: "networkidle", timeout: 15000 });
    steps.push({ type: "screenshot", data: await page.screenshot({ encoding: "base64" }) });
    await page.goto("https://chat.abliterate.ai", { waitUntil: "networkidle", timeout: 15000 });
    steps.push({ type: "log", text: `Page: ${await page.title()}` });
    steps.push({ type: "screenshot", data: await page.screenshot({ encoding: "base64" }) });
    const userField = await page.$('input[type="text"], input[name="username"]');
    const passField = await page.$('input[type="password"]');
    if (!userField || !passField) { steps.push({ type: "log", text: "Could not find login fields" }); }
    else {
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

// ── Avatar ────────────────────────────────────────────────
app.post("/admin/avatar", requireAdmin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const { setMatrixAvatar } = await import("./adapters/matrix.js");
    await setMatrixAvatar(url);
    // Save to DB as a setting
    await db.query(`UPDATE personality SET updated_at=NOW() WHERE id=1`);
    log("INFO", `Avatar updated to: ${url}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
