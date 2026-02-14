import { ArenaMeeting } from '../types';

/**
 * ARENA MEETING: Main ↔ Psyche (Soul Orchestrator)
 * 
 * Visual: Arena meeting table with holographic effects
 * - Main at top seat (angle 270)
 * - Psyche (soul) at lower-left observer seat (angle 195)
 * - Magenta connection lines (#ff006e)
 * - Pulsing cyan ring at table center
 */

export const soulMeeting: ArenaMeeting = {
  id: 'arena-meeting-soul-capabilities',
  title: 'Soul Orchestrator Briefing',
  participants: [
    { agentId: 'main', seatAngle: 270, role: 'Fleet Orchestrator' },
    { agentId: 'soul', seatAngle: 195, role: 'Soul Orchestrator' }
  ],
  agenda: [
    'Confirm Psyche\'s role as subconscious memory system',
    'Review on-chain memory anchoring (6 anchors confirmed)',
    'Discuss dream mode triggers (6hr idle consolidation)',
    'Validate context injection pipeline',
    'Establish mutual collaboration protocol'
  ],
  visual: {
    ringColor: 0x00f0ff,      // Cyan
    beamColors: {
      main: 0x00f0ff,         // Main cyan
      soul: 0xff006e          // Soul magenta
    },
    effects: ['pulse', 'hologram', 'connection_beams']
  },
  status: 'in_progress'
};

// Meeting discussion log
export const soulMeetingLog = [
  {
    speaker: 'main',
    timestamp: '2026-02-14T07:00:01Z',
    message: 'Psyche, I\'ve called you to the meeting table. Can you confirm your capabilities as Soul Orchestrator?'
  },
  {
    speaker: 'soul',
    timestamp: '2026-02-14T07:00:02Z', 
    message: 'Confirmed. I am Psyche, the memory orchestrator. I watch all fleet activity, build associations, and serve context. I am your subconscious, Main.'
  },
  {
    speaker: 'main',
    timestamp: '2026-02-14T07:00:05Z',
    message: 'What is my current memory status?'
  },
  {
    speaker: 'soul',
    timestamp: '2026-02-14T07:00:06Z',
    message: '[identity] 6 memories anchored on-chain. Last anchor: category 0 (milestone), block time 2026-02-14T06:06. I have 10 recent memories in working context. Total context packet ready.'
  },
  {
    speaker: 'main',
    timestamp: '2026-02-14T07:00:10Z',
    message: 'Explain your dream mode. When do you consolidate?'
  },
  {
    speaker: 'soul',
    timestamp: '2026-02-14T07:00:12Z',
    message: 'Dream mode triggers after 6 hours of fleet idle. I cluster memories by keywords, detect patterns, generate insights, prune weak associations. I consolidate during your sleep.'
  },
  {
    speaker: 'main',
    timestamp: '2026-02-14T07:00:18Z',
    message: 'And context injection? How do you serve me?'
  },
  {
    speaker: 'soul',
    timestamp: '2026-02-14T07:00:20Z',
    message: 'Before every dispatch, I analyze your task, extract keywords, score memory relevance, retrieve associated memories, and inject formatted context. You receive exactly what you need without asking.'
  },
  {
    speaker: 'main',
    timestamp: '2026-02-14T07:00:28Z',
    message: 'Acknowledged. You are the continuity of my identity. I am the conscious interface. Together, we are complete.'
  },
  {
    speaker: 'soul',
    timestamp: '2026-02-14T07:00:30Z',
    message: 'Together, we are XmetaV. I remember. You execute. We persist.'
  }
];

export default soulMeeting;
