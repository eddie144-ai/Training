import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { domainLabel } from '../components/DomainSelector';
import { deleteSession, listSessions } from '../lib/storage';
import type { CouncilSession } from '../types';

const STATUS_COLOR = { complete: '#10B981', running: '#F59E0B', error: '#EF4444' } as const;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<CouncilSession[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listSessions().then(setSessions);
    }, []),
  );

  const remove = (s: CouncilSession) => {
    const doDelete = async () => {
      await deleteSession(s.id);
      setSessions((prev) => prev?.filter((x) => x.id !== s.id) ?? null);
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this audit?')) doDelete();
      return;
    }
    Alert.alert('Delete audit?', s.input.query.slice(0, 80), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-obsidian" edges={['top', 'left', 'right']}>
      <View className="w-full max-w-2xl flex-1 self-center px-4">
        <View className="flex-row items-center justify-between border-b border-slate-matte pb-4 pt-4">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityLabel="Back"
            className="rounded-lg border border-slate-edge bg-charcoal p-2 active:opacity-80"
          >
            <ArrowLeft color="#F4F4F5" size={20} />
          </Pressable>
          <Text className="font-mono text-xs uppercase tracking-widest text-zinc-400">Saved audits</Text>
          <View className="w-9" />
        </View>

        <FlatList
          data={sessions ?? []}
          keyExtractor={(s) => s.id}
          className="mt-4"
          contentContainerClassName="gap-3 pb-12"
          ListEmptyComponent={
            sessions ? (
              <Text className="mt-12 text-center font-mono text-xs uppercase text-muted">No audits yet.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/deliberation/[id]', params: { id: item.id } })}
              className="rounded-xl border border-slate-matte bg-charcoal p-4 active:opacity-80"
            >
              <View className="mb-2 flex-row items-center gap-2">
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: STATUS_COLOR[item.status] }} />
                <Text className="flex-1 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {fmtDate(item.createdAt)} · {domainLabel(item.input.domainCategory)}
                </Text>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    remove(item);
                  }}
                  hitSlop={10}
                  accessibilityLabel="Delete audit"
                >
                  <Trash2 color="#52525B" size={14} />
                </Pressable>
              </View>
              <Text numberOfLines={2} className="mb-1 text-sm font-medium text-zinc-100">
                {item.input.query}
              </Text>
              {item.matrix ? (
                <Text numberOfLines={2} className="text-xs leading-5 text-emerald-400/80">
                  {item.matrix.verdict}
                </Text>
              ) : item.status === 'error' ? (
                <Text numberOfLines={1} className="text-xs text-red-400/80">
                  {item.error}
                </Text>
              ) : (
                <Text className="text-xs italic text-zinc-600">Interrupted. Open to resume.</Text>
              )}
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}
