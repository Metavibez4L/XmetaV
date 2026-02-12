import { Application, Container, Graphics } from "pixi.js";
import type { NodesApi } from "./nodes";

export interface EffectsApi {
  commandPulse(targetAgentId: string): void;
  streamStart(agentId: string): void;
  streamStop(agentId: string): void;
  dispatchBeam(fromId: string, toId: string): void;
  completionBurst(agentId: string): void;
  failureGlitch(agentId: string): void;
  destroy(): void;
}

// ── Internal types ─────────────────────────────────────

interface Particle {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface PulseProjectile {
  g: Graphics;
  trail: Graphics;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  duration: number;
}

interface BeamEntry {
  line: Graphics;
  dots: Graphics[];
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  duration: number;
}

interface BurstEntry {
  ring: Graphics;
  progress: number;
  x: number;
  y: number;
}

interface GlitchEntry {
  rects: Graphics[];
  progress: number;
  x: number;
  y: number;
}

// ── Init ───────────────────────────────────────────────

export function initEffects(
  app: Application,
  nodesApi: NodesApi,
): EffectsApi {
  const layer = new Container();
  app.stage.addChild(layer);

  const streamingAgents = new Set<string>();
  const particles: Particle[] = [];
  const pulses: PulseProjectile[] = [];
  const beams: BeamEntry[] = [];
  const bursts: BurstEntry[] = [];
  const glitches: GlitchEntry[] = [];

  // ── Ticker ───────────────────────────────────────────

  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS / 1000;

    // ── Streaming particles ──────────────────────
    for (const agentId of streamingAgents) {
      const pos = nodesApi.getPosition(agentId);
      if (!pos) continue;
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 60;
        const g = new Graphics();
        g.circle(0, 0, 1.2 + Math.random()).fill({
          color: 0x00f0ff,
          alpha: 0.7,
        });
        g.position.set(pos.x, pos.y);
        layer.addChild(g);
        particles.push({
          g,
          x: pos.x,
          y: pos.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 0.4 + Math.random() * 0.4,
        });
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.g.destroy();
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.g.position.set(p.x, p.y);
      p.g.alpha = (1 - p.life / p.maxLife) * 0.7;
    }

    // ── Pulse projectiles ────────────────────────
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.progress += dt / p.duration;
      if (p.progress >= 1) {
        p.g.destroy();
        p.trail.destroy();
        pulses.splice(i, 1);
        continue;
      }
      const t = p.progress;
      // Quadratic bezier — arc above straight line
      const midY = Math.min(p.fromY, p.toY) - 60;
      const x =
        (1 - t) * (1 - t) * p.fromX +
        2 * (1 - t) * t * ((p.fromX + p.toX) / 2) +
        t * t * p.toX;
      const y =
        (1 - t) * (1 - t) * p.fromY +
        2 * (1 - t) * t * midY +
        t * t * p.toY;
      p.g.position.set(x, y);
      p.g.alpha = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;
      // Trailing glow
      p.trail.position.set(x, y);
      p.trail.alpha = p.g.alpha * 0.4;
    }

    // ── Dispatch beams ───────────────────────────
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.progress += dt / b.duration;
      if (b.progress >= 1) {
        b.line.destroy();
        for (const d of b.dots) d.destroy();
        beams.splice(i, 1);
        continue;
      }
      const alpha =
        b.progress < 0.1
          ? b.progress / 0.1
          : b.progress > 0.8
            ? (1 - b.progress) / 0.2
            : 1;
      b.line.alpha = alpha * 0.5;
      for (let j = 0; j < b.dots.length; j++) {
        const t = (b.progress * 3 + j / b.dots.length) % 1;
        b.dots[j].position.set(
          b.fromX + (b.toX - b.fromX) * t,
          b.fromY + (b.toY - b.fromY) * t,
        );
        b.dots[j].alpha = alpha * 0.9;
      }
    }

    // ── Completion bursts ────────────────────────
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.progress += dt / 0.6;
      if (b.progress >= 1) {
        b.ring.destroy();
        bursts.splice(i, 1);
        continue;
      }
      const scale = 0.5 + b.progress * 3;
      b.ring.scale.set(scale);
      b.ring.alpha = 1 - b.progress;
    }

    // ── Failure glitches ─────────────────────────
    for (let i = glitches.length - 1; i >= 0; i--) {
      const gl = glitches[i];
      gl.progress += dt / 1;
      if (gl.progress >= 1) {
        for (const r of gl.rects) r.destroy();
        glitches.splice(i, 1);
        continue;
      }
      for (const r of gl.rects) {
        r.visible = Math.random() > 0.4;
        r.position.set(
          gl.x + (Math.random() - 0.5) * 80,
          gl.y + (Math.random() - 0.5) * 60,
        );
      }
    }
  };

  app.ticker.add(tick);

  // ── Public API ───────────────────────────────────────

  return {
    commandPulse(targetAgentId) {
      const from = nodesApi.getPosition("operator");
      const to = nodesApi.getPosition(targetAgentId);
      if (!from || !to) return;

      // Core dot
      const g = new Graphics();
      g.circle(0, 0, 6).fill({ color: 0xf59e0b, alpha: 0.9 });
      layer.addChild(g);

      // Trailing glow halo
      const trail = new Graphics();
      trail.circle(0, 0, 14).fill({ color: 0xf59e0b, alpha: 0.3 });
      layer.addChild(trail);

      pulses.push({
        g,
        trail,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        progress: 0,
        duration: 0.6,
      });
    },

    streamStart(agentId) {
      streamingAgents.add(agentId);
    },

    streamStop(agentId) {
      streamingAgents.delete(agentId);
    },

    dispatchBeam(fromId, toId) {
      const from = nodesApi.getPosition(fromId);
      const to = nodesApi.getPosition(toId);
      if (!from || !to) return;

      const line = new Graphics();
      line.moveTo(from.x, from.y);
      line.lineTo(to.x, to.y);
      line.stroke({ color: 0x00f0ff, width: 2, alpha: 0.5 });
      layer.addChild(line);

      const dots: Graphics[] = [];
      for (let j = 0; j < 4; j++) {
        const d = new Graphics();
        d.circle(0, 0, 3).fill({ color: 0x00f0ff, alpha: 0.9 });
        layer.addChild(d);
        dots.push(d);
      }

      beams.push({
        line,
        dots,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        progress: 0,
        duration: 2,
      });
    },

    completionBurst(agentId) {
      const pos = nodesApi.getPosition(agentId);
      if (!pos) return;

      const ring = new Graphics();
      ring.circle(0, 0, 20).stroke({
        color: 0xffffff,
        width: 2,
        alpha: 0.9,
      });
      ring.position.set(pos.x, pos.y);
      layer.addChild(ring);

      bursts.push({ ring, progress: 0, x: pos.x, y: pos.y });
    },

    failureGlitch(agentId) {
      const pos = nodesApi.getPosition(agentId);
      if (!pos) return;

      const rects: Graphics[] = [];
      for (let j = 0; j < 6; j++) {
        const r = new Graphics();
        const rw = 10 + Math.random() * 30;
        const rh = 3 + Math.random() * 8;
        r.rect(-rw / 2, -rh / 2, rw, rh).fill({
          color: 0xff2d5e,
          alpha: 0.6 + Math.random() * 0.3,
        });
        r.position.set(
          pos.x + (Math.random() - 0.5) * 80,
          pos.y + (Math.random() - 0.5) * 60,
        );
        layer.addChild(r);
        rects.push(r);
      }

      glitches.push({ rects, progress: 0, x: pos.x, y: pos.y });
    },

    destroy() {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    },
  };
}
