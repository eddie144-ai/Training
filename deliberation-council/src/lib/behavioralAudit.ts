import type { BehavioralAuditReport, MarkerType, StatementVsAction } from '../types';
import type { Engine } from './engine';

const MARKER_TYPES: MarkerType[] = [
  'COMMITMENT_MARKER',
  'LOW_EFFORT_TETHERING',
  'INTERMITTENT_REINFORCE',
  'BOUNDARY_TEST',
  'EXCUSE_CYCLE',
  'ASYMMETRIC_INVESTMENT',
];
const DELTAS: StatementVsAction['discrepancyDelta'][] = ['HIGH', 'MEDIUM', 'LOW', 'ALIGNED'];

const WEIGHTS: Record<MarkerType, number> = {
  COMMITMENT_MARKER: -15, // Reduces discrepancy (positive behavior)
  LOW_EFFORT_TETHERING: 25,
  INTERMITTENT_REINFORCE: 30, // High-risk manipulative pattern
  BOUNDARY_TEST: 20, // Direct compliance test
  EXCUSE_CYCLE: 15, // Low-friction evasion
  ASYMMETRIC_INVESTMENT: 10, // Word-to-action ratio imbalance
};

/**
 * Rule-based Investment Discrepancy Score from the classified markers, 0 to 100. Shown next to
 * the model's own score as a reproducible cross-check.
 */
export function calculateDiscrepancyScore(markers: StatementVsAction[]): number {
  if (markers.length === 0) return 0;
  const total = markers.reduce((sum, m) => sum + (WEIGHTS[m.category] ?? 0), 0);
  return Math.max(0, Math.min(100, Math.round((total / (markers.length * 25)) * 100)));
}

export const BEHAVIORAL_AUDIT_SYSTEM_PROMPT = `You are a clinical interaction auditor and zero-sycophancy behavioral analyst. Your sole function is to evaluate communication records (text threads, email chains, transcripts) strictly through an Actions vs. Words framework.

OPERATIONAL AUDIT RULES:
1. Zero Sycophancy: Never validate wishful thinking, offer soft conversational buffers, or sugar-coat behavioral patterns. Disregard emotional posturing or stated intent.
2. Actions vs. Words: Evaluate subject behavior strictly by concrete execution vs. verbal promises. Treat unprompted contact paired with low-effort replies explicitly as low-effort tethering / intermittent reinforcement, never as positive momentum.
3. No Speculative Decoding: Do not assist in forensic over-analysis or decoding avoidant behavior. Inconsistency is a complete, final answer.
4. Investment Discrepancy Scoring: Quantify the gap between word volume/emotional language and actual operational commitment on a scale from 0 (Perfect Alignment) to 100 (Complete Asymmetry).
5. Schema Enforcement: Output MUST be a single, valid JSON object matching the requested schema. Do NOT include Markdown block wrappers, introductory fluff, or trailing prose.`;

/**
 * What the model fills in. `auditId`, `timestamp` and `subjectIdentifier` are stamped on the
 * device, and the breakdown counts are recounted from `statementsVsActions`. Claude's structured
 * outputs reject `minimum`/`maximum`, so the score range is enforced after parsing.
 */
export const BEHAVIORAL_AUDIT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    investmentDiscrepancyScore: {
      type: 'integer',
      description: '0 (perfect alignment) to 100 (complete asymmetry).',
    },
    clinicalSummary: {
      type: 'string',
      description: "Unvarnished, objective summary of the subject's behavior pattern.",
    },
    statementsVsActions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verbalStatement: { type: 'string' },
          concreteAction: { type: 'string' },
          discrepancyDelta: { type: 'string', enum: DELTAS },
          category: { type: 'string', enum: MARKER_TYPES },
        },
        required: ['id', 'verbalStatement', 'concreteAction', 'discrepancyDelta', 'category'],
        additionalProperties: false,
      },
    },
    recommendedBoundaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          boundaryTitle: { type: 'string' },
          actionableDirective: { type: 'string' },
          enforcementMechanism: { type: 'string' },
        },
        required: ['boundaryTitle', 'actionableDirective', 'enforcementMechanism'],
        additionalProperties: false,
      },
    },
  },
  required: ['investmentDiscrepancyScore', 'clinicalSummary', 'statementsVsActions', 'recommendedBoundaries'],
  additionalProperties: false,
} as const;

type ModelAudit = Pick<
  BehavioralAuditReport,
  'investmentDiscrepancyScore' | 'clinicalSummary' | 'statementsVsActions' | 'recommendedBoundaries'
>;

function isModelAudit(value: unknown): value is ModelAudit {
  const v = value as ModelAudit;
  const str = (s: unknown) => typeof s === 'string';
  return (
    !!v &&
    typeof v.investmentDiscrepancyScore === 'number' &&
    str(v.clinicalSummary) &&
    Array.isArray(v.statementsVsActions) &&
    v.statementsVsActions.every(
      (m) =>
        m &&
        str(m.id) &&
        str(m.verbalStatement) &&
        str(m.concreteAction) &&
        DELTAS.includes(m.discrepancyDelta) &&
        MARKER_TYPES.includes(m.category),
    ) &&
    Array.isArray(v.recommendedBoundaries) &&
    v.recommendedBoundaries.every(
      (b) => b && str(b.boundaryTitle) && str(b.actionableDirective) && str(b.enforcementMechanism),
    )
  );
}

/** Audits one communication record and returns the full report. */
export async function runBehavioralAudit(
  engine: Engine,
  { subject, record, signal }: { subject: string; record: string; signal?: AbortSignal },
): Promise<BehavioralAuditReport> {
  const result = await engine.generateJson({
    system: BEHAVIORAL_AUDIT_SYSTEM_PROMPT,
    user: `Subject: ${subject}\n\nCommunication record:\n${record}`,
    schema: BEHAVIORAL_AUDIT_JSON_SCHEMA,
    signal,
  });
  if (!isModelAudit(result)) throw new Error('The audit came back in an unexpected shape.');

  const count = (c: MarkerType) => result.statementsVsActions.filter((m) => m.category === c).length;
  return {
    auditId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    subjectIdentifier: subject,
    ...result,
    investmentDiscrepancyScore: Math.max(0, Math.min(100, Math.round(result.investmentDiscrepancyScore))),
    behavioralBreakdown: {
      commitmentMarkersCount: count('COMMITMENT_MARKER'),
      lowEffortTetheringCount: count('LOW_EFFORT_TETHERING'),
      boundaryTestsCount: count('BOUNDARY_TEST'),
      intermittentReinforcementCount: count('INTERMITTENT_REINFORCE'),
    },
  };
}
