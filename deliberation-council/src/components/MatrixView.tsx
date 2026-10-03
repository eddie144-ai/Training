import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { CouncilMatrix } from '../types';

interface CellProps {
  title: string;
  items: string[];
  accent: string;
  numbered?: boolean;
}

function MatrixCell({ title, items, accent, numbered }: CellProps) {
  return (
    <View
      className="min-w-[260px] flex-1 basis-[46%] rounded-lg border bg-obsidian p-3"
      style={{ borderColor: `${accent}4D` }}
    >
      <Text className="mb-2 font-mono text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>
        {title}
      </Text>
      {items.length ? (
        items.map((item, i) => (
          <View key={i} className="mb-1.5 flex-row gap-2">
            <Text className="font-mono text-xs leading-5" style={{ color: accent }}>
              {numbered ? String(i + 1).padStart(2, '0') : '•'}
            </Text>
            <Text selectable className="flex-1 text-xs leading-5 text-zinc-300">
              {item}
            </Text>
          </View>
        ))
      ) : (
        <Text className="text-xs italic text-zinc-600">None identified.</Text>
      )}
    </View>
  );
}

/** The synthesized matrix: verdict on top, then blindspots, friction points and action protocol. */
export function MatrixView({ matrix }: { matrix: CouncilMatrix }) {
  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <View
        className="rounded-2xl border border-slate-edge bg-charcoal p-5"
        style={{ shadowColor: '#10B981', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } }}
      >
        <Text className="mb-1 font-mono text-xs uppercase tracking-widest text-emerald-400">Clinical verdict</Text>
        <Text selectable className="mb-5 text-lg font-bold leading-7 text-cream">
          {matrix.verdict}
        </Text>

        <View className="flex-row flex-wrap gap-3">
          <MatrixCell title="Key blindspots" items={matrix.blindspots} accent="#EF4444" />
          <MatrixCell title="Friction points" items={matrix.frictionPoints} accent="#F59E0B" />
          <MatrixCell title="Action protocol" items={matrix.actionStrategy} accent="#10B981" numbered />
        </View>
      </View>
    </Animated.View>
  );
}
