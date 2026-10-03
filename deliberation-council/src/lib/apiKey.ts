import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'anthropic_api_key';
const ENV_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || null;

// SecureStore (Keychain / Keystore) on iOS and Android. It has no web implementation, so the
// web build keeps the key in the browser's local storage on that device.
const store = {
  get: () => (Platform.OS === 'web' ? AsyncStorage.getItem(KEY) : SecureStore.getItemAsync(KEY)),
  set: (v: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(KEY, v) : SecureStore.setItemAsync(KEY, v)),
  remove: () => (Platform.OS === 'web' ? AsyncStorage.removeItem(KEY) : SecureStore.deleteItemAsync(KEY)),
};

/** The key saved on this device, else the one from `.env` (development builds), else null. */
export async function getApiKey(): Promise<string | null> {
  try {
    return (await store.get()) || ENV_KEY;
  } catch {
    return ENV_KEY;
  }
}

export async function hasSavedApiKey(): Promise<boolean> {
  try {
    return Boolean(await store.get());
  } catch {
    return false;
  }
}

export async function saveApiKey(key: string): Promise<void> {
  await store.set(key.trim());
}

export async function clearApiKey(): Promise<void> {
  await store.remove();
}
