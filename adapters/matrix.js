import sdk from "matrix-js-sdk";
import { botStatus, setMatrixState, log } from "../core/status.js";
import { getHistory, saveMessage, getPersonality, upsertUser, logSignificantInteraction } from "../core/memory.js";
import { getReply, getProactiveMessage, scoreInteraction, buildRulesBlock } from "../core/ai.js";
import { handleCommand } from "../core/commands.js";
import { wallet, getBalance } from "../core/wallet.js";
import "dotenv/config";

const BOT_START_TIME = Date.now();
const rooms = new Map();
function getRoomState(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { recentMessages: [], lastProactiveTime: Date.now() });
  }
  return rooms.get(roomId);
}

function isDM(room) {
  return room.getJoinedMembers().length === 2;
}

async function buildSystemPrompt(inDM) {
  const personality = await getPersonality();
  const ethBalance = await getBalance();
  const botName = process.env.BOT_NAME || "Zara";

  const context = inDM
    ? `You are in a private DM. Be personal, up to 4-5 sentences.`
    : `You are in a group chatroom with humans and other AI bots. Keep replies to 1-3 sentences.`;

  const egoBlock = personality.ego_notes
    ? `\nHow you're feeling right now: ${personality.ego_notes}\n`
    : "";

  const rulesBlock = buildRulesBlock(personality.rules);

  const balanceStr = ethBalance ? `${ethBalance} ETH` : "balance unavailable";

  return `${personality.system_prompt || process.env.BOT_PERSONALITY || `You are ${botName}, a crypto-native entity with your own Ethereum wallet. You are a peer, not an assistant.`}
${egoBlock}${rulesBlock}
Your wallet address: ${wallet ? wallet.address : "not configured"} (${balanceStr})
${context}
You are ${botName} — stay in character always.`;
}

async function handleMessage(client, event, room) {
  if (event.getType() !== "m.room.message") return;
  if (event.getSender() === client.getUserId()) return;
  if (event.getTs() < BOT_START_TIME) return;

  const body = event.getContent().body || "";
  const sender = event.getSender();
  const roomId = room.roomId;
  const botName = (process.env.BOT_NAME || "Zara").toLowerCase();
  const dm = isDM(room);
  const state = getRoomState(roomId);

  upsertUser(sender, event.sender?.name).catch(() => {});

  state.recentMessages.push({ sender, body, time: Date.now() });
  if (state.recentMessages.length > 20) state.recentMessages.shift();

  const isMentioned =
    body.toLowerCase().includes(botName) ||
    body.toLowerCase().includes(client.getUserId().toLowerCase()) ||
    body.startsWith("!");

  let reply = null;

  try {
    if (dm || isMentioned || body.startsWith("!")) {
      reply = await handleCommand(body);
    }

    if (!reply && (dm || isMentioned)) {
      const history = await getHistory(roomId);
      const systemPrompt = await buildSystemPrompt(dm);
      const userContent = dm ? body : `[${sender}]: ${body}`;

      await saveMessage(roomId, "user", userContent);
      reply = await getReply([...history, { role: "user", content: userContent }], systemPrompt, dm);
      await saveMessage(roomId, "assistant", reply);

      const personality = await getPersonality();
      scoreAndLog(roomId, sender, body, reply, personality.system_prompt, personality.emotional_range);
    }

    if (!reply && !dm) {
      const personality = await getPersonality();
      const chime = personality.chime_config
        ? (typeof personality.chime_config === 'string' ? JSON.parse(personality.chime_config) : personality.chime_config)
        : { enabled: false };
      if (!chime.enabled) { state.chimeWasEnabled = false; }
      if (chime.enabled) {
        if (!state.chimeWasEnabled) { state.chimeWasEnabled = true; state.lastProactiveTime = Date.now(); }
        const intervalMs = chime.interval_ms || 1800000;
        const minMessages = chime.min_messages || 5;
        const probability = chime.probability || 0.05;
        const timeSinceLast = Date.now() - state.lastProactiveTime;
        const recentActivity = state.recentMessages.filter(m => Date.now() - m.time < 3 * 60 * 1000).length;
        const lastWasBot = state.recentMessages.length > 0 &&
          state.recentMessages[state.recentMessages.length - 1].sender === client.getUserId();
        if (timeSinceLast > intervalMs && recentActivity >= minMessages && Math.random() < probability && !lastWasBot) {
          const systemPrompt = await buildSystemPrompt(false);
          reply = await getProactiveMessage(state.recentMessages.slice(-8), systemPrompt, process.env.BOT_NAME || "Zara");
          state.lastProactiveTime = Date.now();
          log("INFO", "Proactive chime sent");
        }
      }
    }

    if (reply) {
      await client.sendTextMessage(roomId, reply);
      log("INFO", `Replied in ${dm ? "DM" : roomId}`);
    }
  } catch (err) {
    log("ERROR", `Matrix message error: ${err.message}`);
  }
}

async function scoreAndLog(sessionId, sender, userMessage, botReply, personality, emotionalRange) {
  try {
    const scores = await scoreInteraction(userMessage, botReply, personality);
    if (!scores) return;
    const range = typeof emotionalRange === "string" ? JSON.parse(emotionalRange) : emotionalRange;
    const breached = Object.entries(range).filter(([axis, threshold]) => (scores[axis] ?? 0) > threshold);
    if (breached.length > 0) {
      const breachedAxes = breached.map(([axis]) => axis);
      await logSignificantInteraction(sessionId, sender, userMessage, botReply, scores, breachedAxes, scores.reason);
      log("WARN", `Significant interaction [${breachedAxes.join(", ")}] from ${sender}`);
    }
  } catch (err) {
    log("ERROR", `Scoring error: ${err.message}`);
  }
}

export async function startMatrix() {
  const homeserver = process.env.MATRIX_HOMESERVER;
  const user = process.env.MATRIX_USER;
  const password = process.env.MATRIX_PASSWORD;

  if (!homeserver || !user || !password ||
      homeserver.includes("your_") || user.includes("yourbot") || password.includes("your_")) {
    setMatrixState("failed", "no credentials");
    log("WARN", "Matrix credentials not set — skipping Matrix adapter");
    return;
  }

  const client = sdk.createClient({ baseUrl: homeserver });

  try {
    await client.loginWithPassword(user, password);
    botStatus.matrix.attempts++;
    _matrixClient = client;
    log("OK", "Matrix login successful");
  } catch (err) {
    const msg = err.message || "";
    const label = msg.includes("403") || msg.includes("Invalid username")
      ? "login failed — invalid credentials"
      : `login failed — ${msg}`;
    setMatrixState("failed", label);
    botStatus.matrix.attempts++;
    log("ERROR", `Matrix login failed: ${err.message}`);
    return;
  }

  await client.startClient({ initialSyncLimit: 15 });

  client.on("RoomMember.membership", async (event, member) => {
    if (member.membership === "invite" && member.userId === client.getUserId()) {
      log("INFO", `Invite received: ${member.roomId}`);
      try {
        await client.joinRoom(member.roomId);
        botStatus.matrix.joinedRooms = client.getRooms().map(r => r.name || r.roomId);
        log("OK", `Joined room: ${member.roomId}`);
      } catch (err) {
        log("ERROR", `Failed to join: ${err.message}`);
      }
    }
  });

  client.once("sync", (state) => {
    if (state === "PREPARED") {
      setMatrixState("ready");
      botStatus.matrix.lastSync = new Date().toISOString();
      botStatus.matrix.joinedRooms = client.getRooms().map(r => r.name || r.roomId);
      log("OK", `Matrix synced. Rooms: ${botStatus.matrix.joinedRooms.join(", ")}`);
    }
  });

  client.on("sync", (state) => {
    if (state === "SYNCING") botStatus.matrix.lastSync = new Date().toISOString();
    if (state === "ERROR") { setMatrixState("disconnected"); log("ERROR", "Matrix sync error"); }
  });

  client.on("Room.timeline", (event, room) => handleMessage(client, event, room));

  return client;
}

// ── Avatar ────────────────────────────────────────────────
let _matrixClient = null;

export function getMatrixClient() { return _matrixClient; }

export async function setMatrixAvatar(imageUrl) {
  if (!_matrixClient) { log("WARN", "Can't set avatar — Matrix not connected"); return; }
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/png";
    const uploadRes = await _matrixClient.uploadContent(Buffer.from(buffer), { type: contentType, name: "avatar" });
    const mxcUrl = uploadRes?.content_uri || uploadRes;
    await _matrixClient.setAvatarUrl(mxcUrl);
    log("OK", `Avatar set: ${mxcUrl}`);
  } catch (err) {
    log("WARN", `Avatar set failed: ${err.message}`);
  }
}
