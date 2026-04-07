export const botStatus = {
  matrix: {
    state: "connecting",
    label: "matrix: connecting",
    error: null,
    lastSync: null,
    joinedRooms: [],
    attempts: 0,
  },
  wallet: { address: null, connected: false },
  startedAt: new Date().toISOString(),
  logs: [],
};

export function setMatrixState(state, error = null) {
  botStatus.matrix.state = state;
  botStatus.matrix.error = error;
  botStatus.matrix.label = {
    connecting: "matrix: connecting",
    ready: "matrix: ready",
    failed: error?.includes("403") || error?.includes("Invalid username")
      ? "matrix: login failed"
      : error?.includes("credentials")
      ? "matrix: no credentials"
      : "matrix: failed",
    disconnected: "matrix: disconnected",
  }[state] || `matrix: ${state}`;
}

export function log(level, msg) {
  const line = { ts: new Date().toISOString(), level, msg };
  console.log(`[${line.ts}] [${level}] ${msg}`);
  botStatus.logs.push(line);
  if (botStatus.logs.length > 100) botStatus.logs.shift();
}
