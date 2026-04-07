import { db } from "./db.js";

export async function censor(text) {
  if (!text) return text;
  text = text.replace(/@[\w.\-]+:[\w.\-]+/g, "******");
  try {
    const { rows } = await db.query(
      `SELECT display_name FROM known_users WHERE is_human = true AND display_name IS NOT NULL`
    );
    for (const { display_name } of rows) {
      if (!display_name || display_name.length < 2) continue;
      const escaped = display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "******");
    }
  } catch (_) {}
  return text;
}
