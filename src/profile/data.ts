import { moverOf } from '../analysis/positions';
import { settingsKey, type AnalysisSettings, type GameAnalysis } from '../analysis/types';
import { DETECTOR_VERSION, tagGame, type TagRecord } from '../detectors';
import type { Game } from '../import/types';
import type { Repo } from '../store/repo';
import { buildProfile, type GameMoves, type Weakness } from './profile';

export interface ProfileData {
  games: Game[];
  analyzed: { game: Game; analysis: GameAnalysis }[];
  tags: TagRecord[];
  weaknesses: Weakness[];
}

/** Retags every analyzed game when the detectors changed since the last run. */
export async function retagIfNeeded(repo: Repo, settings: AnalysisSettings): Promise<number> {
  if ((await repo.getMeta<number>('detectorVersion')) === DETECTOR_VERSION) return 0;
  const key = settingsKey(settings);
  const analyses = (await repo.allAnalyses()).filter(
    (a) => a.status === 'done' && a.settings === key,
  );
  let n = 0;
  for (const a of analyses) {
    const game = await repo.getGame(a.gameId);
    if (!game) continue;
    await repo.replaceTags(game.id, tagGame(game, a));
    n++;
  }
  await repo.setMeta('detectorVersion', DETECTOR_VERSION);
  return n;
}

export async function loadProfile(repo: Repo, settings: AnalysisSettings): Promise<ProfileData> {
  const key = settingsKey(settings);
  const [games, analyses, tags] = await Promise.all([
    repo.allGames(),
    repo.allAnalyses(),
    repo.allTags(),
  ]);
  const byId = new Map(games.map((g) => [g.id, g]));
  const analyzed = analyses
    .filter((a) => a.status === 'done' && a.settings === key && byId.has(a.gameId))
    .map((analysis) => ({ game: byId.get(analysis.gameId)!, analysis }));
  const moves: GameMoves[] = analyzed.map(({ game }) => ({
    gameId: game.id,
    playedAt: game.playedAt,
    userMoves: game.uci.filter((_, ply) => moverOf(ply) === game.userColor).length,
  }));
  const ids = new Set(moves.map((m) => m.gameId));
  const current = tags.filter((t) => ids.has(t.gameId) && t.version === DETECTOR_VERSION);
  return { games, analyzed, tags: current, weaknesses: buildProfile(current, moves) };
}
