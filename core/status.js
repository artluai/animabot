export const botStatus = {
  matrix: {
    state: "connecting",
    error: null,
    lastSync: null,
    joinedRooms: [],
    attempts: 0,
  },
  wallet: { address: null, connected: false },
  startedAt: new Date().toISOString(),
  logs: [],
};

export function log(level, msg) {
  const line = { ts: new Date().toISOString(), level, msg };
  console.log(`[${line.ts}] [${level}] ${msg}`);
  botStatus.logs.push(line);
  if (botStatus.logs.length > 100) botStatus.logs.shift();
}
