import type { Features } from './features';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Plain sentences for feature changes that matter, from the player's side.
 * Every sentence states a counted change; nothing is inferred.
 */
export function describeChanges(before: Features, after: Features): string[] {
  const out: string[] = [];
  const d = (k: keyof Features) => after[k] - before[k];
  if (d('pawnShield') < 0)
    out.push(
      `Your king's pawn shield went from ${plural(before.pawnShield, 'pawn')} to ${after.pawnShield}.`,
    );
  if (d('openFilesNearKing') > 0)
    out.push(
      `${plural(d('openFilesNearKing'), 'more file')} beside your king ${d('openFilesNearKing') === 1 ? 'is' : 'are'} open.`,
    );
  const pressure = (f: Features) => f.kingAttackers - f.kingDefenders;
  if (pressure(after) - pressure(before) >= 2)
    out.push(
      `Around your king: ${plural(after.kingAttackers, 'attacker')} against ${plural(after.kingDefenders, 'defender')}, up from ${before.kingAttackers} against ${before.kingDefenders}.`,
    );
  if (d('isolatedPawns') > 0)
    out.push(`You have ${plural(d('isolatedPawns'), 'new isolated pawn')}.`);
  if (d('doubledPawns') > 0) out.push(`You have ${plural(d('doubledPawns'), 'new doubled pawn')}.`);
  if (d('backwardPawns') > 0)
    out.push(`You have ${plural(d('backwardPawns'), 'new backward pawn')}.`);
  if (d('pawnIslands') > 0)
    out.push(
      `Your pawns split into ${plural(after.pawnIslands, 'island')}, from ${before.pawnIslands}.`,
    );
  if (d('passedPawns') < 0) out.push(`You lost ${plural(-d('passedPawns'), 'passed pawn')}.`);
  if (d('passedPawns') > 0) out.push(`You gained ${plural(d('passedPawns'), 'passed pawn')}.`);
  if (d('mobility') <= -6)
    out.push(
      `Your pieces reach ${-d('mobility')} fewer squares (${after.mobility} from ${before.mobility}).`,
    );
  if (d('mobility') >= 6)
    out.push(
      `Your pieces reach ${d('mobility')} more squares (${after.mobility} from ${before.mobility}).`,
    );
  if (d('bishopPair') < 0) out.push('You gave up the bishop pair.');
  if (d('outposts') > 0) out.push(`You placed ${plural(d('outposts'), 'piece')} on an outpost.`);
  if (d('rooksOnOpenFiles') > 0)
    out.push(
      `${plural(d('rooksOnOpenFiles'), 'rook')} now ${d('rooksOnOpenFiles') === 1 ? 'stands' : 'stand'} on an open file.`,
    );
  if (d('centerControl') <= -2)
    out.push(`You control ${-d('centerControl')} fewer center squares.`);
  if (d('space') <= -2) out.push(`You hold ${-d('space')} fewer safe squares in the enemy half.`);
  return out;
}
