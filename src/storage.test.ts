import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './game';
import type { Result } from './game';
import { loadResults, loadSettings, saveResult, saveSettings } from './storage';

const SETTINGS_KEY = 'nback.settings.v1';
const RESULTS_KEY = 'nback.results.v1';
let stored: Map<string, string>;

function result(id = 'session-1'): Result {
  const score = {
    hits: 4,
    misses: 2,
    falseAlarms: 1,
    correctRejections: 13,
    accuracy: 50 * (4 / 6 + 13 / 14),
  };
  return {
    id,
    date: '2026-09-11T20:00:00.000Z',
    settings: { ...DEFAULT_SETTINGS },
    position: { ...score },
    audio: { ...score },
    accuracy: score.accuracy,
    interruptions: 0,
  };
}

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => stored.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('saved settings', () => {
  it.each([undefined, '{invalid', 'null', '[]', '42', '"settings"'])(
    'recovers defaults from missing or malformed settings: %s',
    (value) => {
      if (value !== undefined) stored.set(SETTINGS_KEY, value);
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
      expect(loadSettings()).not.toBe(DEFAULT_SETTINGS);
    },
  );

  it('round-trips supported settings', () => {
    const settings = {
      n: 9,
      rounds: 60,
      interval: 5000,
      volume: 1,
      positionKey: 'z',
      audioKey: 'x',
    };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('keeps valid fields and replaces unsupported values without coercion', () => {
    stored.set(
      SETTINGS_KEY,
      JSON.stringify({
        n: 2.5,
        rounds: '40',
        interval: 3500,
        volume: 0,
        positionKey: 'q',
        audioKey: 'w',
      }),
    );
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, positionKey: 'q', audioKey: 'w' });
  });

  it.each([
    [
      { positionKey: 'INVALID', audioKey: 'a' },
      { positionKey: 'a', audioKey: 'l' },
    ],
    [
      { positionKey: 'A', audioKey: 'a' },
      { positionKey: 'a', audioKey: 'l' },
    ],
    [
      { positionKey: 'l', audioKey: 'l' },
      { positionKey: 'l', audioKey: 'k' },
    ],
    [
      { positionKey: 'q', audioKey: 'q' },
      { positionKey: 'q', audioKey: 'l' },
    ],
    [
      { positionKey: 'l', audioKey: {} },
      { positionKey: 'l', audioKey: 'k' },
    ],
  ])('resolves shortcut conflicts after normalizing %j', (saved, keys) => {
    stored.set(SETTINGS_KEY, JSON.stringify(saved));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, ...keys });
  });
});

describe('saved results', () => {
  it.each([undefined, '{invalid', 'null', '{}', '42'])(
    'recovers empty history from malformed data: %s',
    (value) => {
      if (value !== undefined) stored.set(RESULTS_KEY, value);
      expect(loadResults()).toEqual([]);
    },
  );

  const valid = result();
  it.each([
    ['missing fields', {}],
    ['empty id', { ...valid, id: ' ' }],
    ['invalid date', { ...valid, date: 'not a date' }],
    ['invalid level', { ...valid, settings: { ...valid.settings, n: 1.5 } }],
    [
      'object-valued rounds',
      { ...valid, settings: { ...valid.settings, rounds: { corrupt: true } } },
    ],
    ['missing pace', { ...valid, settings: { ...valid.settings, interval: undefined } }],
    ['invalid volume', { ...valid, settings: { ...valid.settings, volume: 101 } }],
    ['duplicate shortcuts', { ...valid, settings: { ...valid.settings, audioKey: 'a' } }],
    ['missing channel', { ...valid, position: undefined }],
    ['negative count', { ...valid, position: { ...valid.position, hits: -1 } }],
    ['fractional count', { ...valid, position: { ...valid.position, hits: 4.5 } }],
    ['wrong count total', { ...valid, position: { ...valid.position, hits: 5 } }],
    ['missing count', { ...valid, position: { ...valid.position, misses: undefined } }],
    ['out-of-range channel accuracy', { ...valid, audio: { ...valid.audio, accuracy: 101 } }],
    ['inconsistent channel accuracy', { ...valid, audio: { ...valid.audio, accuracy: 50 } }],
    ['inconsistent overall accuracy', { ...valid, accuracy: 50 }],
    ['non-finite overall accuracy', { ...valid, accuracy: Infinity }],
    ['negative interruptions', { ...valid, interruptions: -1 }],
    ['missing interruptions', { ...valid, interruptions: undefined }],
  ])('drops %s while preserving valid neighboring records', (_name, corrupt) => {
    const before = result('before');
    const after = result('after');
    stored.set(RESULTS_KEY, JSON.stringify([before, corrupt, after]));
    expect(loadResults()).toEqual([before, after]);
  });

  it('keeps the first 30 distinct valid records in stored order', () => {
    const results = Array.from({ length: 35 }, (_, i) => result(`session-${i}`));
    stored.set(RESULTS_KEY, JSON.stringify([null, results[0], results[0], ...results.slice(1)]));
    expect(loadResults()).toEqual(results.slice(0, 30));
  });

  it('prepends results, replaces an existing id, and caps history at 30', () => {
    const results = Array.from({ length: 30 }, (_, i) => result(`session-${i}`));
    stored.set(RESULTS_KEY, JSON.stringify(results));
    const replacement = { ...results[10], interruptions: 2 };
    expect(saveResult(replacement)).toBe(true);
    expect(loadResults()).toEqual([
      replacement,
      ...results.filter((item) => item.id !== replacement.id),
    ]);
    const newest = result('newest');
    expect(saveResult(newest)).toBe(true);
    expect(loadResults()).toEqual(
      [newest, replacement, ...results.filter((item) => item.id !== replacement.id)].slice(0, 30),
    );
  });
});

describe('unavailable browser storage', () => {
  it('recovers defaults and reports failed result saves when storage access throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('Storage blocked');
      },
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadResults()).toEqual([]);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(saveResult(result())).toBe(false);
  });

  it('preserves existing history and reports a write failure when quota is exhausted', () => {
    const existing = result('existing');
    stored.set(RESULTS_KEY, JSON.stringify([existing]));
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(saveResult(result('new'))).toBe(false);
    expect(loadResults()).toEqual([existing]);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
