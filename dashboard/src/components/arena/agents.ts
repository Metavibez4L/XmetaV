export type Room = "command" | "meeting" | "intel" | "devFloor";

/** Agent node configuration for the HQ office visualization */
export interface AgentNodeConfig {
  id: string;
  label: string;
  color: number;
  colorHex: string;
  room: Room;
  /** Isometric tile position (col, row) in the office grid */
  tile: { col: number; row: number };
  /** Orb radius in pixels */
  size: number;
  /** True for operator (floats above, no desk) */
  floating?: boolean;
}

export const ARENA_AGENTS: AgentNodeConfig[] = [
  // ── COMMAND ROOM (top, walled) ──────────────────────────────────
  {
    id: "operator",
    label: "OPERATOR",
    color: 0xf59e0b,
    colorHex: "#f59e0b",
    room: "command",
    tile: { col: 5.5, row: 1 },
    size: 30,
    floating: true,
  },
  {
    id: "main",
    label: "MAIN",
    color: 0x00f0ff,
    colorHex: "#00f0ff",
    room: "command",
    tile: { col: 4, row: 1.5 },
    size: 38,
  },

  // ── INTEL ROOM (bottom-left, glass enclosed) ────────────────────
  {
    id: "briefing",
    label: "BRIEFING",
    color: 0x38bdf8,
    colorHex: "#38bdf8",
    room: "intel",
    tile: { col: 1, row: 7 },
    size: 26,
  },
  {
    id: "oracle",
    label: "ORACLE",
    color: 0xfbbf24,
    colorHex: "#fbbf24",
    room: "intel",
    tile: { col: 3, row: 7 },
    size: 26,
  },
  {
    id: "alchemist",
    label: "ALCHEMIST",
    color: 0xe879f9,
    colorHex: "#e879f9",
    room: "intel",
    tile: { col: 1, row: 9 },
    size: 26,
  },

  // ── DEV FLOOR (bottom-right, open area — no walls) ─────────────
  {
    id: "web3dev",
    label: "WEB3DEV",
    color: 0xf97316,
    colorHex: "#f97316",
    room: "devFloor",
    tile: { col: 5.5, row: 7 },
    size: 30,
  },
  {
    id: "akua",
    label: "AKUA",
    color: 0xa855f7,
    colorHex: "#a855f7",
    room: "devFloor",
    tile: { col: 7.5, row: 7 },
    size: 30,
  },
  {
    id: "akua_web",
    label: "AKUA_WEB",
    color: 0xc084fc,
    colorHex: "#c084fc",
    room: "devFloor",
    tile: { col: 5.5, row: 9 },
    size: 26,
  },
  {
    id: "basedintern",
    label: "BASEDINTERN",
    color: 0x39ff14,
    colorHex: "#39ff14",
    room: "devFloor",
    tile: { col: 9, row: 7 },
    size: 30,
  },
  {
    id: "basedintern_web",
    label: "BASEDINTERN_WEB",
    color: 0x4ade80,
    colorHex: "#4ade80",
    room: "devFloor",
    tile: { col: 7.5, row: 9 },
    size: 26,
  },
];

/** Meeting table center tile (for dispatch beam routing) */
export const MEETING_TABLE_TILE = { col: 4.5, row: 4.5 };

/** Seat assignments around the meeting table.
 *  Angles are in degrees, radius is in screen pixels from table center. */
export const MEETING_SEATS: { agentId: string; angle: number }[] = [
  { agentId: "main", angle: 270 },           // top seat (facing table)
  { agentId: "operator", angle: 330 },        // upper-right
  { agentId: "briefing", angle: 210 },        // upper-left
  { agentId: "oracle", angle: 150 },          // lower-left
  { agentId: "alchemist", angle: 180 },       // bottom center
  { agentId: "akua", angle: 240 },            // left
  { agentId: "basedintern", angle: 30 },      // lower-right
  { agentId: "akua_web", angle: 120 },        // bottom-left
  { agentId: "basedintern_web", angle: 60 },  // bottom-right
  { agentId: "web3dev", angle: 0 },           // right center
];

/** Static topology connections (kept for dispatch beam logic) */
export const ARENA_CONNECTIONS: [string, string][] = [
  // Command room
  ["operator", "main"],
  // Main -> intel agents
  ["main", "briefing"],
  ["main", "oracle"],
  ["main", "alchemist"],
  // Intel internal
  ["oracle", "briefing"],
  ["oracle", "alchemist"],
  // Main -> dev agents
  ["main", "akua"],
  ["main", "basedintern"],
  // Main -> web3dev
  ["main", "web3dev"],
  // Dev pairs
  ["web3dev", "akua"],
  ["web3dev", "basedintern"],
  ["akua", "akua_web"],
  ["basedintern", "basedintern_web"],
];
