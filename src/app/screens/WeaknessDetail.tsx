import { moveLabel } from '../../analysis/positions';
import type { TagName } from '../../detectors';
import { TAG_INFO } from '../../profile/labels';
import { loadProfile } from '../../profile/data';
import { formatDate } from '../../ui/format';
import { useAsync, useServices } from '../../ui/hooks';
import { lessonFor } from '../../learn/weakness';
import { href } from '../router';

export function WeaknessDetail({ tag }: { tag: TagName }) {
  const services = useServices();
  const info = TAG_INFO[tag];
  const data = useAsync(async () => {
    if (!services) return undefined;
    const p = await loadProfile(services.repo, services.settings.analysis);
    const games = new Map(p.games.map((g) => [g.id, g]));
    return p.tags
      .filter((t) => t.tag === tag)
      .sort((a, b) => b.playedAt - a.playedAt || a.ply - b.ply)
      .map((t) => ({ t, game: games.get(t.gameId)! }));
  }, [services, tag]);

  if (!info)
    return (
      <section class="screen">
        <h1>Unknown pattern</h1>
        <a href={href()}>Back to your weaknesses</a>
      </section>
    );

  return (
    <section class="screen" aria-labelledby="weak-title">
      <h1 id="weak-title">
        {info.label}
        <span class="subtitle">Positions where you {info.summary}</span>
      </h1>
      {data.status === 'loading' && <p>Loading…</p>}
      {data.status === 'ok' && data.value?.length === 0 && <p>No positions with this pattern.</p>}
      {data.status === 'ok' && data.value && data.value.length > 0 && (
        <>
          <div class="row">
            {lessonFor(tag) && (
              <a class="button" href={href('learn', lessonFor(tag)!)}>
                Learn the pattern
              </a>
            )}
            <a class="button button--primary" href={href('train', tag)}>
              Train this
            </a>
          </div>
          <ul class="game-list">
            {data.value.map(({ t, game }) => {
              const opp = game.userColor === 'white' ? game.black : game.white;
              return (
                <li key={t.id}>
                  <a class="game-row" href={href('game', game.id, String(t.ply))}>
                    <span class="game-row__main">
                      <span class="game-row__title">
                        {moveLabel(t.ply)} {game.san[t.ply]} vs {opp.name}
                      </span>
                      <span class="game-row__meta">
                        {formatDate(game.playedAt)} · {game.speed}
                      </span>
                    </span>
                    <span class="game-row__status">{t.class}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
