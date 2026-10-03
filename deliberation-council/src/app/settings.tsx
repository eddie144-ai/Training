import { useRouter } from 'expo-router';
import { ArrowLeft, KeyRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearApiKey, hasSavedApiKey, saveApiKey } from '../lib/apiKey';

export default function SettingsScreen() {
  const router = useRouter();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    hasSavedApiKey().then(setSaved);
  }, []);

  const valid = draft.trim().startsWith('sk-ant-');

  const save = async () => {
    if (!valid) return;
    await saveApiKey(draft);
    setDraft('');
    setSaved(true);
    setMessage('Key saved on this device.');
  };

  const remove = async () => {
    await clearApiKey();
    setSaved(false);
    setMessage('Key removed from this device.');
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
          <Text className="font-mono text-xs uppercase tracking-widest text-zinc-400">Settings</Text>
          <View className="w-9" />
        </View>

        <ScrollView className="mt-6" keyboardShouldPersistTaps="handled">
          <View className="mb-2 flex-row items-center gap-2">
            <KeyRound color="#06B6D4" size={16} />
            <Text className="font-mono text-xs uppercase tracking-widest text-zinc-400">Anthropic API key</Text>
          </View>

          <View className="mb-4 flex-row items-center gap-2">
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: saved ? '#10B981' : '#EF4444' }} />
            <Text className="font-mono text-xs text-zinc-300">
              {saved === null ? '...' : saved ? 'A key is saved on this device.' : 'No key saved.'}
            </Text>
          </View>

          <TextInput
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              setMessage('');
            }}
            placeholder={saved ? 'Paste a new key to replace it' : 'sk-ant-...'}
            placeholderTextColor="#52525B"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={save}
            className="rounded-lg border border-slate-edge bg-charcoal px-3 py-3 font-mono text-sm text-cream"
          />
          {draft.length > 0 && !valid ? (
            <Text className="mt-2 font-mono text-xs text-amber-400">Anthropic keys start with sk-ant-</Text>
          ) : null}

          <View className="mt-4 flex-row gap-2">
            <Pressable
              onPress={save}
              disabled={!valid}
              className="flex-1 items-center rounded-lg py-3 active:opacity-90"
              style={{ backgroundColor: valid ? '#F4F4F5' : '#18181C' }}
            >
              <Text
                className={`font-mono text-xs font-bold uppercase tracking-widest ${valid ? 'text-obsidian' : 'text-zinc-600'}`}
              >
                Save key
              </Text>
            </Pressable>
            {saved ? (
              <Pressable
                onPress={remove}
                className="items-center rounded-lg border border-red-500/50 px-4 py-3 active:opacity-80"
              >
                <Text className="font-mono text-xs uppercase tracking-widest text-red-300">Remove</Text>
              </Pressable>
            ) : null}
          </View>

          {message ? <Text className="mt-3 font-mono text-xs text-emerald-400">{message}</Text> : null}

          <View className="mt-8 rounded-xl border border-slate-matte bg-charcoal p-4">
            <Text className="mb-2 text-xs leading-5 text-zinc-400">
              The key stays on this device ({Platform.OS === 'web' ? "this browser's storage" : 'the secure keychain'})
              and is sent only to Anthropic's API. Each audit makes five Claude Opus 5.5 calls, so set a monthly spend
              limit on the key.
            </Text>
            <Pressable onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}>
              <Text className="font-mono text-xs uppercase tracking-widest text-cyan-400">Get a key ›</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
