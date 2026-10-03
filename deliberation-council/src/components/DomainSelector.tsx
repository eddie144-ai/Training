import { Brain, Crosshair, Layers, Sigma, type LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { DomainCategory } from '../types';

interface Preset {
  id: DomainCategory;
  label: string;
  hint: string;
  accent: string;
  Icon: LucideIcon;
}

export const DOMAIN_PRESETS: Preset[] = [
  {
    id: 'quantitative_sports',
    label: 'Quantitative EV',
    hint: 'Edge, variance, sample size',
    accent: '#06B6D4',
    Icon: Sigma,
  },
  {
    id: 'behavioral_audit',
    label: 'Behavioral Audit',
    hint: 'Biases, incentives, habits',
    accent: '#EF4444',
    Icon: Brain,
  },
  {
    id: 'strategic_execution',
    label: 'Strategic',
    hint: 'Positioning and sequencing',
    accent: '#F59E0B',
    Icon: Crosshair,
  },
  {
    id: 'raw_deconstruction',
    label: 'First Principles',
    hint: 'Rebuild from constraints',
    accent: '#10B981',
    Icon: Layers,
  },
];

export const domainLabel = (id: DomainCategory) => DOMAIN_PRESETS.find((p) => p.id === id)?.label ?? id;

interface Props {
  value: DomainCategory;
  onChange: (value: DomainCategory) => void;
}

export function DomainSelector({ value, onChange }: Props) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {DOMAIN_PRESETS.map(({ id, label, hint, accent, Icon }) => {
        const active = id === value;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            className="basis-[48%] flex-grow rounded-xl border bg-charcoal p-3 active:opacity-80"
            style={{
              borderColor: active ? accent : '#18181C',
              shadowColor: accent,
              shadowOpacity: active ? 0.4 : 0,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 0 },
            }}
          >
            <View className="mb-1 flex-row items-center gap-2">
              <Icon color={active ? accent : '#71717A'} size={16} />
              <Text className={`text-sm font-bold ${active ? 'text-cream' : 'text-zinc-400'}`}>{label}</Text>
            </View>
            <Text className="font-mono text-[10px] uppercase tracking-wider text-muted">{hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
