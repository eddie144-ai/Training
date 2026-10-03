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

export type MarkerType =
  | 'COMMITMENT_MARKER' // Clear, actionable follow-through, low friction
  | 'LOW_EFFORT_TETHERING' // Unsolicited reach-out paired with minimal execution
  | 'INTERMITTENT_REINFORCE' // Unpredictable warmth spikes following distance
  | 'BOUNDARY_TEST' // Micro-encroachments on stated limits or timeline
  | 'EXCUSE_CYCLE' // Replaced concrete execution with narrative framing
  | 'ASYMMETRIC_INVESTMENT'; // Disproportionate word count vs operational action

export interface StatementVsAction {
  id: string;
  /** What was said or promised. */
  verbalStatement: string;
  /** What was actually done or observed. */
  concreteAction: string;
  discrepancyDelta: 'HIGH' | 'MEDIUM' | 'LOW' | 'ALIGNED';
  category: MarkerType;
}

/** A behavioral audit of one communication record (text thread, email chain, transcript). */
export interface BehavioralAuditReport {
  auditId: string;
  timestamp: string;
  subjectIdentifier: string;
  /** 0 (fully aligned) to 100 (total asymmetry / tethering), as judged by the model. */
  investmentDiscrepancyScore: number;
  clinicalSummary: string;
  statementsVsActions: StatementVsAction[];
  behavioralBreakdown: {
    commitmentMarkersCount: number;
    lowEffortTetheringCount: number;
    boundaryTestsCount: number;
    intermittentReinforcementCount: number;
  };
  recommendedBoundaries: Array<{
    boundaryTitle: string;
    actionableDirective: string;
    enforcementMechanism: string;
  }>;
}
