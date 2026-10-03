import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, RotateCcw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentCard } from '../../components/AgentCard';
import { domainLabel } from '../../components/DomainSelector';
import { MatrixView } from '../../components/MatrixView';
import { getEngine, runCouncilDeliberation } from '../../lib/council';
import { SEAT_ORDER } from '../../lib/seats';
import { getSession, saveSession } from '../../lib/storage';
import type { CouncilSession } from '../../types';

type Phase = 'loading' | 'seats' | 'synthesis' | 'done' | 'error' | 'missing';

export default function DeliberationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<CouncilSession | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (base: CouncilSession) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let current: CouncilSession = { ...base, status: 'running', seats: {}, matrix: undefined, error: undefined };
    setSession(current);
    setPhase('seats');

    try {
      const engine = await getEngine();
      current = { ...current, engine: engine.label };
      setSession(current);
      const { seatOutputs, matrix } = await runCouncilDeliberation(engine, current.input, {
        signal: controller.signal,
        onSeatUpdate: (output) => {
          current = { ...current, seats: { ...current.seats, [output.seatId]: output } };
          setSession(current);
        },
        onSynthesisStart: () => setPhase('synthesis'),
      });
      current = {
        ...current,
        status: 'complete',
        seats: Object.fromEntries(seatOutputs.map((s) => [s.seatId, s])),
        matrix,
      };
      setPhase('done');
    } catch (err) {
      if (controller.signal.aborted) return;
      current = { ...current, status: 'error', error: err instanceof Error ? err.message : String(err) };
      setPhase('error');
    }
    setSession(current);
    await saveSession(current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSession(id).then((found) => {
      if (cancelled) return;
      if (!found) return setPhase('missing');
      if (found.status === 'complete') {
        setSession(found);
        setPhase('done');
      } else if (found.status === 'error') {
        setSession(found);
        setPhase('error');
      } else {
        // New, or interrupted last time (app closed mid-run): run it now.
        run(found);
      }
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [id, run]);

  return (
    <SafeAreaView className="flex-1 bg-obsidian" edges={['top', 'left', 'right']}>
      <View className="w-full max-w-2xl flex-1 self-center px-4">
        {/* Top navigation */}
        <View className="flex-row items-center justify-between border-b border-slate-matte pb-4 pt-4">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityLabel="Back"
            className="rounded-lg border border-slate-edge bg-charcoal p-2 active:opacity-80"
          >
            <ArrowLeft color="#F4F4F5" size={20} />
          </Pressable>
          <Text className="font-mono text-xs uppercase tracking-widest text-zinc-400">Deliberation engine</Text>
          <View className="w-9" />
        </View>

        {phase === 'loading' ? (
          <ActivityIndicator className="mt-12" color="#06B6D4" />
        ) : phase === 'missing' || !session ? (
          <Text className="mt-12 text-center font-mono text-xs uppercase text-muted">Audit not found.</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} className="mt-4" contentContainerClassName="pb-12">
            {/* Proposition */}
            <View className="mb-6 rounded-xl border border-slate-edge bg-charcoal p-4">
              <View className="mb-1 flex-row justify-between">
                <Text className="font-mono text-xs uppercase text-zinc-500">Proposition audit</Text>
                <Text className="font-mono text-xs uppercase text-zinc-600">
                  {domainLabel(session.input.domainCategory)}
                </Text>
              </View>
              <Text selectable className="text-base font-medium text-zinc-100">
                {session.input.query}
              </Text>
              {session.input.customRules?.map((r, i) => (
                <Text key={i} className="mt-1 font-mono text-[11px] text-zinc-500">
                  ▸ {r}
                </Text>
              ))}
            </View>

            {/* Seats */}
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-mono text-xs uppercase tracking-wider text-zinc-400">Council deliberations</Text>
              {session.engine ? (
                <Text className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">{session.engine}</Text>
              ) : null}
            </View>
            <View className="mb-6 gap-3">
              {SEAT_ORDER.map((seatId, i) => (
                <AgentCard key={seatId} seatId={seatId} index={i} data={session.seats[seatId]} />
              ))}
            </View>

            {/* Synthesis */}
            {phase === 'seats' || phase === 'synthesis' ? (
              <View className="items-center justify-center p-8">
                <ActivityIndicator color="#06B6D4" size="large" />
                <Text className="mt-3 font-mono text-xs uppercase text-zinc-500">
                  {phase === 'seats' ? 'Seats deliberating...' : 'Synthesizing matrix...'}
                </Text>
              </View>
            ) : session.matrix ? (
              <MatrixView matrix={session.matrix} />
            ) : null}

            {phase === 'error' && (
              <View className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
                <Text className="mb-1 font-mono text-xs uppercase tracking-widest text-red-400">
                  Deliberation failed
                </Text>
                <Text className="mb-3 text-xs text-red-200">{session.error}</Text>
                <Pressable
                  onPress={() => run(session)}
                  className="flex-row items-center gap-2 self-start rounded-lg border border-red-500/50 px-3 py-2 active:opacity-80"
                >
                  <RotateCcw color="#FCA5A5" size={14} />
                  <Text className="font-mono text-xs uppercase text-red-300">Retry</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
