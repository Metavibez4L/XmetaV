export type Room = "bossOffice" | "meeting" | "leftWing" | "rightWing";

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
  {
    id: "operator",
    label: "OPERATOR",
    color: 0xf59e0b,
    colorHex: "#f59e0b",
    room: "bossOffice",
    tile: { col: 5, row: 1.5 },
    size: 30,
    floating: true,
  },
  {
    id: "main",
    label: "MAIN",
    color: 0x00f0ff,
    colorHex: "#00f0ff",
    room: "bossOffice",
    tile: { col: 4, row: 1.5 },
    size: 38,
  },
  {
    id: "akua",
    label: "AKUA",
    color: 0xa855f7,
    colorHex: "#a855f7",
    room: "leftWing",
    tile: { col: 1.5, row: 4 },
    size: 30,
  },
  {
    id: "akua_web",
    label: "AKUA_WEB",
    color: 0xc084fc,
    colorHex: "#c084fc",
    room: "leftWing",
    tile: { col: 1.5, row: 6 },
    size: 26,
  },
  {
    id: "basedintern",
    label: "BASEDINTERN",
    color: 0x39ff14,
    colorHex: "#39ff14",
    room: "rightWing",
    tile: { col: 7.5, row: 4 },
    size: 30,
  },
  {
    id: "basedintern_web",
    label: "BASEDINTERN_WEB",
    color: 0x4ade80,
    colorHex: "#4ade80",
    room: "rightWing",
    tile: { col: 7.5, row: 6 },
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
  { agentId: "akua", angle: 210 },            // upper-left
  { agentId: "basedintern", angle: 30 },      // lower-right
  { agentId: "akua_web", angle: 150 },        // lower-left
  { agentId: "basedintern_web", angle: 90 },  // bottom
];

/** Static topology connections (kept for dispatch beam logic) */
export const ARENA_CONNECTIONS: [string, string][] = [
  ["operator", "main"],
  ["operator", "akua"],
  ["main", "akua"],
  ["main", "basedintern"],
  ["akua", "akua_web"],
  ["basedintern", "basedintern_web"],
];
