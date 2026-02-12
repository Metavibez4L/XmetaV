/** Agent node configuration for the Arena visualization */
export interface AgentNodeConfig {
  id: string;
  label: string;
  shape: "hexagon" | "circle" | "diamond" | "eye";
  /** Color as 0xRRGGBB */
  color: number;
  /** Color as "#RRGGBB" for CSS */
  colorHex: string;
  /** Normalized position (0-1) relative to viewport */
  position: { x: number; y: number };
  /** Base radius in pixels */
  size: number;
}

export const ARENA_AGENTS: AgentNodeConfig[] = [
  {
    id: "operator",
    label: "OPERATOR",
    shape: "eye",
    color: 0xf59e0b,
    colorHex: "#f59e0b",
    position: { x: 0.5, y: 0.15 },
    size: 40,
  },
  {
    id: "main",
    label: "MAIN",
    shape: "hexagon",
    color: 0x00f0ff,
    colorHex: "#00f0ff",
    position: { x: 0.5, y: 0.5 },
    size: 48,
  },
  {
    id: "akua",
    label: "AKUA",
    shape: "circle",
    color: 0xa855f7,
    colorHex: "#a855f7",
    position: { x: 0.25, y: 0.45 },
    size: 36,
  },
  {
    id: "akua_web",
    label: "AKUA_WEB",
    shape: "circle",
    color: 0xc084fc,
    colorHex: "#c084fc",
    position: { x: 0.18, y: 0.72 },
    size: 30,
  },
  {
    id: "basedintern",
    label: "BASEDINTERN",
    shape: "diamond",
    color: 0x39ff14,
    colorHex: "#39ff14",
    position: { x: 0.75, y: 0.45 },
    size: 36,
  },
  {
    id: "basedintern_web",
    label: "BASEDINTERN_WEB",
    shape: "diamond",
    color: 0x4ade80,
    colorHex: "#4ade80",
    position: { x: 0.82, y: 0.72 },
    size: 30,
  },
];

/** Static topology connections drawn as dim lines */
export const ARENA_CONNECTIONS: [string, string][] = [
  ["operator", "main"],
  ["operator", "akua"],
  ["main", "akua"],
  ["main", "basedintern"],
  ["akua", "akua_web"],
  ["basedintern", "basedintern_web"],
];
