import { summarize, type Trend, type Weakness } from '../../profile/profile';
import { loadProfile } from '../../profile/data';
import { useAsync, useRunner, useServices } from '../../ui/hooks';
import { href } from '../router';
import { Connect } from './Connect';

const TREND_TEXT: Record<Trend, string> = {
  better: 'Less often lately',
  worse: 'More often lately',
  steady: 'About the same lately',
  unknown: 'Too few games for a trend',
};

export function Dashboard() {
  const services = useServices();
  const runner = useRunner(services);
  const data = useAsync(async () => {
    if (!services) return undefined;
    const p = await loadProfile(services.repo, services.settings.analysis);
    const player = await services.repo.getMeta<{ username: string }>('player');
    return { ...p, player };
  }, [services, runner?.gamesDone, runner?.status]);

  if (data.status === 'loading' || !services) return <p class="screen">Loading…</p>;
  if (data.status === 'error')
    return (
      <p class="screen error-text" role="alert">
        Could not read your data: {data.error}
      </p>
    );
  const d = data.value!;
  if (d.games.length === 0) return <Connect />;

  const ranked = d.weaknesses.filter((w) => w.ranked);
  const pending = d.weaknesses.filter((w) => !w.ranked);
  const maxImpact = Math.max(...ranked.map((w) => w.impact), 0.0001);
  const busy = runner && (runner.status === 'running' || runner.status === 'paused');

  return (
    <section class="screen" aria-labelledby="dash-title">
      <h1 id="dash-title">
        Your weaknesses
        <span class="subtitle">
          {d.analyzed.length} of {d.games.length} games analyzed
          {d.player ? ` for ${d.player.username}` : ''}
        </span>
      </h1>

      {busy && (
        <p class="notice">
          Analysis is {runner.status === 'paused' ? 'paused' : 'running'}. The list updates as games
          finish. <a href={href('progress')}>See progress</a>
        </p>
      )}

      {summarize(d.weaknesses, d.analyzed.length).length > 0 && (
        <div class="summary">
          {summarize(d.weaknesses, d.analyzed.length).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      {ranked.length === 0 ? (
        <div class="panel">
          <p>No pattern has come up five times yet. More analyzed games give a clearer picture.</p>
          {d.analyzed.length === 0 && !busy && (
            <a class="button button--primary" href={href('progress')}>
              Analyze your games
            </a>
          )}
        </div>
      ) : (
        <ol class="weakness-list">
          {ranked.map((w, i) => (
            <WeaknessRow key={w.tag} w={w} primary={i === 0} share={w.impact / maxImpact} />
          ))}
        </ol>
      )}

      {pending.length > 0 && (
        <div class="panel">
          <h2>Not enough data yet</h2>
          <p class="hint">These came up fewer than five times. They are not ranked.</p>
          <ul class="plain-list">
            {pending.map((w) => (
              <li key={w.tag}>
                <a href={href('weakness', w.tag)}>{w.label}</a>{' '}
                <span class="hint num">
                  {w.count} {w.count === 1 ? 'position' : 'positions'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p>
        <a class="button" href={href('import')}>
          Import new games
        </a>
      </p>
    </section>
  );
}

function WeaknessRow({ w, primary, share }: { w: Weakness; primary: boolean; share: number }) {
  return (
    <li class="weakness">
      <div class="weakness__head">
        <h2 class="weakness__title">
          <a href={href('weakness', w.tag)}>{w.label}</a>
        </h2>
        <span class="weakness__rate num">{w.per100.toFixed(1)} per 100 moves</span>
      </div>
      <div
        class="weakness__bar"
        role="img"
        aria-label={`Relative cost ${Math.round(share * 100)} out of 100`}
      >
        <span style={{ width: `${Math.max(4, Math.round(share * 100))}%` }} />
      </div>
      <p class="weakness__meta">
        Based on {w.count} positions in {w.games} games. Costs{' '}
        <span class="num">{Math.round(w.avgDrop * 50)}%</span> winning chances on average.{' '}
        {TREND_TEXT[w.trend]}.
      </p>
      <a class={`button${primary ? ' button--primary' : ''}`} href={href('train', w.tag)}>
        Train this
      </a>
    </li>
  );
}
