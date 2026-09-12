import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';
import type { Result } from './game';

export function Results({
  result,
  onAgain,
  onChangeLevel,
  saved,
  busy,
}: {
  result: Result;
  onAgain: () => void;
  onChangeLevel: (n: number) => void;
  saved: boolean;
  busy: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const [details, setDetails] = useState(false);
  const recommendation =
    result.accuracy >= 80 && result.settings.n < 9
      ? result.settings.n + 1
      : result.accuracy < 60 && result.settings.n > 1
        ? result.settings.n - 1
        : result.settings.n;
  return (
    <section className="results" aria-labelledby="results-title">
      <div className="result-heading">
        <h1 id="results-title" tabIndex={-1} ref={heading}>
          Session complete.
        </h1>
        <p>
          Dual {result.settings.n}-back <span className="dot-separator">·</span>{' '}
          {result.settings.rounds} rounds
        </p>
      </div>
      <div className="big-score">
        {Math.round(result.accuracy)}
        <span>%</span>
      </div>
      <div className="score-label">Balanced accuracy</div>
      <div className="channel-scores">
        {(['position', 'audio'] as const).map((channel) => (
          <div key={channel}>
            <span>{channel === 'position' ? 'Position' : 'Audio'}</span>
            <strong>
              {Math.round(result[channel].accuracy)}
              <small>%</small>
            </strong>
            <div className="score-track">
              <span style={{ width: `${result[channel].accuracy}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="result-explanation">
        An equal balance of finding matches and avoiding false alarms. 50% is the no-response
        baseline.
      </p>
      <button
        className="details-toggle"
        aria-expanded={details}
        onClick={() => setDetails(!details)}
      >
        Score breakdown <ChevronDown size={16} className={details ? 'rotate' : ''} />
      </button>
      {details && (
        <div className="breakdown">
          <table>
            <thead>
              <tr>
                <th scope="col">Responses</th>
                <th scope="col">Position</th>
                <th scope="col">Audio</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['hits', 'Matches found'],
                  ['misses', 'Matches missed'],
                  ['falseAlarms', 'False alarms'],
                  ['correctRejections', 'Correct non-matches'],
                ] as const
              ).map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{result.position[key]}</td>
                  <td>{result.audio[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            The first {result.settings.n} warmup{' '}
            {result.settings.n === 1 ? 'round is' : 'rounds are'} excluded.
            {result.interruptions > 0
              ? ` Paused ${result.interruptions} ${result.interruptions === 1 ? 'time' : 'times'}; interrupted rounds were replayed.`
              : ''}
          </p>
        </div>
      )}
      <div className="result-actions">
        <button className="primary" onClick={onAgain} disabled={busy}>
          {busy ? 'Preparing audio…' : 'Play again'} <ArrowRight size={17} />
        </button>
        {recommendation !== result.settings.n ? (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => onChangeLevel(recommendation)}
          >
            Try {recommendation}-back
          </button>
        ) : (
          <button
            className="text-button muted"
            disabled={busy}
            onClick={() => onChangeLevel(result.settings.n)}
          >
            Adjust difficulty
          </button>
        )}
      </div>
      <p className="save-note">
        {saved ? 'Saved on this device. Just for you.' : 'This browser could not save your result.'}
      </p>
    </section>
  );
}
