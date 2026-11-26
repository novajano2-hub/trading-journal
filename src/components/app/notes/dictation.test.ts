// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { speechSupported, startDictation } from './dictation';

/** The parts of the browser's recognition object that dictation uses. */
class FakeRecognition {
  static last: FakeRecognition | undefined;
  continuous = false;
  interimResults = true;
  lang = '';
  started = 0;
  stopped = 0;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
    this.onend?.();
  }
  /** What the browser reports: results from `from`, each with a final flag. */
  say(parts: { text: string; final: boolean }[], from = 0) {
    this.onresult?.({
      resultIndex: from,
      results: Object.assign(
        parts.map((p) =>
          Object.assign([{ transcript: p.text }], { isFinal: p.final }),
        ),
        {},
      ),
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeRecognition.last = undefined;
});

test('speech is supported only where the browser has a recognition object', () => {
  expect(speechSupported()).toBe(false);
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  expect(speechSupported()).toBe(true);
  vi.unstubAllGlobals();
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  expect(speechSupported()).toBe(true);
});

test('dictation hands over each finished phrase and ignores the ones still forming', () => {
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  const heard: string[] = [];
  const stop = startDictation((t) => heard.push(t));
  const rec = FakeRecognition.last!;
  expect(rec.started).toBe(1);
  // It keeps listening past a pause, and only finished phrases arrive.
  expect(rec.continuous).toBe(true);
  expect(rec.interimResults).toBe(false);

  rec.say([{ text: 'long two on the break', final: true }]);
  rec.say(
    [
      { text: 'long two on the break', final: true },
      { text: 'stops at', final: false },
    ],
    1,
  );
  rec.say(
    [
      { text: 'long two on the break', final: true },
      { text: 'stops at six six oh six', final: true },
    ],
    1,
  );
  expect(heard).toEqual(['long two on the break', 'stops at six six oh six']);

  stop();
  expect(rec.stopped).toBe(1);
  // Stopping twice is harmless.
  stop();
  expect(rec.stopped).toBe(1);
});

test('dictation says when it ends or cannot start', () => {
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  const ended = vi.fn();
  const failed = vi.fn();
  startDictation(() => {}, { onEnd: ended, onError: failed });
  const rec = FakeRecognition.last!;
  rec.onerror?.({ error: 'not-allowed' });
  expect(failed).toHaveBeenCalledWith('not-allowed');
  rec.onend?.();
  expect(ended).toHaveBeenCalledTimes(1);
});

test('dictation does nothing where speech is not supported', () => {
  const onText = vi.fn();
  const stop = startDictation(onText);
  expect(onText).not.toHaveBeenCalled();
  expect(() => stop()).not.toThrow();
});

test('a browser that refuses to start leaves a quiet error', () => {
  class Refuses extends FakeRecognition {
    override start() {
      throw new Error('already started');
    }
  }
  vi.stubGlobal('webkitSpeechRecognition', Refuses);
  const failed = vi.fn();
  const stop = startDictation(() => {}, { onError: failed });
  expect(failed).toHaveBeenCalled();
  expect(() => stop()).not.toThrow();
});
