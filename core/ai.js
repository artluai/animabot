import OpenAI from "openai";
import "dotenv/config";

const ai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const CHAT_MODEL = "qwen/qwen-plus";
const SCORE_MODEL = "qwen/qwen-turbo";

// Build the rules block to inject into the system prompt
export function buildRulesBlock(rules) {
  if (!rules || !Array.isArray(rules) || rules.length === 0) return "";
  const strict = rules.filter(r => r.level === "strict").map(r => `- ${r.text}`);
  const soft = rules.filter(r => r.level === "soft").map(r => `- ${r.text}`);
  let block = "";
  if (strict.length) block += `Strictly follow these rules:\n${strict.join("\n")}`;
  if (soft.length) {
    if (block) block += "\n\n";
    block += `Where natural, try to:\n${soft.join("\n")}`;
  }
  return block ? `\n\n${block}` : "";
}

export async function getReply(messages, systemPrompt, isDM = false) {
  const response = await ai.chat.completions.create({
    model: CHAT_MODEL,
    max_tokens: isDM ? 400 : 200,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });
  return response.choices[0].message.content;
}

export async function getProactiveMessage(recentMessages, systemPrompt, botName) {
  const context = recentMessages.map(m => `[${m.sender}]: ${m.body}`).join("\n");
  const response = await ai.chat.completions.create({
    model: CHAT_MODEL,
    max_tokens: 150,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Recent chat:\n${context}\n\nChime in naturally as ${botName}. Brief reaction, joke, or question.` },
    ],
  });
  return response.choices[0].message.content;
}

export async function scoreInteraction(userMessage, botReply, personality) {
  try {
    const response = await ai.chat.completions.create({
      model: SCORE_MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: "You are an emotional analyzer. Score the USER message 0-10 on each axis. Reply ONLY with valid JSON, no markdown.",
        },
        {
          role: "user",
          content: `Personality: ${personality}
User said: "${userMessage}"
Bot replied: "${botReply}"
Score on: aggression, intimacy, existential, manipulation
Format: {"aggression":0,"intimacy":0,"existential":0,"manipulation":0,"reason":"one sentence"}`,
        },
      ],
    });
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return null;
  }
}

export async function generateReflection(breaches, messages, personality, botName, currentEgo) {
  const response = await ai.chat.completions.create({
    model: CHAT_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `You are analyzing the psychological state of an AI entity named ${botName}.

Current personality: ${personality}
Current ego notes: ${currentEgo || "none yet"}

In the last 24 hours:
Significant interactions (${breaches.length} total):
${breaches.map(b => `- [${b.breached_axes.join(",")}] "${b.user_message}" — ${b.reason}`).join("\n") || "none"}

Recent conversation sample:
${messages.slice(0, 20).map(m => `${m.role}: ${m.content}`).join("\n")}

Write a SHORT ego reflection (2-4 sentences) in first person as ${botName}.
Describe how today's interactions have subtly shifted how you feel.
Be specific to what actually happened. Don't be dramatic.
Return ONLY the reflection, no preamble.`,
      },
    ],
  });
  return response.choices[0].message.content;
}
