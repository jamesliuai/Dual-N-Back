export const LETTERS = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'] as const;
export const POSITIONS = [0, 1, 2, 3, 5, 6, 7, 8];
export type Channel = 'position' | 'audio';
export interface Settings {
  n: number;
  rounds: number;
  interval: number;
  volume: number;
  positionKey: string;
  audioKey: string;
}
export const DEFAULT_SETTINGS: Settings = {
  n: 2,
  rounds: 20,
  interval: 2500,
  volume: 80,
  positionKey: 'a',
  audioKey: 'l',
};
export interface Trial {
  position: number;
  audio: string;
}
export interface Answer {
  position: boolean;
  audio: boolean;
}
export interface ChannelScore {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  accuracy: number;
}
export interface Result {
  id: string;
  date: string;
  settings: Settings;
  position: ChannelScore;
  audio: ChannelScore;
  accuracy: number;
  interruptions: number;
}

function shuffle<T>(items: T[], random: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function generateTrials(settings: Settings, random = Math.random): Trial[] {
  // 30% targets per channel, including 10% simultaneous targets. Non-targets
  // explicitly exclude the N-back value to prevent accidental matches.
  const order = shuffle(
    Array.from({ length: settings.rounds }, (_, i) => i + settings.n),
    random,
  );
  const both = Math.round(settings.rounds * 0.1);
  const single = Math.round(settings.rounds * 0.3) - both;
  const positionTargets = new Set(order.slice(0, both + single));
  const audioTargets = new Set([
    ...order.slice(0, both),
    ...order.slice(both + single, both + 2 * single),
  ]);
  const trials: Trial[] = [];
  for (let i = 0; i < settings.rounds + settings.n; i++) {
    const previous = trials[i - settings.n];
    const positions = POSITIONS.filter((p) => p !== previous?.position);
    const letters = LETTERS.filter((l) => l !== previous?.audio);
    trials.push({
      position: positionTargets.has(i)
        ? previous.position
        : positions[Math.floor(random() * positions.length)],
      audio: audioTargets.has(i) ? previous.audio : letters[Math.floor(random() * letters.length)],
    });
  }
  return trials;
}
export function scoreSession(
  trials: Trial[],
  answers: Answer[],
  settings: Settings,
  interruptions = 0,
): Result {
  const scores = {} as Record<Channel, ChannelScore>;
  for (const channel of ['position', 'audio'] as const) {
    const s: ChannelScore = {
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
      accuracy: 0,
    };
    for (let i = settings.n; i < trials.length; i++) {
      const match = trials[i][channel] === trials[i - settings.n][channel];
      if (match) answers[i]?.[channel] ? s.hits++ : s.misses++;
      else answers[i]?.[channel] ? s.falseAlarms++ : s.correctRejections++;
    }
    s.accuracy =
      50 *
      (s.hits / (s.hits + s.misses || 1) +
        s.correctRejections / (s.correctRejections + s.falseAlarms || 1));
    scores[channel] = s;
  }
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    settings: { ...settings },
    ...scores,
    accuracy: (scores.position.accuracy + scores.audio.accuracy) / 2,
    interruptions,
  };
}

export type Phase = 'idle' | 'countdown' | 'running' | 'paused' | 'complete';
export interface Snapshot {
  phase: Phase;
  index: number;
  visible: boolean;
  countdown: number;
  answers: Answer;
  trial: Trial | null;
  result: Result | null;
  pauseReason: string;
}
export interface GameAudio {
  play(letter: string, volume: number): void;
  stop(): void;
}
export class GameEngine {
  private listeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private trials: Trial[] = [];
  private answers: Answer[] = [];
  private settings = DEFAULT_SETTINGS;
  private deadline = 0;
  private interruptions = 0;
  private snapshot: Snapshot = {
    phase: 'idle',
    index: -1,
    visible: false,
    countdown: 3,
    answers: { position: false, audio: false },
    trial: null,
    result: null,
    pauseReason: '',
  };
  constructor(private audio: GameAudio) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }
  private clear() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.audio.stop();
  }
  start(settings: Settings) {
    this.clear();
    this.settings = { ...settings };
    this.trials = generateTrials(settings);
    this.answers = [];
    this.interruptions = 0;
    this.update({
      index: -1,
      result: null,
      trial: null,
      answers: { position: false, audio: false },
    });
    this.countIn(0);
  }
  private countIn(index: number) {
    this.update({ phase: 'countdown', countdown: 3, visible: false });
    this.later(() => this.update({ countdown: 2 }), 1000);
    this.later(() => this.update({ countdown: 1 }), 2000);
    this.later(() => this.present(index), 3000);
  }
  private present(index: number) {
    this.clear();
    if (index >= this.trials.length) {
      this.update({
        phase: 'complete',
        visible: false,
        result: scoreSession(this.trials, this.answers, this.settings, this.interruptions),
      });
      return;
    }
    this.deadline = performance.now() + this.settings.interval;
    this.update({
      phase: 'running',
      index,
      visible: true,
      trial: this.trials[index],
      answers: { position: false, audio: false },
    });
    try {
      this.audio.play(this.trials[index].audio, this.settings.volume);
    } catch {
      this.pause('Audio was interrupted. Check your sound, then resume.');
      return;
    }
    this.later(() => this.update({ visible: false }), 500);
    this.later(() => {
      this.answers[index] = { ...this.snapshot.answers };
      this.present(index + 1);
    }, this.settings.interval);
  }
  respond(channel: Channel) {
    if (
      this.snapshot.phase !== 'running' ||
      this.snapshot.index < this.settings.n ||
      performance.now() >= this.deadline
    )
      return;
    this.update({
      answers: { ...this.snapshot.answers, [channel]: !this.snapshot.answers[channel] },
    });
  }
  pause(reason = 'Take your time. Your session is right here.') {
    if (!['running', 'countdown'].includes(this.snapshot.phase)) return;
    this.clear();
    this.interruptions++;
    this.update({ phase: 'paused', visible: false, pauseReason: reason });
  }
  resume() {
    if (this.snapshot.phase === 'paused') {
      this.clear();
      this.countIn(Math.max(0, this.snapshot.index));
    }
  }
  reset() {
    this.clear();
    this.update({
      phase: 'idle',
      index: -1,
      visible: false,
      trial: null,
      result: null,
      answers: { position: false, audio: false },
    });
  }
  dispose() {
    this.clear();
  }
}
