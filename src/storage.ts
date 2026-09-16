import { DEFAULT_SETTINGS } from './game';
import type { Settings, Result, ChannelScore } from './game';

const KEYS = { settings: 'nback.settings.v1', results: 'nback.results.v1' };
const MAX_RESULTS = 30;
const ROUNDS = [20, 40, 60];
const INTERVALS = [1000, 1500, 2000, 2500, 3000, 4000, 5000];
const usableKey = (v: unknown): v is string => typeof v === 'string' && /^[a-z]$/.test(v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isLevel = (v: unknown): v is number => inRange(v, 1, 9) && Number.isInteger(v);
const isRounds = (v: unknown): v is number => typeof v === 'number' && ROUNDS.includes(v);
const isInterval = (v: unknown): v is number => typeof v === 'number' && INTERVALS.includes(v);

export function loadSettings(): Settings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEYS.settings) || '{}');
    const s = isObject(parsed) ? parsed : {};
    const positionKey = usableKey(s.positionKey) ? s.positionKey : DEFAULT_SETTINGS.positionKey;
    const audioKey =
      usableKey(s.audioKey) && s.audioKey !== positionKey
        ? s.audioKey
        : positionKey === 'l'
          ? 'k'
          : 'l';
    return {
      n: isLevel(s.n) ? s.n : DEFAULT_SETTINGS.n,
      rounds: isRounds(s.rounds) ? s.rounds : DEFAULT_SETTINGS.rounds,
      interval: isInterval(s.interval) ? s.interval : DEFAULT_SETTINGS.interval,
      volume: inRange(s.volume, 1, 100) ? s.volume : DEFAULT_SETTINGS.volume,
      positionKey,
      audioKey,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  } catch {
    /* Session still works when storage is blocked. */
  }
}

function validSettings(value: unknown): value is Settings {
  return (
    isObject(value) &&
    isLevel(value.n) &&
    isRounds(value.rounds) &&
    isInterval(value.interval) &&
    inRange(value.volume, 1, 100) &&
    usableKey(value.positionKey) &&
    usableKey(value.audioKey) &&
    value.positionKey !== value.audioKey
  );
}

function validScore(value: unknown, rounds: number): value is ChannelScore {
  if (!isObject(value) || !inRange(value.accuracy, 0, 100)) return false;
  const counts = [value.hits, value.misses, value.falseAlarms, value.correctRejections];
  if (
    !counts.every((count): count is number => inRange(count, 0, rounds) && Number.isInteger(count))
  )
    return false;
  const [hits, misses, falseAlarms, correctRejections] = counts;
  if (hits + misses + falseAlarms + correctRejections !== rounds) return false;
  const accuracy =
    50 * (hits / (hits + misses || 1) + correctRejections / (correctRejections + falseAlarms || 1));
  return Math.abs(value.accuracy - accuracy) < 1e-8;
}

function validResult(value: unknown): value is Result {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.date !== 'string' ||
    !Number.isFinite(Date.parse(value.date)) ||
    !validSettings(value.settings) ||
    !inRange(value.accuracy, 0, 100) ||
    typeof value.interruptions !== 'number' ||
    !Number.isSafeInteger(value.interruptions) ||
    value.interruptions < 0 ||
    !validScore(value.position, value.settings.rounds) ||
    !validScore(value.audio, value.settings.rounds)
  )
    return false;
  return Math.abs(value.accuracy - (value.position.accuracy + value.audio.accuracy) / 2) < 1e-8;
}

export function loadResults(): Result[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEYS.results) || '[]');
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const results: Result[] = [];
    for (const result of data) {
      if (!validResult(result) || seen.has(result.id)) continue;
      seen.add(result.id);
      results.push(result);
      if (results.length === MAX_RESULTS) break;
    }
    return results;
  } catch {
    return [];
  }
}

export function saveResult(result: Result) {
  const results = [result, ...loadResults().filter((r) => r.id !== result.id)].slice(
    0,
    MAX_RESULTS,
  );
  try {
    localStorage.setItem(KEYS.results, JSON.stringify(results));
    return true;
  } catch {
    return false;
  }
}
