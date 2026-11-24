import { useState } from 'preact/hooks';
import { formatDate } from './format';

export interface Point {
  at: number;
  rating: number;
}

/**
 * Puzzle rating over time. One series, so the title names it and there is
 * no legend. Hover or tap shows the value; a table view lists every point.
 */
export function RatingChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number>();
  const [asTable, setAsTable] = useState(false);
  const w = 320;
  const h = 160;
  const pad = { l: 36, r: 8, t: 8, b: 20 };
  const min = Math.floor((Math.min(...points.map((p) => p.rating)) - 20) / 50) * 50;
  const max = Math.ceil((Math.max(...points.map((p) => p.rating)) + 20) / 50) * 50;
  const x = (i: number) =>
    pad.l + (points.length < 2 ? 0 : (i / (points.length - 1)) * (w - pad.l - pad.r));
  const y = (r: number) => pad.t + (1 - (r - min) / (max - min || 1)) * (h - pad.t - pad.b);
  const ticks = [min, Math.round((min + max) / 2 / 10) * 10, max];
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`)
    .join('');

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * w;
    const i = Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const hp = hover !== undefined ? points[hover] : undefined;

  return (
    <figure class="chart">
      <figcaption class="chart__title">Puzzle rating</figcaption>
      {asTable ? (
        <table class="chart__table num">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Rating</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.at}>
                <td>{formatDate(p.at)}</td>
                <td>{p.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div class="chart__plot">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            role="img"
            aria-label={`Puzzle rating from ${points[0]!.rating} to ${points[points.length - 1]!.rating} over ${points.length} drills`}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(undefined)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line class="chart__grid" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
                <text class="chart__axis" x={pad.l - 6} y={y(t) + 4} text-anchor="end">
                  {t}
                </text>
              </g>
            ))}
            <path class="chart__line" d={path} />
            {hp && hover !== undefined && (
              <g>
                <line class="chart__cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} />
                <circle class="chart__dot" cx={x(hover)} cy={y(hp.rating)} r={4} />
              </g>
            )}
          </svg>
          {hp && (
            <p class="chart__tip num" role="status">
              {hp.rating} on {formatDate(hp.at)}
            </p>
          )}
        </div>
      )}
      <button type="button" class="button chart__toggle" onClick={() => setAsTable((t) => !t)}>
        {asTable ? 'Show as chart' : 'Show as table'}
      </button>
    </figure>
  );
}
