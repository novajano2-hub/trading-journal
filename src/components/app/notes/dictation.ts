// Voice to text for the note editor (B38, U4). The recognition is the
// browser's own `SpeechRecognition` (`webkit`-prefixed in Chrome and Safari),
// which in Chrome sends the audio to Google's speech service: Keel does no
// recognition itself, and the control that starts it says so. Where the
// browser has none, `speechSupported()` is false and the editor draws no
// microphone.

/** The parts of the browser's recognition object that dictation uses. */
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResults) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

interface RecognitionResults {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Whether this browser can turn speech into text. */
export function speechSupported(): boolean {
  return recognitionConstructor() !== undefined;
}

export interface DictationEvents {
  /** Listening has stopped, by `stop()` or on its own (a long silence, a lost connection). */
  onEnd?(): void;
  /** The browser's reason: `not-allowed` (microphone blocked), `no-speech`, `network`, or `start-failed`. */
  onError?(reason: string): void;
}

/**
 * Starts listening and hands `onText` each finished phrase (a phrase still
 * forming is not sent). Returns the function that stops it; stopping twice is
 * harmless. Where speech is not supported it does nothing.
 */
export function startDictation(
  onText: (text: string) => void,
  events: DictationEvents = {},
): () => void {
  const Ctor = recognitionConstructor();
  if (!Ctor) return () => {};
  const rec = new Ctor();
  let stopped = false;
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language
      : 'en-US';
  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result?.isFinal ? result[0]?.transcript.trim() : undefined;
      if (text) onText(text);
    }
  };
  rec.onerror = (event) => events.onError?.(event.error);
  rec.onend = () => {
    stopped = true;
    events.onEnd?.();
  };
  try {
    rec.start();
  } catch {
    stopped = true;
    events.onError?.('start-failed');
    return () => {};
  }
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      rec.stop();
    } catch {
      /* it had already ended */
    }
  };
}
