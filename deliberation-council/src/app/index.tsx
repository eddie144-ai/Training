import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowRight, History, Plus, Settings, X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioInputButton } from '../components/AudioInputButton';
import { DomainSelector } from '../components/DomainSelector';
import { getApiKey, getGeminiModel, getProvider } from '../lib/apiKey';
import { geminiLabel } from '../lib/gemini';
import { SEATS, SEAT_ORDER } from '../lib/seats';
import { createSession } from '../lib/storage';
import type { DomainCategory } from '../types';

export default function InputScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<DomainCategory>('strategic_execution');
  const [rules, setRules] = useState<string[]>([]);
  const [ruleDraft, setRuleDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dictationBase = useRef('');
  const [hasKey, setHasKey] = useState(true);
  const [engineLabel, setEngineLabel] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const provider = await getProvider();
        setHasKey(Boolean(await getApiKey(provider)));
        setEngineLabel(provider === 'gemini' ? geminiLabel(await getGeminiModel()) : 'Claude Opus 5.5');
      })();
    }, []),
  );

  const ready = query.trim().length > 0 && !submitting;

  const addRule = () => {
    const r = ruleDraft.trim();
    if (r) setRules((prev) => [...prev, r]);
    setRuleDraft('');
  };

  const convene = async () => {
    if (!ready) return;
    setSubmitting(true);
    try {
      const session = await createSession({
        query: query.trim(),
        domainCategory: domain,
        customRules: ruleDraft.trim() ? [...rules, ruleDraft.trim()] : rules,
      });
      router.push({ pathname: '/deliberation/[id]', params: { id: session.id } });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-obsidian" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1 px-4"
          contentContainerClassName="pb-12 w-full max-w-2xl self-center"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-slate-matte pb-4 pt-4">
            <View>
              <Text className="font-mono text-xs uppercase tracking-[3px] text-muted">Deliberation</Text>
              <Text className="text-2xl font-bold text-cream">Council</Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => router.push('/history')}
                accessibilityLabel="Saved audits"
                className="rounded-lg border border-slate-edge bg-charcoal p-2.5 active:opacity-80"
              >
                <History color="#F4F4F5" size={20} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/settings')}
                accessibilityLabel="Settings"
                className="rounded-lg border border-slate-edge bg-charcoal p-2.5 active:opacity-80"
              >
                <Settings color="#F4F4F5" size={20} />
              </Pressable>
            </View>
          </View>

          {/* Seat lights */}
          <View className="mt-4 flex-row gap-2">
            {SEAT_ORDER.map((id) => (
              <View
                key={id}
                className="h-1 flex-1 rounded-full"
                style={{ backgroundColor: SEATS[id].accent, opacity: 0.8 }}
              />
            ))}
          </View>
          {engineLabel ? (
            <Text className="mt-2 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              Engine · {engineLabel}
            </Text>
          ) : null}

          {!hasKey && (
            <Pressable
              onPress={() => router.push('/settings')}
              className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 active:opacity-80"
            >
              <Text className="font-mono text-xs text-red-300">
                No API key for this engine yet. Tap to add one in Settings ›
              </Text>
            </Pressable>
          )}

          {/* Proposition */}
          <Text className="mb-2 mt-6 font-mono text-xs uppercase tracking-widest text-zinc-400">Proposition</Text>
          <View className="rounded-xl border border-slate-edge bg-charcoal p-3">
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="State the decision, bet or plan you want audited..."
              placeholderTextColor="#52525B"
              multiline
              textAlignVertical="top"
              className="min-h-[120px] text-base leading-6 text-cream"
            />
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="font-mono text-[10px] text-muted">{query.length} CHARS</Text>
              <AudioInputButton
                onStart={() => {
                  dictationBase.current = query.trim() ? `${query.trim()} ` : '';
                }}
                onTranscript={(t) => setQuery(dictationBase.current + t)}
              />
            </View>
          </View>

          {/* Domain */}
          <Text className="mb-2 mt-6 font-mono text-xs uppercase tracking-widest text-zinc-400">Domain context</Text>
          <DomainSelector value={domain} onChange={setDomain} />

          {/* Custom rules */}
          <Text className="mb-2 mt-6 font-mono text-xs uppercase tracking-widest text-zinc-400">
            Hard constraints <Text className="text-zinc-600">(optional)</Text>
          </Text>
          {rules.map((r, i) => (
            <View
              key={i}
              className="mb-2 flex-row items-center gap-2 rounded-lg border border-slate-matte bg-charcoal px-3 py-2"
            >
              <Text className="flex-1 text-xs text-zinc-300">{r}</Text>
              <Pressable
                onPress={() => setRules((prev) => prev.filter((_, j) => j !== i))}
                accessibilityLabel="Remove rule"
                hitSlop={8}
              >
                <X color="#71717A" size={14} />
              </Pressable>
            </View>
          ))}
          <View className="flex-row items-center gap-2">
            <TextInput
              value={ruleDraft}
              onChangeText={setRuleDraft}
              onSubmitEditing={addRule}
              placeholder="e.g. Max risk 2% of bankroll"
              placeholderTextColor="#52525B"
              returnKeyType="done"
              className="flex-1 rounded-lg border border-slate-matte bg-charcoal px-3 py-2.5 text-sm text-cream"
            />
            <Pressable
              onPress={addRule}
              accessibilityLabel="Add rule"
              className="rounded-lg border border-slate-edge bg-charcoal p-2.5 active:opacity-80"
            >
              <Plus color="#F4F4F5" size={18} />
            </Pressable>
          </View>

          {/* Convene */}
          <Pressable
            onPress={convene}
            disabled={!ready}
            className="mt-8 flex-row items-center justify-center gap-2 rounded-xl py-4 active:opacity-90"
            style={{
              backgroundColor: ready ? '#F4F4F5' : '#18181C',
              shadowColor: '#06B6D4',
              shadowOpacity: ready ? 0.35 : 0,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 0 },
            }}
          >
            <Text
              className={`font-mono text-sm font-bold uppercase tracking-widest ${ready ? 'text-obsidian' : 'text-zinc-600'}`}
            >
              Convene council
            </Text>
            <ArrowRight color={ready ? '#050507' : '#52525B'} size={18} />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
