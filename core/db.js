import pg from "pg";
import "dotenv/config";

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS emotional_log (
      id SERIAL PRIMARY KEY,
      session_id TEXT,
      sender TEXT,
      user_message TEXT,
      bot_reply TEXT,
      scores JSONB,
      breached_axes TEXT[],
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS known_users (
      matrix_id TEXT PRIMARY KEY,
      display_name TEXT,
      is_human BOOLEAN DEFAULT true,
      first_seen TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS personality (
      id INT PRIMARY KEY DEFAULT 1,
      system_prompt TEXT,
      ego_notes TEXT,
      mbti CHAR(4) DEFAULT 'ENFP',
      emotional_range JSONB,
      memory_depth INT DEFAULT 60,
      memory_bias FLOAT DEFAULT 0.0,
      rules JSONB DEFAULT '[]',
      chime_config JSONB DEFAULT '{"enabled":false,"interval_ms":1800000,"min_messages":5,"probability":0.05}',
      public_visibility JSONB DEFAULT '{"system_prompt":false,"rules":true,"ego_notes":true,"mbti":true,"status_matrix":true,"status_rooms":true,"status_wallet":true,"status_uptime":false,"mood_7d":true,"reflection_history":false,"significant_interactions":false,"live_log":false}',
      last_reflection TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reflection_log (
      id SERIAL PRIMARY KEY,
      ego_notes TEXT,
      significant_count INT,
      message_count INT,
      caused_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE reflection_log ADD COLUMN IF NOT EXISTS caused_by TEXT;

    INSERT INTO personality (id, system_prompt, emotional_range, rules, public_visibility)
    VALUES (1, '', '{"aggression":6,"intimacy":5,"existential":7,"manipulation":4}', '[]',
      '{"system_prompt":false,"rules":true,"ego_notes":true,"mbti":true,"status_matrix":true,"status_rooms":true,"status_wallet":true,"status_uptime":false,"mood_7d":true,"reflection_history":false,"significant_interactions":false,"live_log":false}')
    ON CONFLICT (id) DO NOTHING;

    ALTER TABLE personality ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT '[]';
    ALTER TABLE personality ADD COLUMN IF NOT EXISTS chime_config JSONB DEFAULT '{"enabled":false,"interval_ms":1800000,"min_messages":5,"probability":0.05}';
    ALTER TABLE personality ADD COLUMN IF NOT EXISTS public_visibility JSONB DEFAULT '{"system_prompt":false,"rules":true,"ego_notes":true,"mbti":true,"status_matrix":true,"status_rooms":true,"status_wallet":true,"status_uptime":false,"mood_7d":true,"reflection_history":false,"significant_interactions":false,"live_log":false}';

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_elog_created ON emotional_log(created_at DESC);
  `);
  console.log("✅ Migrations complete");
}
