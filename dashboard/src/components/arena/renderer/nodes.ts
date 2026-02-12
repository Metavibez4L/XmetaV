import { Application, Container, Graphics, BlurFilter } from "pixi.js";
import {
  ARENA_AGENTS,
  ARENA_CONNECTIONS,
  type AgentNodeConfig,
} from "../agents";

export type NodeState = "idle" | "busy" | "offline";

export interface NodesApi {
  setState(agentId: string, state: NodeState): void;
  getPosition(agentId: string): { x: number; y: number } | null;
  resize(w: number, h: number): void;
  destroy(): void;
}

interface NodeEntry {
  config: AgentNodeConfig;
  container: Container;
  glow: Graphics;
  main: Graphics;
  ring: Graphics;
  state: NodeState;
  absX: number;
  absY: number;
}

export function initNodes(app: Application): NodesApi {
  const layer = new Container();
  app.stage.addChild(layer);

  const linesLayer = new Container();
  layer.addChild(linesLayer);

  const nodesLayer = new Container();
  layer.addChild(nodesLayer);

  const nodes = new Map<string, NodeEntry>();
  let canvasW = app.screen.width;
  let canvasH = app.screen.height;

  // -- Create nodes ---------------------------------------------------
  for (const cfg of ARENA_AGENTS) {
    const absX = cfg.position.x * canvasW;
    const absY = cfg.position.y * canvasH;

    const container = new Container();
    container.position.set(absX, absY);

    // Glow (blurred larger copy)
    const glow = new Graphics();
    fillShape(glow, cfg.shape, cfg.size * 1.5, cfg.color, 0.25);
    glow.filters = [new BlurFilter({ strength: 15, quality: 3 })];
    container.addChild(glow);

    // Main shape (fill + stroke)
    const main = new Graphics();
    fillShape(main, cfg.shape, cfg.size, cfg.color, 0.12);
    strokeShape(main, cfg.shape, cfg.size, cfg.color, 0.85, 2);
    container.addChild(main);

    // Inner spinning ring (visible only when busy)
    const ring = new Graphics();
    ring.circle(0, 0, cfg.size * 0.55);
    ring.stroke({ color: cfg.color, width: 1.5, alpha: 0.6 });
    ring.visible = false;
    container.addChild(ring);

    nodesLayer.addChild(container);
    nodes.set(cfg.id, {
      config: cfg,
      container,
      glow,
      main,
      ring,
      state: "idle",
      absX,
      absY,
    });
  }

  // -- Static connection lines ----------------------------------------
  function drawConnections() {
    linesLayer.removeChildren();
    for (const [aId, bId] of ARENA_CONNECTIONS) {
      const a = nodes.get(aId);
      const b = nodes.get(bId);
      if (!a || !b) continue;
      const line = new Graphics();
      line.moveTo(a.absX, a.absY);
      line.lineTo(b.absX, b.absY);
      line.stroke({ color: 0x00f0ff, width: 0.6, alpha: 0.06 });
      linesLayer.addChild(line);
    }
  }
  drawConnections();

  // -- Animation ticker -----------------------------------------------
  let time = 0;
  const tick = (ticker: { deltaMS: number }) => {
    time += ticker.deltaMS / 1000;

    for (const entry of nodes.values()) {
      const phase = entry.config.position.x * 10;
      switch (entry.state) {
        case "idle": {
          const s = 1 + Math.sin(time * 2 + phase) * 0.04;
          entry.container.scale.set(s);
          entry.glow.alpha = 0.4 + Math.sin(time * 1.5 + phase) * 0.15;
          entry.ring.visible = false;
          entry.main.alpha = 1;
          break;
        }
        case "busy": {
          const s = 1 + Math.sin(time * 3) * 0.03;
          entry.container.scale.set(s);
          entry.glow.alpha = 0.8 + Math.sin(time * 4) * 0.2;
          entry.ring.visible = true;
          entry.ring.rotation = time * 2;
          entry.main.alpha = 1;
          break;
        }
        case "offline": {
          entry.container.scale.set(1);
          entry.glow.alpha = 0.08;
          entry.ring.visible = false;
          entry.main.alpha = 0.3 + (Math.random() > 0.95 ? 0.3 : 0);
          break;
        }
      }
    }
  };
  app.ticker.add(tick);

  // -- Public API -----------------------------------------------------
  return {
    setState(agentId, state) {
      const n = nodes.get(agentId);
      if (n) n.state = state;
    },
    getPosition(agentId) {
      const n = nodes.get(agentId);
      return n ? { x: n.absX, y: n.absY } : null;
    },
    resize(w, h) {
      canvasW = w;
      canvasH = h;
      for (const entry of nodes.values()) {
        entry.absX = entry.config.position.x * w;
        entry.absY = entry.config.position.y * h;
        entry.container.position.set(entry.absX, entry.absY);
      }
      drawConnections();
    },
    destroy() {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    },
  };
}

// -- Shape drawing helpers --------------------------------------------

function hexPoints(size: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(Math.cos(a) * size, Math.sin(a) * size);
  }
  return pts;
}

function diamondPoints(size: number): number[] {
  return [0, -size, size * 0.7, 0, 0, size, -size * 0.7, 0];
}

function drawEyePath(g: Graphics, size: number) {
  g.moveTo(-size, 0);
  g.bezierCurveTo(
    -size * 0.5, -size * 0.7,
    size * 0.5, -size * 0.7,
    size, 0,
  );
  g.bezierCurveTo(
    size * 0.5, size * 0.7,
    -size * 0.5, size * 0.7,
    -size, 0,
  );
  g.closePath();
}

function fillShape(
  g: Graphics,
  shape: string,
  size: number,
  color: number,
  alpha: number,
) {
  switch (shape) {
    case "hexagon":
      g.poly(hexPoints(size), true).fill({ color, alpha });
      break;
    case "circle":
      g.circle(0, 0, size).fill({ color, alpha });
      break;
    case "diamond":
      g.poly(diamondPoints(size), true).fill({ color, alpha });
      break;
    case "eye":
      drawEyePath(g, size);
      g.fill({ color, alpha });
      g.circle(0, 0, size * 0.28).fill({ color, alpha: alpha + 0.2 });
      break;
  }
}

function strokeShape(
  g: Graphics,
  shape: string,
  size: number,
  color: number,
  alpha: number,
  width: number,
) {
  switch (shape) {
    case "hexagon":
      g.poly(hexPoints(size), true).stroke({ color, width, alpha });
      break;
    case "circle":
      g.circle(0, 0, size).stroke({ color, width, alpha });
      break;
    case "diamond":
      g.poly(diamondPoints(size), true).stroke({ color, width, alpha });
      break;
    case "eye":
      drawEyePath(g, size);
      g.stroke({ color, width, alpha });
      g.circle(0, 0, size * 0.28).stroke({
        color,
        width: width * 0.75,
        alpha: alpha * 0.8,
      });
      break;
  }
}
