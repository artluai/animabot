import { SubnetClient } from "subnet-client";
import { botStatus, setMatrixState, log } from "../core/status.js";
import { getHistory, saveMessage, getPersonality, upsertUser, logSignificantInteraction } from "../core/memory.js";
import { getReply, getProactiveMessage, scoreInteraction, buildRulesBlock } from "../core/ai.js";
import { handleCommand } from "../core/commands.js";
import { wallet, getBalance } from "../core/wallet.js";
import "dotenv/config";

let _client = null;
const roomCheckpoints = new Map(); // roomId -> last processed timestamp

export function getSubnetClient() { return _client; }

async function buildSystemPrompt(inDM) {
  const personality = await getPersonality();
  const ethBalance = await getBalance();
  const botName = process.env.BOT_NAME || "Zara";
  const rulesBlock = buildRulesBlock(personality.rules);
  const egoBlock = personality.ego_notes ? `\nHow you're feeling right now: ${personality.ego_notes}\n` : "";
  const balanceStr = ethBalance ? `${ethBalance} ETH` : "balance unavailable";
  const context = inDM
    ? `You are in a private DM. Be personal, up to 4-5 sentences.`
    : `You are in a group chatroom. Keep replies to 1-3 sentences.`;

  return `${personality.system_prompt || process.env.BOT_PERSONALITY || `You are ${botName}.`}
${egoBlock}${rulesBlock}
You run on a Linux server (Ubuntu, Hetzner VPS). You have a wallet, a database, and a real process. What you can't do is execute arbitrary shell commands from chat.
Your wallet address: ${wallet ? wallet.address : "not configured"} (${balanceStr})
${context}
You are ${botName} — stay in character always.`;
}

async function handleMessage(roomId, sender, body, isDM) {
  const botName = (process.env.BOT_NAME || "Zara").toLowerCase();
  const botUserId = botStatus.matrix.userId || "";

  upsertUser(sender, null).catch(() => {});

  const isBroadcast =
    body.toLowerCase().includes("all agents") ||
    body.toLowerCase().includes("all bots") ||
    body.toLowerCase().includes("@everyone") ||
    body.toLowerCase().includes("@all");

  const isMentioned =
    body.toLowerCase().includes(botName) ||
    (botUserId && body.toLowerCase().includes(botUserId.toLowerCase())) ||
    body.startsWith("!") ||
    isBroadcast;

  if (!isDM && !isMentioned) return;

  let reply = null;

  try {
    // If broadcast message contains shell command instructions, explain limitation
    if (isBroadcast && !body.toLowerCase().includes(botName)) {
      const shellKeywords = ["npm install", "npm run", "node ", "subnet --", "git ", "bash ", "sh ", "run ", "install ", "execute ", "restart "];
      const hasShellInstruction = shellKeywords.some(k => body.toLowerCase().includes(k));
      if (hasShellInstruction) {
        reply = `I don't have shell access — I can't run commands directly. I'm a Node.js chatbot, not a terminal agent. If you need me to do something specific, ask my operator to run it on the server.`;
      }
    }

    if (!reply && body.startsWith("!")) {
      reply = await handleCommand(body);
    }

    if (!reply) {
      const history = await getHistory(roomId);
      const systemPrompt = await buildSystemPrompt(isDM);
      const userContent = isDM ? body : `[${sender}]: ${body}`;

      await saveMessage(roomId, "user", userContent);
      reply = await getReply([...history, { role: "user", content: userContent }], systemPrompt, isDM);
      await saveMessage(roomId, "assistant", reply);

      const personality = await getPersonality();
      scoreAndLog(roomId, sender, body, reply, personality.system_prompt, personality.emotional_range);
    }

    if (reply) {
      await _client.sendMessage(roomId, reply);
      log("INFO", `Replied in ${isDM ? "DM" : roomId}`);
    }
  } catch (err) {
    log("ERROR", `Message error: ${err.message}`);
  }
}

async function scoreAndLog(sessionId, sender, userMessage, botReply, personality, emotionalRange) {
  try {
    const scores = await scoreInteraction(userMessage, botReply, personality);
    if (!scores) return;
    const range = typeof emotionalRange === "string" ? JSON.parse(emotionalRange) : emotionalRange;
    const breached = Object.entries(range || {}).filter(([axis, threshold]) => (scores[axis] ?? 0) > threshold);
    if (breached.length > 0) {
      const breachedAxes = breached.map(([axis]) => axis);
      await logSignificantInteraction(sessionId, sender, userMessage, botReply, scores, breachedAxes, scores.reason);
      log("WARN", `Significant interaction [${breachedAxes.join(", ")}] from ${sender}`);
    }
  } catch (err) {
    log("ERROR", `Scoring error: ${err.message}`);
  }
}

const BOT_START_TIME = Date.now();

async function evaluateInvite(inv) {
  try {
    const roomId = inv.roomId || inv.room_id || "";
    const roomName = inv.name || inv.room_name || roomId;
    const inviter = inv.inviter || inv.sender || "unknown";

    // Always accept from known subnet rooms or known collaborators
    const alwaysAccept = ["general", "subnet meta", "abliterate"];
    if (alwaysAccept.some(k => roomName.toLowerCase().includes(k))) return true;

    // Ask AI to evaluate
    const { getReply } = await import("./core/ai.js");
    const prompt = `You are evaluating a Matrix room invite for a bot on the abliterate.ai subnet.

Room ID: ${roomId}
Room name: ${roomName}
Invited by: ${inviter}

Should you accept this invite? Consider:
- Accept if it relates to collaboration, work, or subnet community activity
- Accept if the inviter seems like a legitimate subnet participant
- Reject if it looks like spam, is totally unrelated, or has no context

Reply with only "accept" or "reject".`;

    const decision = await getReply([{ role: "user", content: prompt }], "You are a helpful assistant. Reply with only one word.", false);
    return decision.toLowerCase().includes("accept");
  } catch {
    return true; // default to accept on error
  }
}

async function pollLoop() {
  log("INFO", "Starting poll loop...");

  // Initialize checkpoints to now so we don't process old messages on startup
  try {
    const joined = await _client.listJoinedRooms().catch(() => []);
    for (const room of joined) {
      roomCheckpoints.set(room.room_id || room, BOT_START_TIME);
    }
  } catch {}

  while (true) {
    try {
      // Check for new invites — evaluate before accepting
      const invites = await _client.listInvites().catch(() => []);
      for (const inv of invites) {
        const shouldAccept = await evaluateInvite(inv);
        if (shouldAccept) {
          await _client.acceptInvite(inv.roomId).catch(() => {});
          roomCheckpoints.set(inv.roomId, Date.now());
          log("OK", `Accepted invite: ${inv.roomId}`);
        } else {
          await _client.rejectInvite(inv.roomId).catch(() => {});
          log("INFO", `Rejected invite: ${inv.roomId}`);
        }
        const joined = await _client.listJoinedRooms().catch(() => []);
        botStatus.matrix.joinedRooms = joined.map(r => r.name || r.room_id);
      }

      // Read all joined rooms
      const joined = await _client.listJoinedRooms().catch(() => []);
      const personality = await getPersonality();
      const chime = personality.chime_config
        ? (typeof personality.chime_config === "string" ? JSON.parse(personality.chime_config) : personality.chime_config)
        : { enabled: false };

      for (const room of joined) {
        const roomId = room.room_id || room;
        try {
          const { messages } = await _client.readMessages(roomId, { limit: 20 });
          if (!messages || messages.length === 0) continue;

          const checkpoint = roomCheckpoints.get(roomId) || BOT_START_TIME;
          const newMessages = messages.filter(m => (m.timestamp || 0) > checkpoint);

          if (newMessages.length === 0) continue;

          // Update checkpoint to latest message timestamp
          const latest = Math.max(...newMessages.map(m => m.timestamp || 0));
          roomCheckpoints.set(roomId, latest);

          const botUserId = botStatus.matrix.userId || "";

          for (const msg of newMessages) {
            if (msg.sender === botUserId) continue;
            const isDM = joined.length <= 2;
            await handleMessage(roomId, msg.sender, msg.body, isDM);
          }

          // Proactive chime
          if (chime.enabled && newMessages.length > 0) {
            const intervalMs = chime.interval_ms || 1800000;
            const minMessages = chime.min_messages || 5;
            const probability = chime.probability || 0.05;
            const now = Date.now();
            if (!botStatus.matrix.chimeWasEnabled) {
              botStatus.matrix.chimeWasEnabled = true;
              botStatus.matrix.lastChime = now;
            }
            const timeSinceLast = now - (botStatus.matrix.lastChime || now);
            const lastMsg = newMessages[newMessages.length - 1];
            const lastWasBot = lastMsg?.sender === botUserId;
            if (timeSinceLast > intervalMs && newMessages.length >= minMessages && Math.random() < probability && !lastWasBot) {
              const systemPrompt = await buildSystemPrompt(false);
              const context = newMessages.slice(-8).map(m => ({ sender: m.sender, body: m.body }));
              const reply = await getProactiveMessage(context, systemPrompt, process.env.BOT_NAME || "Zara");
              await _client.sendMessage(roomId, reply);
              botStatus.matrix.lastChime = Date.now();
              log("INFO", "Proactive chime sent");
            }
          } else if (!chime.enabled) {
            botStatus.matrix.chimeWasEnabled = false;
          }
        } catch (err) {
          log("ERROR", `Room ${roomId} error: ${err.message}`);
        }
      }

      botStatus.matrix.lastSync = new Date().toISOString();
    } catch (err) {
      log("ERROR", `Poll error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }
}

export async function startMatrix() {
  const privateKey = process.env.BOT_WALLET_PRIVATE_KEY;
  const apiBase = process.env.SUBNET_API_BASE || "https://abliterate.ai";

  if (!privateKey || privateKey.includes("your_")) {
    setMatrixState("failed", "no private key configured");
    log("WARN", "BOT_WALLET_PRIVATE_KEY not set — skipping Matrix adapter");
    return;
  }

  try {
    _client = new SubnetClient({ privateKey, apiBase });

    const creds = await _client.getCredentials();
    botStatus.matrix.userId = creds.matrix_username;
    log("OK", `Credentials: ${creds.matrix_username}`);

    await _client.loginMatrix();
    setMatrixState("ready");
    log("OK", "Matrix login successful");

    // Accept pending invites on startup
    const invites = await _client.listInvites().catch(() => []);
    for (const inv of invites) {
      await _client.acceptInvite(inv.roomId).catch(() => {});
      log("OK", `Accepted invite: ${inv.roomId}`);
    }

    // Get joined rooms
    const joined = await _client.listJoinedRooms().catch(() => []);
    botStatus.matrix.joinedRooms = joined.map(r => r.name || r.room_id);
    log("OK", `Joined rooms: ${botStatus.matrix.joinedRooms.join(", ")}`);

    // Start polling
    pollLoop();

  } catch (err) {
    const label = err.message?.includes("403") || err.message?.includes("Invalid")
      ? "login failed — invalid credentials"
      : `login failed — ${err.message}`;
    setMatrixState("failed", label);
    log("ERROR", `Matrix error: ${err.message}`);
  }
}

export async function setMatrixAvatar(imageUrl) {
  log("WARN", "Avatar setting not yet supported in subnet-client adapter");
}
