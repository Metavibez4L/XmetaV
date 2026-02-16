// ============================================================
// Arena Types — shared interfaces for meetings & arena state
// ============================================================

export interface MeetingParticipant {
  agentId: string;
  seatAngle: number;
  role: string;
}

export interface MeetingVisual {
  ringColor: number;
  beamColors: Record<string, number>;
  effects: string[];
}

export interface ArenaMeeting {
  id: string;
  title: string;
  participants: MeetingParticipant[];
  agenda: string[];
  visual: MeetingVisual;
  status: "pending" | "in_progress" | "completed";
}
