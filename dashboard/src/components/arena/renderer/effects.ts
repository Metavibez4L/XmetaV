import { Application, Container, Graphics } from "pixi.js";
import type { NodesApi } from "./avatars";
import type { OfficeApi } from "./office";
import { toScreen } from "./iso";
import { MEETING_TABLE_TILE } from "../agents";

export interface EffectsApi {
  commandPulse(targetAgentId: string): void;
  streamStart(agentId: string): void;
  streamStop(agentId: string): void;
  dispatchBeam(fromId: string, toId: string): void;
  completionBurst(agentId: string): void;
  failureGlitch(agentId: string): void;
  meetingStart(agentIds: string[]): void;
  meetingEnd(): void;
  destroy(): void;
}

// -- Internal types ---------------------------------------------------

interface Particle {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface WaypointPulse {
  g: Graphics;
  trail: Graphics;
  waypoints: { x: number; y: number }[];
  progress: number;
  totalDist: number;
  segDists: number[];
}

interface BeamEntry {
  lines: Graphics[];
  dots: Graphics[];
  waypoints: { x: number; y: number }[];
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

interface MeetingState {
  active: boolean;
  ring: Graphics;
  beam: Graphics;
  connectionLines: Graphics;
  holoDiscs: Graphics[];
  agentIds: string[];
  fadeIn: number; // 0→1 fade
}

// -- Helpers ----------------------------------------------------------

function distBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function lerpOnPath(
  waypoints: { x: number; y: number }[],
  segDists: number[],
  totalDist: number,
  t: number,
): { x: number; y: number } {
  const d = t * totalDist;
  let acc = 0;
  for (let i = 0; i < segDists.length; i++) {
    if (acc + segDists[i] >= d) {
      const segT = (d - acc) / segDists[i];
      return {
        x: waypoints[i].x + (waypoints[i + 1].x - waypoints[i].x) * segT,
        y: waypoints[i].y + (waypoints[i + 1].y - waypoints[i].y) * segT,
      };
    }
    acc += segDists[i];
  }
  return waypoints[waypoints.length - 1];
}

function buildPath(points: { x: number; y: number }[]) {
  const segDists = [];
  let totalDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distBetween(points[i], points[i + 1]);
    segDists.push(d);
    totalDist += d;
  }
  return { segDists, totalDist };
}

// -- Init -------------------------------------------------------------

export function initEffects(
  app: Application,
  scene: Container,
  nodesApi: NodesApi,
  _officeApi: OfficeApi,
): EffectsApi {
  const layer = new Container();
  scene.addChild(layer);

  const streamingAgents = new Set<string>();
  const particles: Particle[] = [];
  const pulses: WaypointPulse[] = [];
  const beams: BeamEntry[] = [];
  const bursts: BurstEntry[] = [];
  const glitches: GlitchEntry[] = [];

  // Partition center (gateway between boss office and workstations)
  const partitionCenter = toScreen(4.5, 3);
  const meetingCenter = toScreen(
    MEETING_TABLE_TILE.col,
    MEETING_TABLE_TILE.row,
  );

  // Meeting state (persistent while meeting is active)
  let meeting: MeetingState | null = null;
  let meetingTime = 0;

  // -- Ticker ---------------------------------------------------------

  const tick = (ticker: { deltaMS: number }) => {
    const dt = ticker.deltaMS / 1000;

    // -- Streaming particles (rise from desk) ----
    for (const agentId of streamingAgents) {
      const pos = nodesApi.getPosition(agentId);
      if (!pos) continue;
      // Emit 1-2 code-fragment particles per frame
      for (let i = 0; i < 1 + (Math.random() > 0.5 ? 1 : 0); i++) {
        const g = new Graphics();
        // Small horizontal line (code fragment)
        const lw = 2 + Math.random() * 6;
        g.rect(-lw / 2, 0, lw, 1).fill({ color: 0x00f0ff, alpha: 0.6 });
        g.position.set(pos.x + (Math.random() - 0.5) * 20, pos.y);
        layer.addChild(g);
        particles.push({
          g,
          x: pos.x + (Math.random() - 0.5) * 20,
          y: pos.y,
          vx: (Math.random() - 0.5) * 8,
          vy: -20 - Math.random() * 30,
          life: 0,
          maxLife: 0.5 + Math.random() * 0.5,
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
      p.g.alpha = (1 - p.life / p.maxLife) * 0.6;
    }

    // -- Waypoint pulses ----
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.progress += dt / 0.8; // 800ms total travel time
      if (p.progress >= 1) {
        p.g.destroy();
        p.trail.destroy();
        pulses.splice(i, 1);
        continue;
      }
      const pt = lerpOnPath(
        p.waypoints,
        p.segDists,
        p.totalDist,
        p.progress,
      );
      p.g.position.set(pt.x, pt.y);
      p.trail.position.set(pt.x, pt.y);
      const fade =
        p.progress < 0.1
          ? p.progress / 0.1
          : p.progress > 0.85
            ? (1 - p.progress) / 0.15
            : 1;
      p.g.alpha = fade;
      p.trail.alpha = fade * 0.35;
    }

    // -- Dispatch beams ----
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.progress += dt / b.duration;
      if (b.progress >= 1) {
        for (const l of b.lines) l.destroy();
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
      for (const l of b.lines) l.alpha = alpha * 0.4;
      // Animate dots along full path
      const { segDists, totalDist } = buildPath(b.waypoints);
      for (let j = 0; j < b.dots.length; j++) {
        const t = (b.progress * 2.5 + j / b.dots.length) % 1;
        const pt = lerpOnPath(b.waypoints, segDists, totalDist, t);
        b.dots[j].position.set(pt.x, pt.y);
        b.dots[j].alpha = alpha * 0.8;
      }
    }

    // -- Completion bursts ----
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.progress += dt / 0.6;
      if (b.progress >= 1) {
        b.ring.destroy();
        bursts.splice(i, 1);
        continue;
      }
      b.ring.scale.set(0.5 + b.progress * 2.5);
      b.ring.alpha = 1 - b.progress;
    }

    // -- Failure glitches ----
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
          gl.x + (Math.random() - 0.5) * 50,
          gl.y + (Math.random() - 0.5) * 35,
        );
      }
    }

    // -- Meeting holographic effects ----
    if (meeting) {
      meetingTime += dt;

      // Fade in/out
      if (meeting.active && meeting.fadeIn < 1) {
        meeting.fadeIn = Math.min(1, meeting.fadeIn + dt * 2);
      } else if (!meeting.active) {
        meeting.fadeIn -= dt * 3;
        if (meeting.fadeIn <= 0) {
          // Clean up meeting graphics
          meeting.ring.destroy();
          meeting.beam.destroy();
          meeting.connectionLines.destroy();
          for (const d of meeting.holoDiscs) d.destroy();
          meeting = null;
          meetingTime = 0;
          return; // skip the rest for this frame
        }
      }

      const alpha = meeting.fadeIn;

      // Pulsing ring around table
      const ringScale = 1 + Math.sin(meetingTime * 2) * 0.08;
      meeting.ring.scale.set(ringScale);
      meeting.ring.alpha = alpha * (0.4 + Math.sin(meetingTime * 3) * 0.15);

      // Vertical beam pulse
      meeting.beam.alpha = alpha * (0.15 + Math.sin(meetingTime * 1.5) * 0.08);

      // Holographic floating discs (rotate slowly)
      for (let i = 0; i < meeting.holoDiscs.length; i++) {
        const disc = meeting.holoDiscs[i];
        const angle = meetingTime * 0.5 + (i * Math.PI * 2) / meeting.holoDiscs.length;
        disc.position.set(
          meetingCenter.x + Math.cos(angle) * 22,
          meetingCenter.y - 20 + Math.sin(angle) * 8,
        );
        disc.alpha = alpha * (0.3 + Math.sin(meetingTime * 2 + i) * 0.15);
      }

      // Connection lines between seated agents (redraw each frame)
      meeting.connectionLines.clear();
      const positions: { x: number; y: number }[] = [];
      for (const id of meeting.agentIds) {
        const pos = nodesApi.getPosition(id);
        if (pos) positions.push(pos);
      }
      if (positions.length >= 2) {
        // Draw lines from each agent to the table center
        for (const pos of positions) {
          meeting.connectionLines.moveTo(pos.x, pos.y);
          meeting.connectionLines.lineTo(meetingCenter.x, meetingCenter.y - 10);
          meeting.connectionLines.stroke({
            color: 0x00f0ff,
            width: 0.8,
            alpha: alpha * (0.15 + Math.sin(meetingTime * 2) * 0.08),
          });
        }
        // Draw subtle arcs between adjacent agents
        for (let i = 0; i < positions.length; i++) {
          const next = positions[(i + 1) % positions.length];
          meeting.connectionLines.moveTo(positions[i].x, positions[i].y);
          meeting.connectionLines.lineTo(next.x, next.y);
          meeting.connectionLines.stroke({
            color: 0x00f0ff,
            width: 0.5,
            alpha: alpha * 0.08,
          });
        }
      }
    }
  };

  app.ticker.add(tick);

  // -- Public API -----------------------------------------------------

  return {
    commandPulse(targetAgentId) {
      // Golden energy from boss office to target, via partition center
      const bossPos = nodesApi.getPosition("main") ?? toScreen(4, 1.5);
      const targetPos = nodesApi.getPosition(targetAgentId);
      if (!targetPos) return;

      // Path: boss desk -> partition -> target desk
      const waypoints = [bossPos, partitionCenter, targetPos];
      const { segDists, totalDist } = buildPath(waypoints);

      const g = new Graphics();
      g.circle(0, 0, 5).fill({ color: 0xf59e0b, alpha: 0.9 });
      layer.addChild(g);

      const trail = new Graphics();
      trail.circle(0, 0, 12).fill({ color: 0xf59e0b, alpha: 0.25 });
      layer.addChild(trail);

      pulses.push({ g, trail, waypoints, progress: 0, totalDist, segDists });
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

      // Two-segment path: source -> meeting table -> target
      const waypoints = [from, meetingCenter, to];

      // Draw line segments
      const lines: Graphics[] = [];
      for (let s = 0; s < waypoints.length - 1; s++) {
        const lineG = new Graphics();
        lineG.moveTo(waypoints[s].x, waypoints[s].y);
        lineG.lineTo(waypoints[s + 1].x, waypoints[s + 1].y);
        lineG.stroke({ color: 0x00f0ff, width: 1.5, alpha: 0.4 });
        layer.addChild(lineG);
        lines.push(lineG);
      }

      // Traveling dots
      const dots: Graphics[] = [];
      for (let j = 0; j < 4; j++) {
        const d = new Graphics();
        d.circle(0, 0, 2.5).fill({ color: 0x00f0ff, alpha: 0.8 });
        layer.addChild(d);
        dots.push(d);
      }

      beams.push({ lines, dots, waypoints, progress: 0, duration: 2.5 });
    },

    completionBurst(agentId) {
      const pos = nodesApi.getPosition(agentId);
      if (!pos) return;

      const ring = new Graphics();
      ring.circle(0, 0, 18).stroke({
        color: 0x39ff14,
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
      for (let j = 0; j < 5; j++) {
        const r = new Graphics();
        const rw = 8 + Math.random() * 20;
        const rh = 2 + Math.random() * 5;
        r.rect(-rw / 2, -rh / 2, rw, rh).fill({
          color: 0xff2d5e,
          alpha: 0.5 + Math.random() * 0.3,
        });
        r.position.set(
          pos.x + (Math.random() - 0.5) * 50,
          pos.y + (Math.random() - 0.5) * 35,
        );
        layer.addChild(r);
        rects.push(r);
      }

      glitches.push({ rects, progress: 0, x: pos.x, y: pos.y });
    },

    meetingStart(agentIds) {
      // If already active, update the agent list
      if (meeting && meeting.active) {
        meeting.agentIds = [...agentIds];
        return;
      }

      // Create meeting holographic effects
      const ring = new Graphics();
      ring.circle(meetingCenter.x, meetingCenter.y - 8, 35).stroke({
        color: 0x00f0ff,
        width: 1.5,
        alpha: 0.5,
      });
      ring.circle(meetingCenter.x, meetingCenter.y - 8, 28).stroke({
        color: 0x00f0ff,
        width: 0.8,
        alpha: 0.3,
      });
      layer.addChild(ring);

      // Vertical holographic beam
      const beam = new Graphics();
      beam.rect(meetingCenter.x - 1, meetingCenter.y - 55, 2, 50).fill({
        color: 0x00f0ff,
        alpha: 0.15,
      });
      // Wider glow beam
      beam.rect(meetingCenter.x - 4, meetingCenter.y - 45, 8, 40).fill({
        color: 0x00f0ff,
        alpha: 0.06,
      });
      layer.addChild(beam);

      // Connection lines (redrawn each frame)
      const connectionLines = new Graphics();
      layer.addChild(connectionLines);

      // Floating holographic discs
      const holoDiscs: Graphics[] = [];
      for (let i = 0; i < 3; i++) {
        const disc = new Graphics();
        disc.rect(-6, -1.5, 12, 3).fill({ color: 0x00f0ff, alpha: 0.3 });
        disc.position.set(meetingCenter.x, meetingCenter.y - 20);
        layer.addChild(disc);
        holoDiscs.push(disc);
      }

      meeting = {
        active: true,
        ring,
        beam,
        connectionLines,
        holoDiscs,
        agentIds: [...agentIds],
        fadeIn: 0,
      };
      meetingTime = 0;
    },

    meetingEnd() {
      if (meeting) {
        meeting.active = false; // Triggers fade-out in ticker
      }
    },

    destroy() {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
    },
  };
}
