export type Room = "command" | "meeting" | "intel" | "web3Lab" | "devFloor" | "ops" | "soul";

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
  {
    id: "sentinel",
    label: "SENTINEL",
    color: 0xef4444,
    colorHex: "#ef4444",
    room: "command",
    tile: { col: 2.5, row: 1.5 },
    size: 28,
  },

  // ── SOUL OFFICE (left alcove, behind glass) ────────────────────
  {
    id: "soul",
    label: "SOUL",
    color: 0xff006e,
    colorHex: "#ff006e",
    room: "soul",
    tile: { col: 0.5, row: 3.5 },
    size: 30,
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
  {
    id: "midas",
    label: "MIDAS",
    color: 0xf59e0b,
    colorHex: "#f59e0b",
    room: "intel",
    tile: { col: 3, row: 9 },
    size: 26,
  },

  // ── WEB3 LAB (private cubicle, right of meeting area) ─────────
  {
    id: "web3dev",
    label: "WEB3DEV",
    color: 0xf97316,
    colorHex: "#f97316",
    room: "web3Lab",
    tile: { col: 8, row: 3.5 },
    size: 30,
  },

  // ── DEV FLOOR (bottom-right, open area — no walls) ─────────────
  {
    id: "akua",
    label: "AKUA",
    color: 0xa855f7,
    colorHex: "#a855f7",
    room: "devFloor",
    tile: { col: 6, row: 7 },
    size: 30,
  },
  {
    id: "akua_web",
    label: "AKUA_WEB",
    color: 0xc084fc,
    colorHex: "#c084fc",
    room: "devFloor",
    tile: { col: 6, row: 9 },
    size: 26,
  },
  {
    id: "basedintern",
    label: "BASEDINTERN",
    color: 0x39ff14,
    colorHex: "#39ff14",
    room: "devFloor",
    tile: { col: 8.5, row: 7 },
    size: 30,
  },
  {
    id: "basedintern_web",
    label: "BASEDINTERN_WEB",
    color: 0x4ade80,
    colorHex: "#4ade80",
    room: "devFloor",
    tile: { col: 8.5, row: 9 },
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
  { agentId: "sentinel", angle: 300 },        // upper-right (near operator)
  { agentId: "soul", angle: 195 },              // lower-left (observer seat)
  { agentId: "midas", angle: 165 },              // between oracle & alchemist
];

/** Static topology connections (kept for dispatch beam logic) */
export const ARENA_CONNECTIONS: [string, string][] = [
  // Command room
  ["operator", "main"],
  ["main", "sentinel"],
  ["sentinel", "briefing"],
  // Main -> intel agents
  ["main", "briefing"],
  ["main", "oracle"],
  ["main", "alchemist"],
  ["main", "midas"],
  // Intel internal
  ["oracle", "briefing"],
  ["oracle", "alchemist"],
  // Main -> web3dev (web3 lab)
  ["main", "web3dev"],
  ["web3dev", "alchemist"],
  // Main -> dev agents (dev floor)
  ["main", "akua"],
  ["main", "basedintern"],
  ["akua", "akua_web"],
  ["basedintern", "basedintern_web"],
  // Soul watches everyone
  ["soul", "main"],
  ["soul", "briefing"],
  ["soul", "oracle"],
  ["soul", "alchemist"],
  ["soul", "sentinel"],
  // Midas revenue connections
  ["midas", "oracle"],
  ["midas", "alchemist"],
  ["midas", "main"],
  ["midas", "soul"],
];
