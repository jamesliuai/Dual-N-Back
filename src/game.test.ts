import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  GameEngine,
  generateTrials,
  scoreSession,
  POSITIONS,
  LETTERS,
} from './game';
import type { Answer, Trial } from './game';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
describe('dual n-back protocol', () => {
  it('has exact target counts, dual targets, and no accidental matches at every level', () => {
    for (const n of [1, 2, 5, 9])
      for (const rounds of [20, 40, 60])
        for (let seed = 0; seed < 20; seed++) {
          const trials = generateTrials({ ...DEFAULT_SETTINGS, n, rounds }, seeded(seed));
          expect(trials).toHaveLength(n + rounds);
          const targets = { position: 0, audio: 0, both: 0 };
          trials.forEach((t, i) => {
            expect(POSITIONS).toContain(t.position);
            expect(LETTERS).toContain(t.audio);
            if (i < n) return;
            const p = t.position === trials[i - n].position,
              a = t.audio === trials[i - n].audio;
            targets.position += +p;
            targets.audio += +a;
            targets.both += +(p && a);
          });
          expect(targets).toEqual({
            position: rounds * 0.3,
            audio: rounds * 0.3,
            both: rounds * 0.1,
          });
        }
  });
  it('scores perfect, inverted, absent and indiscriminate responses without rewarding warmup presses', () => {
    const trials = generateTrials(DEFAULT_SETTINGS, seeded(10));
    const truth = trials.map((t, i) => ({
      position: t.position === trials[i - 2]?.position,
      audio: t.audio === trials[i - 2]?.audio,
    }));
    expect(scoreSession(trials, truth, DEFAULT_SETTINGS).accuracy).toBe(100);
    expect(
      scoreSession(
        trials,
        truth.map((t) => ({ position: !t.position, audio: !t.audio })),
        DEFAULT_SETTINGS,
      ).accuracy,
    ).toBe(0);
    expect(
      scoreSession(
        trials,
        trials.map(() => ({ position: false, audio: false })),
        DEFAULT_SETTINGS,
      ).accuracy,
    ).toBe(50);
    expect(
      scoreSession(
        trials,
        trials.map(() => ({ position: true, audio: true })),
        DEFAULT_SETTINGS,
      ).accuracy,
    ).toBe(50);
    truth[0] = { position: true, audio: true };
    truth[1] = { position: true, audio: true };
    expect(scoreSession(trials, truth, DEFAULT_SETTINGS).accuracy).toBe(100);
  });
  it('keeps hits, misses, false alarms and correct rejections separate', () => {
    const trials: Trial[] = [
      { position: 0, audio: 'C' },
      { position: 0, audio: 'C' },
      { position: 1, audio: 'H' },
      { position: 1, audio: 'H' },
      { position: 2, audio: 'K' },
    ];
    const answers: Answer[] = [
      { position: true, audio: true },
      { position: true, audio: true },
      { position: true, audio: true },
      { position: false, audio: false },
      { position: false, audio: false },
    ];
    expect(
      scoreSession(trials, answers, { ...DEFAULT_SETTINGS, n: 1, rounds: 4 }).position,
    ).toEqual({ hits: 1, misses: 1, falseAlarms: 1, correctRejections: 1, accuracy: 50 });
  });
});

describe('session timing and input', () => {
  afterEach(() => vi.useRealTimers());
  it('gives the last round its full response window, ignores warmup and duplicate responses, then completes once', () => {
    vi.useFakeTimers();
    const audio = { play: vi.fn(), stop: vi.fn() };
    const game = new GameEngine(audio);
    game.start(DEFAULT_SETTINGS);
    expect(game.getSnapshot().phase).toBe('countdown');
    vi.advanceTimersByTime(3000);
    expect(game.getSnapshot().index).toBe(0);
    game.respond('position');
    expect(game.getSnapshot().answers.position).toBe(false);
    vi.advanceTimersByTime(500);
    expect(game.getSnapshot().visible).toBe(false);
    vi.advanceTimersByTime(2 * DEFAULT_SETTINGS.interval - 500);
    expect(game.getSnapshot().index).toBe(2);
    game.respond('position');
    game.respond('position');
    game.respond('audio');
    expect(game.getSnapshot().answers).toEqual({ position: true, audio: true });
    vi.advanceTimersByTime(19 * DEFAULT_SETTINGS.interval);
    expect(game.getSnapshot().index).toBe(21);
    vi.advanceTimersByTime(DEFAULT_SETTINGS.interval - 1);
    expect(game.getSnapshot().phase).toBe('running');
    game.respond('audio');
    expect(game.getSnapshot().answers.audio).toBe(true);
    vi.advanceTimersByTime(1);
    expect(game.getSnapshot().phase).toBe('complete');
    expect(audio.play).toHaveBeenCalledTimes(22);
    game.dispose();
  });
  it('freezes while paused and replays the interrupted trial after a new count-in', () => {
    vi.useFakeTimers();
    const game = new GameEngine({ play: vi.fn(), stop: vi.fn() });
    game.start(DEFAULT_SETTINGS);
    vi.advanceTimersByTime(3000 + 2 * DEFAULT_SETTINGS.interval + 500);
    const trial = game.getSnapshot().trial;
    game.respond('position');
    game.pause();
    vi.advanceTimersByTime(90000);
    expect(game.getSnapshot().index).toBe(2);
    expect(game.getSnapshot().phase).toBe('paused');
    game.resume();
    vi.advanceTimersByTime(3000);
    expect(game.getSnapshot().trial).toEqual(trial);
    expect(game.getSnapshot().answers.position).toBe(false);
    vi.advanceTimersByTime(20 * DEFAULT_SETTINGS.interval);
    expect(game.getSnapshot().result?.interruptions).toBe(1);
    game.dispose();
  });
  it('pauses instead of presenting a silent trial when audio fails', () => {
    vi.useFakeTimers();
    const game = new GameEngine({
      play: () => {
        throw new Error('interrupted');
      },
      stop: vi.fn(),
    });
    game.start(DEFAULT_SETTINGS);
    vi.advanceTimersByTime(3000);
    expect(game.getSnapshot().phase).toBe('paused');
    expect(game.getSnapshot().pauseReason).toContain('Audio');
    vi.advanceTimersByTime(10000);
    expect(game.getSnapshot().index).toBe(0);
    game.dispose();
  });
});
