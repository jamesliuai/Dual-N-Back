# Dual N-Back

A focused dual n-back memory task built with React, TypeScript, Vite, and Web Audio. Follow a flashing square and a spoken letter, then identify whether either matches the stimulus from **N rounds earlier**.

The app runs entirely in the browser, with bundled audio, adjustable difficulty, a score breakdown, and local session history. It has no backend, accounts, analytics, or third-party runtime requests.

## Run locally

Use **Node.js 22.12 or later** and npm.

```sh
git clone https://github.com/jamesliuai/Dual-N-Back.git
cd Dual-N-Back
npm ci
npm run dev
```

Open the local URL printed by Vite. The development server binds to `127.0.0.1`.

| Command                | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start the local development server                  |
| `npm test`             | Run the protocol, scoring, and session-engine tests |
| `npm run typecheck`    | Check TypeScript types                              |
| `npm run format:check` | Check formatting                                    |
| `npm run build`        | Build the static app into `dist/`                   |
| `npm run check`        | Run formatting, types, tests, and build checks      |
| `npm run preview`      | Serve the built app locally for review              |

Use a current browser with JavaScript, Web Audio, MP3 decoding, native dialogs, `AbortController`, and `crypto.randomUUID()` support. Serve the app over **localhost or HTTPS**, and allow audio playback. Start a session or select **Test audio** to initialize sound; a loading or playback failure prevents a silent session from starting. Headphones are recommended.

## How to play

Each round presents one of eight positions around the center of a 3×3 grid and one of eight spoken letters: C, H, K, L, Q, R, S, or T. Keep the two sequences in memory independently.

In 2-back, for example, the third letter in **C → H → C** matches the first letter. Respond to that audio match even if the position does not match.

| Control                       | Action                                |
| ----------------------------- | ------------------------------------- |
| **A** or **Position** button  | Mark a position match                 |
| **L** or **Audio** button     | Mark an audio match                   |
| Both response keys or buttons | Mark a match in both channels         |
| No response                   | Indicate that neither channel matches |
| **Space**                     | Start, pause, or resume a session     |
| **Esc**                       | Pause an active session               |

The first N rounds are an unscored warmup. Each channel accepts one response per scored round; held keys do not repeat. The square disappears after 500 ms, but the response window stays open for the full interval, including the last round.

Leaving the tab or losing audio pauses the session. Resuming starts a three-second countdown and replays the interrupted round with fresh responses. Completed results record the number of interruptions. Ending a paused session discards it.

## Settings and protocol

| Setting              | Default   | Available values                    |
| -------------------- | --------- | ----------------------------------- |
| Difficulty           | 2-back    | 1–9                                 |
| Scored rounds        | 20        | 20, 40, or 60, plus N warmup rounds |
| Time between stimuli | 3 seconds | 2, 2.5, 3, 4, or 5 seconds          |
| Audio volume         | 80%       | 1–100%                              |
| Response shortcuts   | A / L     | Two distinct letter keys            |

Every supported session length has exactly **30% matches per channel**, including **10% simultaneous matches**. Non-target stimuli exclude accidental N-back matches. Sessions begin with a three-second countdown, and the center of the grid is a fixation point rather than a target.

## Scoring

Scores use **balanced accuracy**: the average of the hit rate and the correct-rejection rate, expressed as a percentage. The overall score is the average of the position and audio scores.

```text
Channel score = 50 × (hits / targets + correct rejections / non-targets)
Overall score = (position score + audio score) / 2
```

Both never responding and responding on every scored round produce 50%. Warmup rounds are excluded. Expand **Score breakdown** to see hits, misses, false alarms, correct rejections, and interruptions. Compare results at the same difficulty and pace.

## Storage and privacy

Settings and the latest 30 completed results are saved in this browser's `localStorage`. Results do not sync between browsers or devices, and clearing this site's browser data removes them. If storage is unavailable, sessions still work, but settings or results may not persist. Reloading the page does not restore an unfinished session.

The app sends no results to a server. It uses local/system fonts and serves bundled audio and app assets from the same origin. The audio attribution links open external websites only when followed.

## Build and hosting

The project is currently intended for local use. Do not publish or deploy the app unless explicitly requested.

`npm run build` produces a static `dist/` directory; no application server is required. To review that output, run `npm run preview`. If deployment is requested, a static host can serve the contents of `dist/` over HTTPS, either at the domain root or under a subdirectory. Asset URLs use Vite's relative base configuration. The GitHub Actions workflow runs validation only; it does not deploy the app.

## Audio credits

Spoken letters are adapted from recordings by **tim.kahn / Freesound**, licensed under **CC BY 4.0**. The bundled MP3s are trimmed and normalized, and decoded before a session begins. The app does not use speech synthesis.

See [the audio credits](public/audio/CREDITS.md) for the license, original recordings, and modification details.

## License

The application code is available under the [MIT License](LICENSE). The spoken letter recordings are separately licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); keep their attribution and modification notices when redistributing them.
