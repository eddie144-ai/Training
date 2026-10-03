import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuditReportView } from '../components/AuditReportView';
import { runBehavioralAudit } from '../lib/behavioralAudit';
import { getEngine } from '../lib/council';
import type { BehavioralAuditReport } from '../types';

export default function BehavioralAuditScreen() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [record, setRecord] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BehavioralAuditReport | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const ready = record.trim().length > 0 && !running;

  const run = async () => {
    if (!ready) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const engine = await getEngine();
      const result = await runBehavioralAudit(engine, {
        subject: subject.trim() || 'Subject',
        record: record.trim(),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setReport(result);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!controller.signal.aborted) setRunning(false);
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
          <View className="flex-row items-center justify-between border-b border-slate-matte pb-4 pt-4">
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityLabel="Back"
              className="rounded-lg border border-slate-edge bg-charcoal p-2 active:opacity-80"
            >
              <ArrowLeft color="#F4F4F5" size={20} />
            </Pressable>
            <Text className="font-mono text-xs uppercase tracking-widest text-zinc-400">Behavioral audit</Text>
            <View className="w-9" />
          </View>

          <Text className="mb-2 mt-6 font-mono text-xs uppercase tracking-widest text-zinc-400">
            Subject <Text className="text-zinc-600">(optional)</Text>
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="A name or label for the other person"
            placeholderTextColor="#52525B"
            className="rounded-lg border border-slate-matte bg-charcoal px-3 py-2.5 text-sm text-cream"
          />

          <Text className="mb-2 mt-6 font-mono text-xs uppercase tracking-widest text-zinc-400">
            Communication record
          </Text>
          <View className="rounded-xl border border-slate-edge bg-charcoal p-3">
            <TextInput
              value={record}
              onChangeText={setRecord}
              placeholder="Paste the text thread, email chain or transcript. Add what actually happened afterwards, too."
              placeholderTextColor="#52525B"
              multiline
              textAlignVertical="top"
              className="min-h-[180px] text-sm leading-6 text-cream"
            />
            <Text className="mt-2 font-mono text-[10px] text-muted">{record.length} CHARS</Text>
          </View>

          <Pressable
            onPress={run}
            disabled={!ready}
            className="mb-6 mt-6 flex-row items-center justify-center gap-2 rounded-xl py-4 active:opacity-90"
            style={{ backgroundColor: ready ? '#F4F4F5' : '#18181C' }}
          >
            {running ? (
              <ActivityIndicator color="#71717A" />
            ) : (
              <>
                <Text
                  className={`font-mono text-sm font-bold uppercase tracking-widest ${ready ? 'text-obsidian' : 'text-zinc-600'}`}
                >
                  Run audit
                </Text>
                <ArrowRight color={ready ? '#050507' : '#52525B'} size={18} />
              </>
            )}
          </Pressable>

          {error && (
            <View className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
              <Text className="font-mono text-xs text-red-300">{error}</Text>
            </View>
          )}

          {report && <AuditReportView report={report} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
