import { Mic, MicOff, Square } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable } from 'react-native';

type SpeechModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;

// expo-speech-recognition is a native module, so it's missing from Expo Go. Load it lazily and
// hide dictation instead of crashing; the keyboard's own mic still works there.
let speech: SpeechModule | null = null;
try {
  speech = require('expo-speech-recognition').ExpoSpeechRecognitionModule as SpeechModule;
} catch {
  speech = null;
}

interface Props {
  /** Called when dictation begins, before any transcript arrives. */
  onStart?: () => void;
  /** Called with the full transcript of the current dictation, including interim results. */
  onTranscript: (text: string) => void;
}

export function AudioInputButton({ onStart, onTranscript }: Props) {
  const [listening, setListening] = useState(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    if (!speech) return;
    const subs = [
      speech.addListener('result', (e) => {
        const text = e.results[0]?.transcript;
        if (text) onTranscriptRef.current(text);
      }),
      speech.addListener('end', () => setListening(false)),
      speech.addListener('error', (e) => {
        setListening(false);
        if (e.error !== 'aborted' && e.error !== 'no-speech') Alert.alert('Dictation failed', e.message);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  if (!speech) return null;
  const available = speech.isRecognitionAvailable();

  const toggle = async () => {
    if (!speech) return;
    if (listening) {
      speech.stop();
      return;
    }
    const { granted } = await speech.requestPermissionsAsync();
    if (!granted) {
      Alert.alert('Microphone blocked', 'Allow microphone and speech recognition in Settings to dictate.');
      return;
    }
    onStart?.();
    speech.start({ lang: 'en-US', interimResults: true, continuous: true });
    setListening(true);
  };

  return (
    <Pressable
      onPress={toggle}
      disabled={!available}
      accessibilityLabel={listening ? 'Stop dictation' : 'Dictate proposition'}
      className="h-10 w-10 items-center justify-center rounded-lg border bg-obsidian"
      style={{
        borderColor: listening ? '#EF4444' : '#27272A',
        shadowColor: '#EF4444',
        shadowOpacity: listening ? 0.5 : 0,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      {!available ? (
        <MicOff color="#3F3F46" size={18} />
      ) : listening ? (
        <Square color="#EF4444" size={16} fill="#EF4444" />
      ) : (
        <Mic color="#F4F4F5" size={18} />
      )}
    </Pressable>
  );
}
