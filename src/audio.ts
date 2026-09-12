import { LETTERS } from './game';

class LetterAudio {
  onInterruption: (() => void) | null = null;
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private loading: Promise<void> | null = null;
  private loadGeneration = 0;
  private controller: AbortController | null = null;

  async prepare() {
    if (!this.context || this.context.state === 'closed') {
      this.controller?.abort();
      this.loadGeneration++;
      this.context = new AudioContext();
      this.buffers.clear();
      this.loading = null;
      const context = this.context;
      context.onstatechange = () => {
        if (context === this.context && context.state !== 'running') this.onInterruption?.();
      };
    }

    // Resume directly inside the user's gesture for mobile autoplay policies.
    const context = this.context;
    const resumed = context.resume();
    if (!this.loading) {
      const generation = ++this.loadGeneration;
      const controller = new AbortController();
      this.controller = controller;
      this.loading = Promise.all(
        LETTERS.map(async (letter) => {
          const response = await fetch(
            `${import.meta.env.BASE_URL}audio/${letter.toLowerCase()}.mp3`,
            { signal: controller.signal },
          );
          if (!response.ok)
            throw new Error('Letter audio could not load. Check your connection and try again.');
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          return [letter, buffer] as const;
        }),
      ).then((entries) => {
        // A timed-out decode may settle after a retry. Never install stale buffers.
        if (generation === this.loadGeneration) this.buffers = new Map(entries);
      });
    }

    const loading = this.loading;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([resumed, loading]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  'Audio took too long to start. Check your connection and browser sound settings, then try again.',
                ),
              ),
            15000,
          );
        }),
      ]);
      if (context.state !== 'running')
        throw new Error('Audio is unavailable. Enable sound in your browser, then try again.');
    } catch (error) {
      if (this.loading === loading && this.buffers.size !== LETTERS.length) {
        this.loadGeneration++;
        this.controller?.abort();
        this.loading = null;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  play(letter: string, volume: number) {
    if (!this.context || this.context.state !== 'running' || !this.buffers.has(letter))
      throw new Error('Audio is not ready.');
    this.stop();
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.buffers.get(letter)!;
    gain.gain.value = volume / 100;
    source.connect(gain);
    gain.connect(this.context.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.sources.clear();
  }
}

export const letterAudio = new LetterAudio();
