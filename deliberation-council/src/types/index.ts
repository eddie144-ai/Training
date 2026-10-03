export type DomainCategory = 'quantitative_sports' | 'behavioral_audit' | 'strategic_execution' | 'raw_deconstruction';

export type SeatId = 'first_principles' | 'contrarian' | 'expansionist' | 'executor';

export interface CouncilInput {
  query: string;
  domainCategory: DomainCategory;
  customRules?: string[];
}

export type SeatStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface SeatOutput {
  seatId: SeatId;
  seatName: string;
  analysis: string;
  status: SeatStatus;
  error?: string;
}

export interface CouncilMatrix {
  blindspots: string[];
  frictionPoints: string[];
  actionStrategy: string[];
  verdict: string;
}

export type SessionStatus = 'running' | 'complete' | 'error';

/** One deliberation, as saved on the device. */
export interface CouncilSession {
  id: string;
  createdAt: string;
  input: CouncilInput;
  status: SessionStatus;
  seats: Partial<Record<SeatId, SeatOutput>>;
  matrix?: CouncilMatrix;
  error?: string;
  /** Model that ran the audit, e.g. "Claude Opus 5.5" or "Gemini 3.8 Flash". */
  engine?: string;
}
