import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type Provider = 'claude' | 'gemini';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

const KEY_NAMES: Record<Provider, string> = {
  claude: 'anthropic_api_key',
  gemini: 'gemini_api_key',
};
const ENV_KEYS: Record<Provider, string | null> = {
  claude: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || null,
  gemini: process.env.EXPO_PUBLIC_GEMINI_API_KEY || null,
};
const PROVIDER_PREF = 'council.provider';
const GEMINI_MODEL_PREF = 'council.geminiModel';

// SecureStore (Keychain / Keystore) on iOS and Android. It has no web implementation, so the
// web build keeps keys in the browser's local storage on that device.
const secret = {
  get: (k: string) => (Platform.OS === 'web' ? AsyncStorage.getItem(k) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  remove: (k: string) => (Platform.OS === 'web' ? AsyncStorage.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

/** The key saved on this device, else the one from `.env` (development builds), else null. */
export async function getApiKey(provider: Provider): Promise<string | null> {
  try {
    return (await secret.get(KEY_NAMES[provider])) || ENV_KEYS[provider];
  } catch {
    return ENV_KEYS[provider];
  }
}

export async function hasSavedApiKey(provider: Provider): Promise<boolean> {
  try {
    return Boolean(await secret.get(KEY_NAMES[provider]));
  } catch {
    return false;
  }
}

export async function saveApiKey(provider: Provider, key: string): Promise<void> {
  await secret.set(KEY_NAMES[provider], key.trim());
}

export async function clearApiKey(provider: Provider): Promise<void> {
  await secret.remove(KEY_NAMES[provider]);
}

export async function getProvider(): Promise<Provider> {
  const v = await AsyncStorage.getItem(PROVIDER_PREF).catch(() => null);
  return v === 'gemini' ? 'gemini' : 'claude';
}

export async function setProvider(provider: Provider): Promise<void> {
  await AsyncStorage.setItem(PROVIDER_PREF, provider);
}

export async function getGeminiModel(): Promise<string> {
  const v = await AsyncStorage.getItem(GEMINI_MODEL_PREF).catch(() => null);
  return v?.trim() || DEFAULT_GEMINI_MODEL;
}

export async function setGeminiModel(model: string): Promise<void> {
  const m = model.trim();
  if (m && m !== DEFAULT_GEMINI_MODEL) await AsyncStorage.setItem(GEMINI_MODEL_PREF, m);
  else await AsyncStorage.removeItem(GEMINI_MODEL_PREF);
}
