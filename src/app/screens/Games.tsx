import { countMistakes } from '../../analysis/summary';
import { settingsKey } from '../../analysis/types';
import type { Game } from '../../import/types';
import { formatDate } from '../../ui/format';
import { useAsync, useRunner, useServices } from '../../ui/hooks';
import { href } from '../router';
import { finishedGames } from '../../play/data';
import { endText } from '../../play/coach';

function outcome(g: Game): 'Won' | 'Lost' | 'Drew' {
  if (g.result === '1/2-1/2') return 'Drew';
  return (g.result === '1-0') === (g.userColor === 'white') ? 'Won' : 'Lost';
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function Games() {
  const services = useServices();
  const runner = useRunner(services);
  const data = useAsync(async () => {
    if (!services) return undefined;
    const [games, analyses] = await Promise.all([
      services.repo.allGames(),
      services.repo.allAnalyses(),
    ]);
    const key = settingsKey(services.settings.analysis);
    const byId = new Map(analyses.filter((a) => a.settings === key).map((a) => [a.gameId, a]));
    return games.map((g) => ({ game: g, analysis: byId.get(g.id) }));
    // Reload when a game finishes.
  }, [services, runner?.gamesDone]);

  const practice = useAsync(
    async () => (services ? await finishedGames(services.repo) : []),
    [services],
  );
  return (
    <section class="screen" aria-labelledby="games-title">
      <h1 id="games-title">Your games</h1>
      {practice.status === 'ok' && practice.value.length > 0 && (
        <div class="panel">
          <h2>Practice games</h2>
          <ul class="game-list">
            {practice.value.map((g) => (
              <li key={g.id}>
                <a class="game-row" href={href('practice', g.id)}>
                  <span class="game-row__main">
                    <span class="game-row__title">
                      {g.end
                        ? g.end.kind === 'resigned'
                          ? 'Resigned'
                          : endText(g.end, g.you)
                        : 'Unfinished'}
                    </span>
                    <span class="game-row__meta">
                      {formatDate(g.startedAt)} · you played {g.you} · Skill Level {g.skill}
                    </span>
                  </span>
                  <span class="game-row__status">{g.yourMoves.length} moves</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.status === 'loading' && <p>Loading games…</p>}
      {data.status === 'error' && (
        <p class="error-text" role="alert">
          Could not read stored games: {data.error}
        </p>
      )}
      {data.status === 'ok' && data.value?.length === 0 && (
        <div class="empty">
          <p>No games yet</p>
          <a class="button button--primary" href={href()}>
            Import games
          </a>
        </div>
      )}
      {data.status === 'ok' && data.value && data.value.length > 0 && (
        <ul class="game-list">
          {data.value.map(({ game, analysis }) => {
            const opp = game.userColor === 'white' ? game.black : game.white;
            const c = countMistakes(analysis);
            return (
              <li key={game.id}>
                <a class="game-row" href={href('game', game.id)}>
                  <span class="game-row__main">
                    <span class="game-row__title">
                      {outcome(game)} vs {opp.name}
                      {opp.rating ? ` (${opp.rating})` : ''}
                    </span>
                    <span class="game-row__meta">
                      {formatDate(game.playedAt)} · {game.speed} · {game.userColor} ·{' '}
                      {game.source === 'lichess' ? 'Lichess' : 'Chess.com'}
                    </span>
                  </span>
                  <span class="game-row__status">
                    {analysis?.status === 'done' ? (
                      <>
                        <span class={c.blunder ? 'has-blunders' : undefined}>
                          {plural(c.blunder, 'blunder')}
                        </span>
                        <span>{plural(c.mistake, 'mistake')}</span>
                      </>
                    ) : analysis ? (
                      <span>Analyzing</span>
                    ) : (
                      <span>Not analyzed</span>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
