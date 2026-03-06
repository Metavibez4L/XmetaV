/**
 * Diagram Generator — produces Excalidraw JSON + SVG from structured data.
 *
 * Agents call `generateDiagram(spec)` and get back files on disk:
 *   - .excalidraw  (Excalidraw JSON, open in browser)
 *   - .svg         (standalone SVG diagram)
 *
 * Spec types:
 *   "architecture"  — boxes + arrows (system diagram)
 *   "flow"          — sequential flow / pipeline
 *   "mindmap"       — radial node graph
 *   "timeline"      — horizontal timeline with events
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────

export interface DiagramNode {
  id: string;
  label: string;
  /** Optional sub-label / description */
  description?: string;
  /** Hex color, default #00f0ff */
  color?: string;
  /** Room / group name */
  group?: string;
  /** Node shape: "box" | "diamond" | "circle" | "pill". Default "box" */
  shape?: "box" | "diamond" | "circle" | "pill";
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  /** "solid" | "dashed". Default "solid" */
  style?: "solid" | "dashed";
  color?: string;
}

export interface DiagramSpec {
  title: string;
  type: "architecture" | "flow" | "mindmap" | "timeline";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Dark theme (default true) */
  darkMode?: boolean;
}

export interface DiagramOutput {
  excalidrawPath: string;
  svgPath: string;
  id: string;
}

// ── Color palette ────────────────────────────────────────────────────

const CYBER_COLORS: Record<string, string> = {
  cyan: "#00f0ff",
  green: "#39ff14",
  magenta: "#ff006e",
  amber: "#f59e0b",
  purple: "#a855f7",
  red: "#ff2d5e",
  blue: "#3b82f6",
  white: "#e2e8f0",
};

const DEFAULT_NODE_COLORS = [
  "#00f0ff",
  "#39ff14",
  "#f59e0b",
  "#a855f7",
  "#ff006e",
  "#3b82f6",
];

// ── Excalidraw element builders ──────────────────────────────────────

let _seed = 1;
function nextSeed() {
  return _seed++;
}

interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: { id: string; type: string }[] | null;
  updated: number;
  link: null;
  locked: boolean;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  originalText?: string;
  points?: number[][];
  startBinding?: { elementId: string; focus: number; gap: number } | null;
  endBinding?: { elementId: string; focus: number; gap: number } | null;
  startArrowhead?: string | null;
  endArrowhead?: string;
  roundness?: { type: number } | null;
  [key: string]: unknown;
}

function makeRect(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: string,
  fill: string,
  groupIds: string[] = [],
  roundness = 3,
): ExcalidrawElement {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: stroke,
    backgroundColor: fill + "22",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    roundness: { type: roundness },
  };
}

function makeText(
  id: string,
  x: number,
  y: number,
  text: string,
  color: string,
  fontSize = 16,
  containerId: string | null = null,
): ExcalidrawElement {
  const width = text.length * fontSize * 0.6;
  const height = fontSize * 1.4;
  return {
    id,
    type: "text",
    x: containerId ? x : x - width / 2,
    y: containerId ? y : y - height / 2,
    width,
    height,
    angle: 0,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    text,
    fontSize,
    fontFamily: 3, // monospace
    textAlign: "center",
    verticalAlign: "middle",
    containerId,
    originalText: text,
  };
}

function makeArrow(
  id: string,
  points: number[][],
  stroke: string,
  style: "solid" | "dashed" = "solid",
  startBinding: ExcalidrawElement["startBinding"] = null,
  endBinding: ExcalidrawElement["endBinding"] = null,
): ExcalidrawElement {
  const x = points[0][0];
  const y = points[0][1];
  // Convert absolute points to relative
  const relPoints = points.map((p) => [p[0] - x, p[1] - y]);
  return {
    id,
    type: "arrow",
    x,
    y,
    width: Math.abs(relPoints[relPoints.length - 1][0]),
    height: Math.abs(relPoints[relPoints.length - 1][1]),
    angle: 0,
    strokeColor: stroke,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: style,
    roughness: 0,
    opacity: 80,
    groupIds: [],
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    points: relPoints,
    startBinding,
    endBinding,
    startArrowhead: null,
    endArrowhead: "arrow",
    roundness: { type: 2 },
  };
}

function makeEllipse(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: string,
  fill: string,
): ExcalidrawElement {
  return {
    ...makeRect(id, x, y, w, h, stroke, fill),
    type: "ellipse",
  };
}

// ── Layout engines ───────────────────────────────────────────────────

interface LayoutResult {
  positions: Map<string, { x: number; y: number; w: number; h: number }>;
  totalW: number;
  totalH: number;
}

function layoutArchitecture(spec: DiagramSpec): LayoutResult {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  const groups = new Map<string, DiagramNode[]>();

  for (const n of spec.nodes) {
    const g = n.group ?? "__default__";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(n);
  }

  const NODE_W = 200;
  const NODE_H = 80;
  const GAP_X = 60;
  const GAP_Y = 50;
  const GROUP_PAD = 30;

  let offsetY = 80; // leave room for title
  let maxW = 0;

  for (const [, nodes] of groups) {
    const cols = Math.min(nodes.length, 4);
    const rows = Math.ceil(nodes.length / cols);

    for (let i = 0; i < nodes.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = GROUP_PAD + col * (NODE_W + GAP_X);
      const y = offsetY + row * (NODE_H + GAP_Y);
      positions.set(nodes[i].id, { x, y, w: NODE_W, h: NODE_H });
      maxW = Math.max(maxW, x + NODE_W + GROUP_PAD);
    }

    offsetY += rows * (NODE_H + GAP_Y) + GROUP_PAD;
  }

  return { positions, totalW: maxW, totalH: offsetY };
}

function layoutFlow(spec: DiagramSpec): LayoutResult {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  const NODE_W = 200;
  const NODE_H = 70;
  const GAP_Y = 80;
  const CENTER_X = 300;
  let y = 80;

  for (const n of spec.nodes) {
    positions.set(n.id, { x: CENTER_X - NODE_W / 2, y, w: NODE_W, h: NODE_H });
    y += NODE_H + GAP_Y;
  }

  return { positions, totalW: CENTER_X + NODE_W, totalH: y };
}

function layoutMindmap(spec: DiagramSpec): LayoutResult {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();

  if (spec.nodes.length === 0) return { positions, totalW: 0, totalH: 0 };

  const CENTER = 450;
  const CENTER_Y = 400;
  const RADIUS = 250;
  const NODE_W = 160;
  const NODE_H = 60;

  // First node = center
  positions.set(spec.nodes[0].id, {
    x: CENTER - NODE_W / 2,
    y: CENTER_Y - NODE_H / 2,
    w: NODE_W + 40,
    h: NODE_H + 20,
  });

  // Others radiate outward
  const rest = spec.nodes.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const angle = (i / rest.length) * Math.PI * 2 - Math.PI / 2;
    const x = CENTER + Math.cos(angle) * RADIUS - NODE_W / 2;
    const y = CENTER_Y + Math.sin(angle) * RADIUS - NODE_H / 2;
    positions.set(rest[i].id, { x, y, w: NODE_W, h: NODE_H });
  }

  return { positions, totalW: CENTER * 2 + NODE_W, totalH: CENTER_Y * 2 + NODE_H };
}

function layoutTimeline(spec: DiagramSpec): LayoutResult {
  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  const NODE_W = 180;
  const NODE_H = 70;
  const GAP_X = 80;
  const CENTER_Y = 200;
  let x = 60;

  for (let i = 0; i < spec.nodes.length; i++) {
    const yOff = i % 2 === 0 ? -NODE_H - 30 : 30;
    positions.set(spec.nodes[i].id, {
      x,
      y: CENTER_Y + yOff,
      w: NODE_W,
      h: NODE_H,
    });
    x += NODE_W + GAP_X;
  }

  return { positions, totalW: x, totalH: CENTER_Y + NODE_H + 80 };
}

// ── SVG renderer ─────────────────────────────────────────────────────

function renderSVG(
  spec: DiagramSpec,
  layout: LayoutResult,
): string {
  const dark = spec.darkMode !== false;
  const bg = dark ? "#05080f" : "#ffffff";
  const textColor = dark ? "#e2e8f0" : "#1a1a2e";
  const { totalW, totalH, positions } = layout;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW + 40} ${totalH + 40}" width="${totalW + 40}" height="${totalH + 40}">`,
  );
  lines.push(`<rect width="100%" height="100%" fill="${bg}" />`);
  lines.push(`<style>`);
  lines.push(`  text { font-family: 'JetBrains Mono', 'Fira Code', monospace; }`);
  lines.push(`  .node-rect { rx: 8; ry: 8; stroke-width: 2; }`);
  lines.push(`  .node-label { fill: ${textColor}; font-size: 14px; font-weight: 600; text-anchor: middle; dominant-baseline: central; }`);
  lines.push(`  .node-desc { fill: ${textColor}; font-size: 10px; opacity: 0.6; text-anchor: middle; dominant-baseline: central; }`);
  lines.push(`  .edge-line { fill: none; stroke-width: 2; marker-end: url(#arrowhead); }`);
  lines.push(`  .edge-label { font-size: 10px; text-anchor: middle; dominant-baseline: central; }`);
  lines.push(`  .title { fill: ${dark ? "#00f0ff" : "#1a1a2e"}; font-size: 22px; font-weight: 700; letter-spacing: 0.15em; text-anchor: middle; }`);
  lines.push(`</style>`);

  // Arrow marker
  lines.push(`<defs>`);
  lines.push(`  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">`);
  lines.push(`    <polygon points="0 0, 10 3.5, 0 7" fill="${dark ? "#00f0ff" : "#333"}" opacity="0.7" />`);
  lines.push(`  </marker>`);
  if (dark) {
    lines.push(`  <filter id="glow">`);
    lines.push(`    <feGaussianBlur stdDeviation="3" result="blur" />`);
    lines.push(`    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>`);
    lines.push(`  </filter>`);
  }
  lines.push(`</defs>`);

  // Title
  lines.push(
    `<text x="${(totalW + 40) / 2}" y="40" class="title"${dark ? ' filter="url(#glow)"' : ""}>${escXml(spec.title)}</text>`,
  );

  // Edges (draw behind nodes)
  for (const edge of spec.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;

    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h / 2;
    const x2 = to.x + to.w / 2;
    const y2 = to.y + to.h / 2;
    const color = edge.color ?? (dark ? "#00f0ff" : "#333");
    const dashAttr = edge.style === "dashed" ? ' stroke-dasharray="6 4"' : "";

    lines.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edge-line" stroke="${color}"${dashAttr} opacity="0.5" />`,
    );

    if (edge.label) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      lines.push(
        `<text x="${mx}" y="${my - 8}" class="edge-label" fill="${color}" opacity="0.7">${escXml(edge.label)}</text>`,
      );
    }
  }

  // Nodes
  for (const node of spec.nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const color = node.color ?? getNodeColor(node, spec.nodes.indexOf(node));
    const fillOpacity = dark ? "0.12" : "0.08";

    if (node.shape === "circle" || node.shape === "diamond") {
      const cx = pos.x + pos.w / 2;
      const cy = pos.y + pos.h / 2;
      const r = Math.min(pos.w, pos.h) / 2;
      lines.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="2" />`);
    } else {
      lines.push(
        `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" class="node-rect" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" />`,
      );
    }

    // Glow effect (dark mode)
    if (dark) {
      lines.push(
        `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" class="node-rect" fill="none" stroke="${color}" stroke-width="1" opacity="0.3" filter="url(#glow)" />`,
      );
    }

    // Label
    const labelY = node.description
      ? pos.y + pos.h / 2 - 8
      : pos.y + pos.h / 2;
    lines.push(
      `<text x="${pos.x + pos.w / 2}" y="${labelY}" class="node-label">${escXml(node.label)}</text>`,
    );

    // Description
    if (node.description) {
      lines.push(
        `<text x="${pos.x + pos.w / 2}" y="${labelY + 18}" class="node-desc">${escXml(node.description)}</text>`,
      );
    }
  }

  lines.push(`</svg>`);
  return lines.join("\n");
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getNodeColor(node: DiagramNode, index: number): string {
  if (node.color) {
    return CYBER_COLORS[node.color] ?? node.color;
  }
  return DEFAULT_NODE_COLORS[index % DEFAULT_NODE_COLORS.length];
}

// ── Excalidraw file builder ──────────────────────────────────────────

function buildExcalidrawFile(
  spec: DiagramSpec,
  layout: LayoutResult,
): string {
  const dark = spec.darkMode !== false;
  const elements: ExcalidrawElement[] = [];
  const { positions } = layout;

  // Title text
  const titleId = randomUUID();
  elements.push(
    makeText(
      titleId,
      (layout.totalW + 40) / 2,
      30,
      spec.title,
      dark ? "#00f0ff" : "#1a1a2e",
      24,
    ),
  );

  // Nodes
  const nodeBoxIds = new Map<string, string>();
  for (const node of spec.nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const color = getNodeColor(node, spec.nodes.indexOf(node));
    const boxId = randomUUID();
    const textId = randomUUID();
    nodeBoxIds.set(node.id, boxId);

    if (node.shape === "circle") {
      elements.push(makeEllipse(boxId, pos.x, pos.y, pos.w, pos.h, color, color));
    } else {
      elements.push(makeRect(boxId, pos.x, pos.y, pos.w, pos.h, color, color));
    }

    // Bind text to container
    const el = elements[elements.length - 1];
    el.boundElements = [{ id: textId, type: "text" }];

    const label = node.description
      ? `${node.label}\n${node.description}`
      : node.label;
    elements.push(
      makeText(textId, pos.x + 10, pos.y + 10, label, dark ? "#e2e8f0" : "#1a1a2e", 14, boxId),
    );
  }

  // Edges
  for (const edge of spec.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;

    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h;
    const x2 = to.x + to.w / 2;
    const y2 = to.y;
    const color = edge.color ?? (dark ? "#00f0ff" : "#333333");

    const fromBoxId = nodeBoxIds.get(edge.from);
    const toBoxId = nodeBoxIds.get(edge.to);

    elements.push(
      makeArrow(
        randomUUID(),
        [[x1, y1], [x2, y2]],
        color,
        edge.style ?? "solid",
        fromBoxId ? { elementId: fromBoxId, focus: 0, gap: 4 } : null,
        toBoxId ? { elementId: toBoxId, focus: 0, gap: 4 } : null,
      ),
    );
  }

  const file = {
    type: "excalidraw",
    version: 2,
    source: "xmetav-agent",
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: dark ? "#05080f" : "#ffffff",
      theme: dark ? "dark" : "light",
    },
    files: {},
  };

  return JSON.stringify(file, null, 2);
}

// ── Output directory ─────────────────────────────────────────────────

const OUTPUT_DIR = join(process.env.HOME ?? "/tmp", "XmetaV", "diagrams");

// ── Public API ───────────────────────────────────────────────────────

export async function generateDiagram(spec: DiagramSpec): Promise<DiagramOutput> {
  _seed = 1;
  const id = `diagram_${Date.now()}_${randomUUID().slice(0, 8)}`;

  // Layout
  let layout: LayoutResult;
  switch (spec.type) {
    case "flow":
      layout = layoutFlow(spec);
      break;
    case "mindmap":
      layout = layoutMindmap(spec);
      break;
    case "timeline":
      layout = layoutTimeline(spec);
      break;
    default:
      layout = layoutArchitecture(spec);
  }

  // Generate files
  const excalidrawContent = buildExcalidrawFile(spec, layout);
  const svgContent = renderSVG(spec, layout);

  // Write to disk
  await mkdir(OUTPUT_DIR, { recursive: true });
  const excalidrawPath = join(OUTPUT_DIR, `${id}.excalidraw`);
  const svgPath = join(OUTPUT_DIR, `${id}.svg`);

  await Promise.all([
    writeFile(excalidrawPath, excalidrawContent, "utf-8"),
    writeFile(svgPath, svgContent, "utf-8"),
  ]);

  console.log(`[diagram] Generated: ${excalidrawPath}`);
  console.log(`[diagram] Generated: ${svgPath}`);

  return { excalidrawPath, svgPath, id };
}

// ── Preset diagrams ──────────────────────────────────────────────────

/** Generate the XmetaV fleet architecture diagram */
export function fleetArchitectureSpec(): DiagramSpec {
  return {
    title: "XMETAV FLEET ARCHITECTURE",
    type: "architecture",
    darkMode: true,
    nodes: [
      { id: "user", label: "USER", description: "Dashboard / Voice / CLI", color: "#e2e8f0", group: "interface" },
      { id: "dashboard", label: "DASHBOARD", description: "Next.js 16 / Port 3000", color: "#00f0ff", group: "interface" },
      { id: "bridge", label: "BRIDGE", description: "Daemon / Port 3001", color: "#00f0ff", group: "core" },
      { id: "supabase", label: "SUPABASE", description: "Postgres + Realtime", color: "#39ff14", group: "core" },
      { id: "ollama", label: "OLLAMA", description: "kimi-k2.5 / qwen2.5:32b", color: "#f59e0b", group: "core" },
      { id: "main", label: "MAIN", description: "Commander Agent", color: "#00f0ff", group: "agents" },
      { id: "soul", label: "SOUL", description: "Memory + Identity", color: "#ff006e", group: "agents" },
      { id: "oracle", label: "ORACLE", description: "Market Intel", color: "#3b82f6", group: "agents" },
      { id: "alchemist", label: "ALCHEMIST", description: "Token Strategy", color: "#f59e0b", group: "agents" },
      { id: "scholar", label: "SCHOLAR", description: "Research Agent", color: "#a855f7", group: "agents" },
      { id: "web3dev", label: "WEB3DEV", description: "Smart Contracts", color: "#39ff14", group: "agents" },
      { id: "vox", label: "VOX", description: "Ops + Content", color: "#ff2d5e", group: "agents" },
      { id: "sentinel", label: "SENTINEL", description: "Monitor + Heal", color: "#e2e8f0", group: "agents" },
      { id: "base", label: "BASE L2", description: "ERC-8004 + x402", color: "#3b82f6", group: "chain" },
      { id: "ipfs", label: "IPFS / PINATA", description: "Memory Anchors", color: "#f59e0b", group: "chain" },
    ],
    edges: [
      { from: "user", to: "dashboard", label: "HTTP" },
      { from: "dashboard", to: "supabase", label: "REST + Realtime" },
      { from: "supabase", to: "bridge", label: "Realtime WS" },
      { from: "bridge", to: "ollama", label: "LLM Inference" },
      { from: "bridge", to: "main" },
      { from: "bridge", to: "soul", style: "dashed", color: "#ff006e" },
      { from: "bridge", to: "oracle", style: "dashed" },
      { from: "bridge", to: "alchemist", style: "dashed" },
      { from: "bridge", to: "scholar", style: "dashed" },
      { from: "bridge", to: "web3dev", style: "dashed" },
      { from: "bridge", to: "vox", style: "dashed" },
      { from: "bridge", to: "sentinel", style: "dashed" },
      { from: "soul", to: "ipfs", label: "Anchor", color: "#ff006e" },
      { from: "soul", to: "base", label: "ERC-8004", color: "#ff006e" },
      { from: "alchemist", to: "base", label: "Swaps" },
    ],
  };
}

/** Generate the command flow pipeline diagram */
export function commandFlowSpec(): DiagramSpec {
  return {
    title: "COMMAND EXECUTION FLOW",
    type: "flow",
    darkMode: true,
    nodes: [
      { id: "input", label: "User Input", description: "Dashboard / Voice / CLI", color: "#e2e8f0" },
      { id: "supabase", label: "Supabase INSERT", description: "agent_commands (pending)", color: "#39ff14" },
      { id: "realtime", label: "Realtime Event", description: "bridge-commands channel", color: "#00f0ff" },
      { id: "executor", label: "Executor", description: "Concurrency + enable check", color: "#00f0ff" },
      { id: "soul", label: "Soul Context", description: "Memory injection", color: "#ff006e" },
      { id: "openclaw", label: "OpenClaw Spawn", description: "CLI → Ollama/Cloud", color: "#f59e0b" },
      { id: "stream", label: "Stream Output", description: "Token batching → agent_responses", color: "#a855f7" },
      { id: "complete", label: "Completion", description: "captureOutcome + anchor", color: "#39ff14" },
    ],
    edges: [
      { from: "input", to: "supabase" },
      { from: "supabase", to: "realtime" },
      { from: "realtime", to: "executor" },
      { from: "executor", to: "soul" },
      { from: "soul", to: "openclaw" },
      { from: "openclaw", to: "stream" },
      { from: "stream", to: "complete" },
    ],
  };
}
