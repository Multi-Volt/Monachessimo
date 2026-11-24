import { useState } from 'preact/hooks';
import { acceptable } from '../../drills/answers';
import type { Drill, Grade } from '../../drills/types';
import { Board } from '../../ui/Board';
import { formatScore } from '../../ui/format';

/**
 * Plan picker: choose one of the engine's candidate moves (plus the game
 * move), then see how each scored and what it measurably changed.
 */
export function PlanDrill({ drill, onDone }: { drill: Drill; onDone: (g: Grade) => void }) {
  const [picked, setPicked] = useState<string>();
  const choices = drill.choices ?? [];
  const best = choices.reduce(
    (a, b) => (acceptable(b.score, a.score) && !acceptable(a.score, b.score) ? b : a),
    choices[0]!,
  );
  const pick = (uci: string) => {
    if (picked) return;
    setPicked(uci);
    const c = choices.find((x) => x.uci === uci)!;
    onDone(acceptable(c.score, drill.bestScore) ? 'good' : 'fail');
  };
  return (
    <>
      <Board
        fen={drill.fen}
        orientation={drill.side}
        label={`Plan position, ${drill.side} to move`}
      />
      {!picked ? (
        <fieldset class="field plan">
          <legend>Which move would you play?</legend>
          <div class="plan__choices">
            {choices.map((c) => (
              <button
                key={c.uci}
                type="button"
                class="button plan__choice"
                onClick={() => pick(c.uci)}
              >
                {c.san}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <div class="panel" role="status">
          <h2>How each move scored</h2>
          <ul class="plan__results">
            {[...choices]
              .sort((a, b) =>
                acceptable(a.score, b.score) && !acceptable(b.score, a.score) ? -1 : 1,
              )
              .map((c) => (
                <li key={c.uci} class={c.uci === picked ? 'is-picked' : undefined}>
                  <p class="plan__head">
                    <strong>{c.san}</strong> <span class="num">{formatScore(c.score)}</span>
                    {c.uci === picked && <span class="tag">Your choice</span>}
                    {c.played && <span class="tag">Game move</span>}
                    {c.uci === best.uci && <span class="tag">Best</span>}
                  </p>
                  {c.reply && <p class="hint">Engine reply: {c.reply}</p>}
                  {c.changes.length > 0 ? (
                    c.changes.map((t) => <p key={t}>{t}</p>)
                  ) : (
                    <p class="hint">No measured change to king safety, pawns or piece activity.</p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </>
  );
}
