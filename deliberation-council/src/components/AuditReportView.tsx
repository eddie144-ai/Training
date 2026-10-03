import { Activity } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { calculateDiscrepancyScore } from '../lib/behavioralAudit';
import type { BehavioralAuditReport, StatementVsAction } from '../types';

// Text colour doesn't cascade from a View in React Native, so box and label get separate classes.
function scoreBand(score: number) {
  if (score >= 70) {
    return { label: 'Critical asymmetry / tethering', box: 'border-red-500/30 bg-red-500/10', text: 'text-red-500' };
  }
  if (score >= 40) {
    return { label: 'Moderate inconsistency', box: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-500' };
  }
  return { label: 'High alignment', box: 'border-emerald-500/30 bg-emerald-500/10', text: 'text-emerald-400' };
}

const DELTA_BADGE: Record<StatementVsAction['discrepancyDelta'], { label: string; className: string }> = {
  HIGH: { label: 'Delta: high', className: 'border-red-800/40 bg-red-950/60 text-red-400' },
  MEDIUM: { label: 'Delta: med', className: 'border-amber-800/40 bg-amber-950/60 text-amber-400' },
  LOW: { label: 'Delta: low', className: 'border-zinc-700/60 bg-zinc-900 text-zinc-300' },
  ALIGNED: { label: 'Aligned', className: 'border-emerald-800/40 bg-emerald-950/60 text-emerald-400' },
};

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="flex-1 items-center rounded-xl border border-slate-matte bg-charcoal p-3">
      <Text className="font-mono text-[10px] text-muted">{label}</Text>
      <Text className={`font-mono text-lg font-bold ${color}`}>{value}</Text>
    </View>
  );
}

/** A behavioral audit: score gauge, marker counts, statements against actions, boundaries. */
export function AuditReportView({ report }: { report: BehavioralAuditReport }) {
  const band = scoreBand(report.investmentDiscrepancyScore);
  const ruleScore = calculateDiscrepancyScore(report.statementsVsActions);

  return (
    <Animated.View entering={FadeIn.duration(500)}>
      {/* Header metric gauge */}
      <View className="mb-4 rounded-2xl border border-slate-matte bg-charcoal p-5">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="font-mono text-xs uppercase tracking-widest text-muted">Behavioral audit metric</Text>
          <Activity color="#71717A" size={16} />
        </View>

        <View className="mb-2 flex-row items-baseline gap-3">
          <Text className="font-mono text-4xl font-bold text-cream">{report.investmentDiscrepancyScore}</Text>
          <Text className="font-mono text-xs text-muted">/ 100 DISCREPANCY SCORE</Text>
        </View>
        <Text className="mb-3 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          Rule-based cross-check · {ruleScore}
        </Text>

        <View className={`mb-3 rounded-lg border p-2.5 ${band.box}`}>
          <Text className={`font-mono text-xs font-bold uppercase ${band.text}`}>{band.label}</Text>
        </View>

        <Text selectable className="text-xs leading-5 text-zinc-300">
          {report.clinicalSummary}
        </Text>
      </View>

      {/* Behavioral marker counters */}
      <View className="mb-6 flex-row gap-2">
        <Counter label="TETHERING" value={report.behavioralBreakdown.lowEffortTetheringCount} color="text-red-400" />
        <Counter
          label="INTERMITTENT"
          value={report.behavioralBreakdown.intermittentReinforcementCount}
          color="text-amber-400"
        />
        <Counter label="BOUNDARY" value={report.behavioralBreakdown.boundaryTestsCount} color="text-amber-400" />
        <Counter
          label="COMMITMENT"
          value={report.behavioralBreakdown.commitmentMarkersCount}
          color="text-emerald-400"
        />
      </View>

      {/* Statements vs concrete actions */}
      <Text className="mb-3 font-mono text-xs uppercase tracking-wider text-zinc-400">
        Statements vs concrete actions
      </Text>
      <View className="mb-6 gap-3">
        {report.statementsVsActions.length ? (
          report.statementsVsActions.map((item) => {
            const badge = DELTA_BADGE[item.discrepancyDelta];
            return (
              <View key={item.id} className="rounded-xl border border-slate-matte bg-charcoal p-4">
                <View className="mb-2 flex-row items-center justify-between gap-2">
                  <Text className="flex-1 font-mono text-[10px] uppercase text-muted">
                    {item.category.replace(/_/g, ' ')}
                  </Text>
                  <Text className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${badge.className}`}>
                    {badge.label}
                  </Text>
                </View>
                <View className="mb-2">
                  <Text className="font-mono text-[10px] uppercase text-muted">Verbal statement:</Text>
                  <Text selectable className="text-xs italic text-zinc-300">
                    "{item.verbalStatement}"
                  </Text>
                </View>
                <View>
                  <Text className="font-mono text-[10px] uppercase text-muted">Concrete action:</Text>
                  <Text selectable className="text-xs font-semibold text-zinc-100">
                    {item.concreteAction}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text className="text-xs italic text-zinc-600">No statements identified.</Text>
        )}
      </View>

      {/* Boundary directives */}
      <Text className="mb-3 font-mono text-xs uppercase tracking-wider text-zinc-400">
        Actionable boundary directives
      </Text>
      <View className="gap-3">
        {report.recommendedBoundaries.map((boundary, index) => (
          <View
            key={index}
            className="rounded-xl border border-slate-edge bg-charcoal p-4"
            style={{ borderLeftWidth: 4, borderLeftColor: '#10B981' }}
          >
            <Text className="mb-1 font-mono text-xs font-bold text-emerald-400">{boundary.boundaryTitle}</Text>
            <Text selectable className="mb-2 text-xs font-semibold text-zinc-200">
              {boundary.actionableDirective}
            </Text>
            <View className="rounded border border-slate-matte bg-obsidian p-2">
              <Text className="mb-0.5 font-mono text-[10px] uppercase text-muted">Enforcement protocol:</Text>
              <Text selectable className="text-xs text-zinc-400">
                {boundary.enforcementMechanism}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}
