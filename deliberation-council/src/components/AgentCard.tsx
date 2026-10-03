import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { SEATS } from '../lib/seats';
import type { SeatId, SeatOutput } from '../types';

interface Props {
  seatId: SeatId;
  data?: SeatOutput;
  index?: number;
}

const STATUS_LABEL = {
  pending: 'QUEUED',
  streaming: 'DELIBERATING',
  complete: 'FILED',
  error: 'FAILED',
} as const;

/** One cognitive seat. Streams its analysis in and pulses its signature light while working. */
export function AgentCard({ seatId, data, index = 0 }: Props) {
  const { name, role, accent, Icon } = SEATS[seatId];
  const status = data?.status ?? 'pending';
  const live = status === 'streaming' || status === 'pending';

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (live) {
      pulse.value = withRepeat(withTiming(0.25, { duration: 700 }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [live, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const statusColor = status === 'error' ? '#EF4444' : status === 'complete' ? accent : '#71717A';

  return (
    // NativeWind classes don't reach Reanimated's Animated.View, so it only carries the animation.
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350)}>
      <View
        className="rounded-xl border border-slate-matte bg-charcoal p-4"
        style={{
          borderLeftColor: accent,
          borderLeftWidth: 3,
          shadowColor: accent,
          shadowOpacity: live ? 0.35 : 0.15,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <View className="mb-2 flex-row items-center gap-2">
          <Icon color={accent} size={18} />
          <View className="flex-1">
            <Text className="text-sm font-bold text-zinc-200">{name}</Text>
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted">{role}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }, dotStyle]} />
            <Text className="font-mono text-[10px] tracking-widest" style={{ color: statusColor }}>
              {STATUS_LABEL[status]}
            </Text>
          </View>
        </View>

        {data?.analysis ? (
          <Text selectable className="text-xs leading-5 text-zinc-400">
            {data.analysis}
            {status === 'streaming' ? <Text style={{ color: accent }}> ▍</Text> : null}
          </Text>
        ) : status === 'error' ? null : (
          <Text className="font-mono text-xs italic text-zinc-600">Deliberating...</Text>
        )}

        {data?.error ? <Text className="mt-2 font-mono text-xs text-red-400">{data.error}</Text> : null}
      </View>
    </Animated.View>
  );
}
