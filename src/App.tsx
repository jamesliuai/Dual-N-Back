import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowRight,
  Check,
  Headphones,
  Minus,
  Plus,
  Settings as SettingsIcon,
  Pause,
  Play,
  History,
  Volume2,
} from 'lucide-react';
import { GameEngine } from './game';
import type { Settings } from './game';
import { letterAudio } from './audio';
import { loadSettings, saveSettings, loadResults, saveResult } from './storage';
import { Modal } from './Modal';
import { SettingsPanel } from './SettingsPanel';
import { Results } from './Results';

export default function App() {
  const [engine] = useState(() => new GameEngine(letterAudio));
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [settings, setSettings] = useState(loadSettings);
  const [panel, setPanel] = useState<'help' | 'settings' | 'history' | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(true);
  const [history, setHistory] = useState(loadResults);
  const savedId = useRef('');
  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lock = useRef(false);
  const gameView = useRef<HTMLElement>(null);
  const active = ['running', 'countdown', 'paused'].includes(state.phase);
  const running = state.phase === 'running';
  const warmup = running && state.index < settings.n;

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    if (state.result && savedId.current !== state.result.id) {
      savedId.current = state.result.id;
      setSaved(saveResult(state.result));
      setHistory(loadResults());
    }
  }, [state.result]);
  useEffect(() => {
    letterAudio.onInterruption = () =>
      engine.pause('Audio was interrupted. Check your sound, then resume.');
    const hide = () => {
      if (document.hidden) {
        engine.pause('Session paused because you left the tab.');
        letterAudio.stop();
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      letterAudio.onInterruption = null;
      engine.dispose();
      if (testTimer.current) clearTimeout(testTimer.current);
    };
  }, [engine]);

  async function start(resume = false) {
    if (lock.current || testing) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await letterAudio.prepare();
      if (document.hidden) throw new Error('Return to this tab to start your session.');
      resume ? engine.resume() : engine.start(settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audio could not start. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function testAudio() {
    if (lock.current || testing || active) return;
    lock.current = true;
    setTesting(true);
    setError('');
    try {
      await letterAudio.prepare();
      letterAudio.play('C', settings.volume);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audio could not load. Please try again.');
    } finally {
      lock.current = false;
      testTimer.current = setTimeout(() => setTesting(false), 900);
    }
  }
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        panel ||
        busy ||
        (e.target instanceof HTMLElement &&
          ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))
      )
        return;
      const key = e.key.toLowerCase();
      // Let Space scroll when reading content occupies most of the viewport.
      if (
        !active &&
        gameView.current &&
        gameView.current.getBoundingClientRect().bottom < window.innerHeight / 2
      )
        return;
      if (key === ' ' && !(e.target instanceof HTMLElement && e.target.closest('button, a'))) {
        e.preventDefault();
        if (running || state.phase === 'countdown') engine.pause();
        else if (state.phase === 'paused') void start(true);
        else if (state.phase === 'idle' || state.phase === 'complete') void start();
      }
      if (running && key === settings.positionKey) {
        e.preventDefault();
        engine.respond('position');
      }
      if (running && key === settings.audioKey) {
        e.preventDefault();
        engine.respond('audio');
      }
      if (key === 'escape' && (running || state.phase === 'countdown')) engine.pause();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  function changeSettings(value: Settings) {
    setSettings(value);
    if (state.phase === 'complete') engine.reset();
  }
  const estimatedMinutes = Math.round(((settings.rounds + settings.n) * settings.interval) / 60000);
  const status = warmup
    ? `Remember ${state.index + 1} of ${settings.n}`
    : running
      ? `Round ${state.index - settings.n + 1} of ${settings.rounds}`
      : state.phase === 'countdown'
        ? 'Get ready'
        : state.phase === 'paused'
          ? 'Session paused'
          : '';

  return (
    <div className={`app ${active ? 'session-active' : ''}`}>
      <header className="app-header">
        <div className="wordmark">
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}brand/dual-n-back-mark.svg`}
            width="28"
            height="28"
            alt=""
          />
          <span>dual n-back</span>
        </div>
        <div className="header-actions">
          <button
            className="text-button muted"
            onClick={() => setPanel('help')}
            disabled={active || busy}
          >
            How to play
          </button>
          <button
            className="settings-button"
            onClick={() => setPanel('settings')}
            disabled={active || busy}
            aria-label="Settings"
          >
            <SettingsIcon size={19} />
            <span>Settings</span>
          </button>
        </div>
      </header>
      <main ref={gameView} className={`main ${state.phase === 'complete' ? 'is-complete' : ''}`}>
        {state.phase === 'complete' && state.result ? (
          <Results
            result={state.result}
            onAgain={() => void start()}
            onChangeLevel={(n) => {
              setSettings((s) => ({ ...s, n }));
              engine.reset();
            }}
            saved={saved}
            busy={busy}
          />
        ) : (
          <section className="test-surface" aria-label="Dual n-back test">
            <div className="test-heading">
              <h1>Dual N-Back</h1>
              <p>
                Match the position or sound from {settings.n} {settings.n === 1 ? 'step' : 'steps'}{' '}
                ago.
              </p>
            </div>
            <div className="setup-space">
              {!active ? (
                <>
                  <div className="difficulty">
                    <button
                      className="step-button"
                      aria-label="Decrease difficulty"
                      disabled={settings.n <= 1 || busy}
                      onClick={() => setSettings((s) => ({ ...s, n: s.n - 1 }))}
                    >
                      <Minus size={18} />
                    </button>
                    <span aria-label={`Difficulty ${settings.n}`} aria-live="polite">
                      {settings.n}
                    </span>
                    <button
                      className="step-button"
                      aria-label="Increase difficulty"
                      disabled={settings.n >= 9 || busy}
                      onClick={() => setSettings((s) => ({ ...s, n: s.n + 1 }))}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <p className="session-meta">
                    {settings.rounds} rounds <span>·</span> ~{estimatedMinutes || 1} min
                  </p>
                </>
              ) : (
                <>
                  <div className="session-status" aria-live="polite">
                    {status}
                  </div>
                  <p className="session-meta">
                    {warmup
                      ? 'Just watch and listen'
                      : state.phase === 'paused'
                        ? 'The current round will replay on resume'
                        : state.phase === 'countdown'
                          ? 'Find your focus. Watch and listen.'
                          : 'Respond only when there’s a match'}
                  </p>
                </>
              )}
            </div>
            <div className="grid-wrap">
              <div
                className="stimulus-grid"
                role="img"
                aria-label={
                  running && state.visible && state.trial
                    ? `Position: ${['top left', 'top middle', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'][state.trial.position]}`
                    : 'Three by three position grid'
                }
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <div
                    key={i}
                    className={`grid-cell ${i === 4 ? 'center-cell' : ''} ${(!active && i === 5) || (running && state.visible && state.trial?.position === i) ? 'lit' : ''}`}
                  >
                    {i === 4 &&
                    active &&
                    state.phase !== 'countdown' &&
                    state.phase !== 'paused' ? (
                      <span className="fixation">+</span>
                    ) : null}
                  </div>
                ))}
              </div>
              {state.phase === 'countdown' && (
                <div className="grid-overlay countdown" aria-live="assertive" key={state.countdown}>
                  {state.countdown}
                </div>
              )}
              {state.phase === 'paused' && (
                <div className="grid-overlay pause-overlay">
                  <Pause size={28} />
                  <span>Paused</span>
                </div>
              )}
            </div>
            <div className="round-progress" aria-hidden="true">
              {running && (
                <span key={state.index} style={{ animationDuration: `${settings.interval}ms` }} />
              )}
            </div>
            <div className="response-buttons">
              {(['position', 'audio'] as const).map((channel) => (
                <button
                  key={channel}
                  className={`response-button ${state.answers[channel] && running ? 'selected' : ''}`}
                  disabled={!running || warmup}
                  aria-pressed={running && state.answers[channel]}
                  aria-label={`${channel === 'position' ? 'Position' : 'Audio'} match`}
                  onClick={() => engine.respond(channel)}
                >
                  <kbd>
                    {settings[channel === 'position' ? 'positionKey' : 'audioKey'].toUpperCase()}
                  </kbd>
                  <span>{channel === 'position' ? 'Position' : 'Audio'}</span>
                  {state.answers[channel] && running ? (
                    <Check size={16} className="response-check" />
                  ) : null}
                </button>
              ))}
            </div>
            <p className="response-hint">
              {warmup
                ? `Build your memory. Matching starts after ${settings.n} ${settings.n === 1 ? 'round' : 'rounds'}.`
                : 'Press both if both match'}
            </p>
            <div className="main-action">
              {state.phase === 'paused' ? (
                <>
                  <p className="pause-reason">{state.pauseReason}</p>
                  <button className="primary" onClick={() => void start(true)} disabled={busy}>
                    <Play size={17} />
                    {busy ? 'Preparing audio…' : 'Resume session'}
                  </button>
                  <button className="end-button" disabled={busy} onClick={() => engine.reset()}>
                    End session without saving
                  </button>
                </>
              ) : active ? (
                <button className="secondary pause-button" onClick={() => engine.pause()}>
                  <Pause size={17} />
                  Pause session <kbd>Space</kbd>
                </button>
              ) : (
                <button className="primary" onClick={() => void start()} disabled={busy || testing}>
                  {busy ? 'Preparing audio…' : 'Start session'}
                  {!busy && <ArrowRight size={17} />}
                </button>
              )}
            </div>
            {!active && (
              <div className="audio-note">
                <Headphones size={17} />
                <span>Headphones recommended</span>
                <span className="note-divider" />
                <button
                  className="text-button"
                  onClick={() => void testAudio()}
                  disabled={busy || testing}
                >
                  {testing ? 'Playing C…' : 'Test audio'}
                </button>
              </div>
            )}
          </section>
        )}
        {error && panel !== 'settings' && (
          <div className="error-message" role="alert">
            <Volume2 size={18} />
            <p>{error}</p>
            <button className="text-button" onClick={() => setError('')}>
              Dismiss
            </button>
          </div>
        )}
      </main>
      <footer className="app-footer">
        <span>
          <kbd>Space</kbd> {active ? 'to pause or resume' : 'to start'}
          <span className="footer-desktop">{active ? '' : ' · Esc to pause'}</span>
        </span>
        <div>
          {history.length > 0 && (
            <button
              className="text-button muted history-button"
              onClick={() => setPanel('history')}
              disabled={active || busy}
            >
              <History size={15} />
              Recent results
            </button>
          )}
          <span className="privacy-note">Your results stay on this device</span>
        </div>
      </footer>
      {panel === 'settings' && (
        <SettingsPanel
          settings={settings}
          onChange={changeSettings}
          onClose={() => setPanel(null)}
          testAudio={() => void testAudio()}
          testing={testing}
          error={error}
        />
      )}
      {panel === 'help' && (
        <Modal title="Two things to keep in mind." onClose={() => setPanel(null)}>
          <p className="modal-intro">One position. One spoken letter. Both arrive together.</p>
          <ol className="instructions">
            <li>
              <strong>Watch the square. Listen to the letter.</strong>
              <p>A square flashes for half a second. Keep its position and the sound in memory.</p>
            </li>
            <li>
              <strong>
                Compare with {settings.n} {settings.n === 1 ? 'step' : 'steps'} ago.
              </strong>
              <p>
                Press <kbd>{settings.positionKey.toUpperCase()}</kbd> if the position matches. Press{' '}
                <kbd>{settings.audioKey.toUpperCase()}</kbd> if the letter matches. Press both for
                both; do nothing if neither matches.
              </p>
            </li>
            <li>
              <strong>Keep going, one round at a time.</strong>
              <p>
                The first {settings.n} {settings.n === 1 ? 'round is' : 'rounds are'} just for
                remembering. You have the full {settings.interval / 1000} seconds to respond, even
                after the square disappears.
              </p>
            </li>
          </ol>
          <div className="help-example">
            <span>For example, in 2-back</span>
            <div>
              C <span>→</span> H <span>→</span> <b>C</b>
            </div>
            <p>The third letter matches the first. That’s an audio match.</p>
          </div>
          <p className="help-note">
            New to this? Start with 1-back. Use the buttons on a touch screen. Press Space to pause;
            resuming replays the interrupted round.
          </p>
          <p className="help-note">
            <a href="./how-to-play/">Read the full guide, with examples and scoring details</a>
          </p>
          <button className="primary" onClick={() => setPanel(null)}>
            Got it
          </button>
          <p className="audio-credit">
            Letter recordings by{' '}
            <a href="https://freesound.org/people/tim.kahn/" target="_blank" rel="noreferrer">
              tim.kahn / Freesound
            </a>
            ,{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
            . Trimmed and normalized.{' '}
            <a
              href={`${import.meta.env.BASE_URL}audio/CREDITS.md`}
              target="_blank"
              rel="noreferrer"
            >
              Full credits
            </a>
            .
          </p>
        </Modal>
      )}
      {panel === 'history' && (
        <Modal title="Recent results" onClose={() => setPanel(null)}>
          <p className="modal-intro">Your last 30 sessions, saved only in this browser.</p>
          <div className="history-list">
            {history.map((result) => (
              <div className="history-row" key={result.id}>
                <div>
                  <strong>Dual {result.settings.n}-back</strong>
                  <span>
                    {new Date(result.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {result.settings.rounds} rounds
                  </span>
                </div>
                <strong>
                  {Math.round(result.accuracy)}
                  <small>%</small>
                </strong>
              </div>
            ))}
          </div>
          <p className="help-note">
            Scores show balanced accuracy. Compare sessions at the same difficulty and pace.
          </p>
        </Modal>
      )}
    </div>
  );
}
