import { getRating } from '../../drills/data';
import { loadProfile } from '../../profile/data';
import { TAG_INFO } from '../../profile/labels';
import { useAsync, useServices } from '../../ui/hooks';
import { RatingChart } from '../../ui/RatingChart';
import { href } from '../router';
import { moverOf } from '../../analysis/positions';

export function Stats() {
  const services = useServices();
  const data = useAsync(async () => {
    if (!services) return undefined;
    const [profile, rating, reviews] = await Promise.all([
      loadProfile(services.repo, services.settings.analysis),
      getRating(services.repo),
      services.repo.allReviews(),
    ]);
    // Rate per 100 moves in the older and newer half of analyzed games.
    const games = [...profile.analyzed].sort((a, b) => a.game.playedAt - b.game.playedAt);
    const half = Math.floor(games.length / 2);
    const older = new Set(games.slice(0, half).map((g) => g.game.id));
    const moves = (ids: (id: string) => boolean) =>
      games
        .filter((g) => ids(g.game.id))
        .reduce(
          (n, g) => n + g.game.uci.filter((_, p) => moverOf(p) === g.game.userColor).length,
          0,
        );
    const olderMoves = moves((id) => older.has(id));
    const newerMoves = moves((id) => !older.has(id));
    const rows = profile.weaknesses
      .filter((w) => w.ranked)
      .map((w) => {
        const tags = profile.tags.filter((t) => t.tag === w.tag);
        const o = tags.filter((t) => older.has(t.gameId)).length;
        return {
          w,
          older: olderMoves ? (o / olderMoves) * 100 : 0,
          newer: newerMoves ? ((tags.length - o) / newerMoves) * 100 : 0,
        };
      });
    return {
      rating,
      rows,
      half,
      total: games.length,
      solved: reviews.filter((r) => r.reps > 0).length,
    };
  }, [services]);

  if (data.status !== 'ok' || !data.value) return <p class="screen">Loading…</p>;
  const d = data.value;
  const points = d.rating.history.length
    ? [{ at: d.rating.history[0]!.at, rating: 1500 }, ...d.rating.history]
    : [];

  return (
    <section class="screen" aria-labelledby="stats-title">
      <h1 id="stats-title">
        Your progress
        <span class="subtitle num">
          Puzzle rating {d.rating.rating} · {d.solved} drills solved at least once
        </span>
      </h1>

      {points.length > 1 ? (
        <RatingChart points={points} />
      ) : (
        <p class="panel">
          Your puzzle rating starts at 1500 and moves after each drill.{' '}
          <a href={href('train')}>Start practicing</a>
        </p>
      )}

      <div class="panel">
        <h2>Weaknesses over time</h2>
        {d.total < 4 || d.rows.length === 0 ? (
          <p>Trends need at least four analyzed games and a ranked weakness.</p>
        ) : (
          <table class="trend-table num">
            <caption class="hint">
              Times per 100 of your moves, older {d.half} games against newer {d.total - d.half}
            </caption>
            <thead>
              <tr>
                <th scope="col">Pattern</th>
                <th scope="col">Older</th>
                <th scope="col">Newer</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map(({ w, older, newer }) => (
                <tr key={w.tag}>
                  <th scope="row">
                    <a href={href('weakness', w.tag)}>{TAG_INFO[w.tag].label}</a>
                  </th>
                  <td>{older.toFixed(1)}</td>
                  <td>
                    {newer.toFixed(1)}{' '}
                    <span class="hint">
                      {newer < older ? 'fewer' : newer > older ? 'more' : 'same'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
