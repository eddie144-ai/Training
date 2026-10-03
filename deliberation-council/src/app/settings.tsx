import { useRouter } from 'expo-router';
import { ArrowLeft, Cpu, KeyRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DEFAULT_GEMINI_MODEL,
  type Provider,
  clearApiKey,
  getGeminiModel,
  getProvider,
  hasSavedApiKey,
  saveApiKey,
  setGeminiModel,
  setProvider,
} from '../lib/apiKey';

const PROVIDERS: Record<
  Provider,
  { name: string; model: string; accent: string; keyUrl: string; placeholder: string; valid: (k: string) => boolean }
> = {
  claude: {
    name: 'Claude',
    model: 'Opus 5.5 · paid',
    accent: '#F59E0B',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-...',
    valid: (k) => k.startsWith('sk-ant-'),
  },
  gemini: {
    name: 'Gemini',
    model: 'Flash · free tier',
    accent: '#06B6D4',
    keyUrl: 'https://aistudio.google.com/apikey',
    placeholder: 'Paste your Google AI Studio key',
    valid: (k) => /^\S{30,}$/.test(k),
  },
};

const Label = ({ children }: { children: string }) => (
  <Text className="font-mono text-xs uppercase tracking-widest text-zinc-400">{children}</Text>
);

export default function SettingsScreen() {
  const router = useRouter();
  const [provider, setProviderState] = useState<Provider | null>(null);
  const [saved, setSaved] = useState<Record<Provider, boolean> | null>(null);
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([getProvider(), hasSavedApiKey('claude'), hasSavedApiKey('gemini'), getGeminiModel()]).then(
      ([p, claude, gemini, m]) => {
        setProviderState(p);
        setSaved({ claude, gemini });
        setModel(m);
      },
    );
  }, []);

  if (!provider || !saved) return <SafeAreaView className="flex-1 bg-obsidian" />;
  const meta = PROVIDERS[provider];
  const valid = meta.valid(draft.trim());

  const choose = async (p: Provider) => {
    await setProvider(p);
    setProviderState(p);
    setDraft('');
    setMessage('');
  };

  const save = async () => {
    if (!valid) return;
    await saveApiKey(provider, draft);
    setDraft('');
    setSaved({ ...saved, [provider]: true });
    setMessage(`${meta.name} key saved on this device.`);
  };

  const remove = async () => {
    await clearApiKey(provider);
    setSaved({ ...saved, [provider]: false });
    setMessage(`${meta.name} key removed from this device.`);
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

        <ScrollView className="mt-6" keyboardShouldPersistTaps="handled" contentContainerClassName="pb-12">
          {/* Provider */}
          <View className="mb-2 flex-row items-center gap-2">
            <Cpu color="#F4F4F5" size={16} />
            <Label>Council engine</Label>
          </View>
          <View className="mb-8 flex-row gap-2">
            {(Object.keys(PROVIDERS) as Provider[]).map((p) => {
              const active = p === provider;
              const m = PROVIDERS[p];
              return (
                <Pressable
                  key={p}
                  onPress={() => choose(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  className="flex-1 rounded-xl border bg-charcoal p-3 active:opacity-80"
                  style={{
                    borderColor: active ? m.accent : '#18181C',
                    shadowColor: m.accent,
                    shadowOpacity: active ? 0.4 : 0,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className={`text-base font-bold ${active ? 'text-cream' : 'text-zinc-400'}`}>{m.name}</Text>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: saved[p] ? '#10B981' : '#3F3F46',
                      }}
                    />
                  </View>
                  <Text className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">{m.model}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Key */}
          <View className="mb-2 flex-row items-center gap-2">
            <KeyRound color={meta.accent} size={16} />
            <Label>{`${meta.name} API key`}</Label>
          </View>
          <View className="mb-4 flex-row items-center gap-2">
            <View
              style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: saved[provider] ? '#10B981' : '#EF4444' }}
            />
            <Text className="font-mono text-xs text-zinc-300">
              {saved[provider] ? 'A key is saved on this device.' : 'No key saved.'}
            </Text>
          </View>

          <TextInput
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              setMessage('');
            }}
            placeholder={saved[provider] ? 'Paste a new key to replace it' : meta.placeholder}
            placeholderTextColor="#52525B"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={save}
            className="rounded-lg border border-slate-edge bg-charcoal px-3 py-3 font-mono text-sm text-cream"
          />
          {draft.length > 0 && !valid ? (
            <Text className="mt-2 font-mono text-xs text-amber-400">
              {provider === 'claude' ? 'Anthropic keys start with sk-ant-' : "That doesn't look like a full key."}
            </Text>
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
            {saved[provider] ? (
              <Pressable
                onPress={remove}
                className="items-center rounded-lg border border-red-500/50 px-4 py-3 active:opacity-80"
              >
                <Text className="font-mono text-xs uppercase tracking-widest text-red-300">Remove</Text>
              </Pressable>
            ) : null}
          </View>
          {message ? <Text className="mt-3 font-mono text-xs text-emerald-400">{message}</Text> : null}

          {/* Gemini model */}
          {provider === 'gemini' && (
            <View className="mt-8">
              <Label>Gemini model</Label>
              <TextInput
                value={model}
                onChangeText={setModel}
                onBlur={() => setGeminiModel(model)}
                onSubmitEditing={() => setGeminiModel(model)}
                autoCapitalize="none"
                autoCorrect={false}
                className="mt-2 rounded-lg border border-slate-edge bg-charcoal px-3 py-3 font-mono text-sm text-cream"
              />
              <Text className="mt-2 font-mono text-[10px] leading-4 text-muted">
                Default {DEFAULT_GEMINI_MODEL}. Change it if Google retires that model.
              </Text>
            </View>
          )}

          {/* Notes */}
          <View className="mt-8 rounded-xl border border-slate-matte bg-charcoal p-4">
            <Text className="mb-2 text-xs leading-5 text-zinc-400">
              Keys stay on this device ({Platform.OS === 'web' ? "this browser's storage" : 'the secure keychain'}) and
              are sent only to the provider&apos;s API. Each audit makes five calls.
            </Text>
            {provider === 'gemini' ? (
              <Text className="mb-2 text-xs leading-5 text-zinc-400">
                Gemini&apos;s free tier needs no card but allows only a few requests a minute, so space audits about a
                minute apart. On the free tier Google may use your prompts to improve its products; don&apos;t enter
                anything private.
              </Text>
            ) : (
              <Text className="mb-2 text-xs leading-5 text-zinc-400">
                Claude is billed per use. Set a monthly spend limit on the key.
              </Text>
            )}
            <Pressable onPress={() => Linking.openURL(meta.keyUrl)}>
              <Text className="font-mono text-xs uppercase tracking-widest text-cyan-400">Get a {meta.name} key ›</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
