import { DEFAULT_SETTINGS } from './game';
import type { Settings } from './game';
import { Modal } from './Modal';

export function SettingsPanel({
  settings,
  onChange,
  onClose,
  testAudio,
  testing,
  error,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  testAudio: () => void;
  testing: boolean;
  error: string;
}) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const key = (channel: 'positionKey' | 'audioKey', value: string) => {
    const other = channel === 'positionKey' ? 'audioKey' : 'positionKey';
    if (!/^[a-z]$/.test(value)) return;
    set({ [channel]: value, ...(value === settings[other] ? { [other]: settings[channel] } : {}) });
  };
  return (
    <Modal title="Make it yours" onClose={onClose}>
      <p className="modal-intro">A few adjustments. The rest is just focus.</p>
      <div className="setting-row">
        <div>
          <label htmlFor="rounds">Session length</label>
          <p>Scored rounds, plus a short warmup</p>
        </div>
        <select
          id="rounds"
          value={settings.rounds}
          onChange={(e) => set({ rounds: Number(e.target.value) })}
        >
          <option value={20}>20 rounds</option>
          <option value={40}>40 rounds</option>
          <option value={60}>60 rounds</option>
        </select>
      </div>
      <div className="setting-row">
        <div>
          <label htmlFor="pace">Pace</label>
          <p>Time between each position and sound</p>
        </div>
        <select
          id="pace"
          value={settings.interval}
          onChange={(e) => set({ interval: Number(e.target.value) })}
        >
          <option value={2000}>2 seconds</option>
          <option value={2500}>2.5 seconds</option>
          <option value={3000}>3 seconds</option>
          <option value={4000}>4 seconds</option>
          <option value={5000}>5 seconds</option>
        </select>
      </div>
      <div className="setting-row volume-row">
        <div>
          <label htmlFor="volume">Audio volume</label>
          <p>
            <button className="text-button" onClick={testAudio} disabled={testing}>
              {testing ? 'Playing C…' : 'Test audio'}
            </button>
          </p>
        </div>
        <div className="range-control">
          <input
            id="volume"
            type="range"
            min="1"
            max="100"
            value={settings.volume}
            onChange={(e) => set({ volume: Number(e.target.value) })}
          />
          <output htmlFor="volume">{settings.volume}%</output>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <span className="setting-label">Keyboard shortcuts</span>
          <p>Select a key, then press a letter</p>
        </div>
        <div className="key-fields">
          <label>
            Position
            <input
              aria-label="Position shortcut"
              value={settings.positionKey.toUpperCase()}
              maxLength={1}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key.length === 1) {
                  e.preventDefault();
                  key('positionKey', e.key.toLowerCase());
                }
              }}
              onChange={(e) => key('positionKey', e.target.value.toLowerCase())}
            />
          </label>
          <label>
            Audio
            <input
              aria-label="Audio shortcut"
              value={settings.audioKey.toUpperCase()}
              maxLength={1}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key.length === 1) {
                  e.preventDefault();
                  key('audioKey', e.key.toLowerCase());
                }
              }}
              onChange={(e) => key('audioKey', e.target.value.toLowerCase())}
            />
          </label>
        </div>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="text-button muted" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
          Reset defaults
        </button>
        <button className="primary small" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
