import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LETTERS } from './game';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function encodedLetter(letter: string) {
  return Uint8Array.of(letter.charCodeAt(0)).buffer;
}

function decodedLetter(letter: string) {
  return { letter } as unknown as AudioBuffer;
}

function successfulResponse(url: string | URL | Request) {
  const letter = String(url).split('/').at(-1)!.charAt(0).toUpperCase();
  return Promise.resolve({
    ok: true,
    arrayBuffer: async () => encodedLetter(letter),
  } as Response);
}

function mockAudioContext() {
  const context = {
    state: 'suspended',
    destination: {},
    onstatechange: null as (() => void) | null,
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    decodeAudioData: vi.fn(async (data: ArrayBuffer) =>
      decodedLetter(String.fromCharCode(new Uint8Array(data)[0])),
    ),
    createBufferSource: vi.fn(() => ({
      buffer: null as AudioBuffer | null,
      onended: null as (() => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  };
  return context;
}

describe('recorded letter audio', () => {
  let context: ReturnType<typeof mockAudioContext>;
  let fetchAudio: ReturnType<typeof vi.fn<typeof fetch>>;
  let audio: (typeof import('./audio'))['letterAudio'];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubEnv('BASE_URL', '/dual-n-back/');
    context = mockAudioContext();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return context;
      }),
    );
    fetchAudio = vi.fn<typeof fetch>(successfulResponse);
    vi.stubGlobal('fetch', fetchAudio);
    audio = (await import('./audio')).letterAudio;
  });

  afterEach(() => {
    audio.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('unlocks immediately and waits for all eight recordings before reporting readiness', async () => {
    const lastRecording = deferred<AudioBuffer>();
    context.decodeAudioData.mockImplementation(async (data) => {
      const letter = String.fromCharCode(new Uint8Array(data)[0]);
      return letter === 'T' ? lastRecording.promise : decodedLetter(letter);
    });
    expect(() => audio.play('C', 80)).toThrow('Audio is not ready');

    const ready = vi.fn();
    const preparation = audio.prepare().then(ready);
    expect(context.resume).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchAudio.mock.calls.map(([url]) => url)).toEqual(
      LETTERS.map((letter) => `/dual-n-back/audio/${letter.toLowerCase()}.mp3`),
    );
    expect(context.decodeAudioData).toHaveBeenCalledTimes(8);
    expect(ready).not.toHaveBeenCalled();
    expect(context.createBufferSource).not.toHaveBeenCalled();
    expect(() => audio.play('C', 80)).toThrow('Audio is not ready');

    lastRecording.resolve(decodedLetter('T'));
    await preparation;
    expect(ready).toHaveBeenCalledOnce();
    for (const letter of LETTERS) audio.play(letter, 35);
    for (const [index, { value: source }] of context.createBufferSource.mock.results.entries()) {
      expect(source.buffer).toEqual(decodedLetter(LETTERS[index]));
      expect(source.start).toHaveBeenCalledOnce();
      expect(context.createGain.mock.results[index].value.gain.value).toBe(0.35);
    }
    await audio.prepare();
    expect(fetchAudio).toHaveBeenCalledTimes(8);
  });

  it('reports a missing recording and loads successfully on retry', async () => {
    fetchAudio.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(audio.prepare()).rejects.toThrow(/could not load/i);
    await vi.advanceTimersByTimeAsync(0);

    await expect(audio.prepare()).resolves.toBeUndefined();
    expect(fetchAudio).toHaveBeenCalledTimes(16);
    for (const letter of LETTERS) expect(() => audio.play(letter, 80)).not.toThrow();
  });

  it('allows another preload after a recording cannot be decoded', async () => {
    context.decodeAudioData.mockRejectedValueOnce(new Error('Invalid mp3 recording'));
    await expect(audio.prepare()).rejects.toThrow('Invalid mp3 recording');
    await vi.advanceTimersByTimeAsync(0);

    await expect(audio.prepare()).resolves.toBeUndefined();
    expect(fetchAudio).toHaveBeenCalledTimes(16);
    expect(() => audio.play('C', 80)).not.toThrow();
  });

  it.each(['suspended', 'interrupted'])(
    'notifies the session when browser audio becomes %s',
    async (state) => {
      const onInterruption = vi.fn();
      audio.onInterruption = onInterruption;
      await audio.prepare();

      context.state = state;
      context.onstatechange?.();
      expect(onInterruption).toHaveBeenCalledOnce();
      expect(() => audio.play('C', 80)).toThrow('Audio is not ready');

      await audio.prepare();
      context.onstatechange?.();
      expect(onInterruption).toHaveBeenCalledOnce();
      expect(() => audio.play('C', 80)).not.toThrow();
      expect(fetchAudio).toHaveBeenCalledTimes(8);
    },
  );

  it('bounds a stalled fetch with an abort signal and permits a fresh retry', async () => {
    let requestSignal: AbortSignal | null | undefined;
    fetchAudio.mockImplementationOnce((_url, options) => {
      requestSignal = options?.signal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), {
          once: true,
        });
      });
    });
    const failure = expect(audio.prepare()).rejects.toThrow(/timed out|too long/i);
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;
    expect(requestSignal?.aborted).toBe(true);

    await expect(audio.prepare()).resolves.toBeUndefined();
    expect(() => audio.play('C', 80)).not.toThrow();
  });

  it('times out a stuck decoder and starts a new preload when the user retries', async () => {
    context.decodeAudioData.mockImplementationOnce(() => new Promise<AudioBuffer>(() => {}));
    const failure = expect(audio.prepare()).rejects.toThrow(/too long/i);
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;

    const retry = audio.prepare();
    const outcome = retry.then(
      () => 'ready',
      () => 'failed',
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchAudio).toHaveBeenCalledTimes(16);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(outcome).resolves.toBe('ready');
    expect(() => audio.play('C', 80)).not.toThrow();
  });

  it('times out a browser that never resumes and allows the next user gesture to retry', async () => {
    context.resume.mockImplementationOnce(() => new Promise<void>(() => {}));
    const failure = expect(audio.prepare()).rejects.toThrow(/too long/i);
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;

    await expect(audio.prepare()).resolves.toBeUndefined();
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(() => audio.play('C', 80)).not.toThrow();
  });

  it('keeps retry buffers when an abandoned decoder eventually finishes', async () => {
    const abandonedDecode = deferred<AudioBuffer>();
    context.decodeAudioData.mockImplementationOnce(() => abandonedDecode.promise);
    const failure = expect(audio.prepare()).rejects.toThrow(/too long/i);
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;

    await audio.prepare();
    audio.play('C', 80);
    const currentBuffer = context.createBufferSource.mock.results.at(-1)!.value.buffer;
    expect(currentBuffer).toEqual(decodedLetter('C'));

    abandonedDecode.resolve(decodedLetter('stale recording'));
    await vi.advanceTimersByTimeAsync(0);
    audio.play('C', 80);
    expect(context.createBufferSource.mock.results.at(-1)!.value.buffer).toBe(currentBuffer);
  });
});
