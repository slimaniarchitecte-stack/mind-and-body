// Charts drawn by hand in SVG. No library.
// A chart measures its own width, so text stays the same size on a phone and on a desktop.

import { h, s } from './dom.js';
import { diffDays, addDays, fmtDate } from '../core/dates.js';

// chart((width, height) => svgElement, { height }) -> a div that draws itself and redraws when resized.
export function chart(draw, { height = 200 } = {}) {
  const box = h('div', { class: 'chart', style: { height: `${height}px` } });
  let lastWidth = 0;
  let seen = false;
  let observer = null;
  const render = () => {
    if (!box.isConnected) {
      if (seen) observer?.disconnect();
      return;
    }
    seen = true;
    const width = Math.round(box.clientWidth);
    if (!width || width === lastWidth) return;
    lastWidth = width;
    box.replaceChildren(draw(width, height));
  };
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(render);
    observer.observe(box);
  }
  setTimeout(render, 0);
  return box;
}

function niceStep(span) {
  if (span <= 2) return 0.5;
  if (span <= 5) return 1;
  if (span <= 12) return 2;
  if (span <= 30) return 5;
  if (span <= 60) return 10;
  return Math.ceil(span / 5 / 10) * 10;
}

const trim = (v) => (Math.round(v * 10) / 10).toString();

// A chart over dates.
//   from, to: 'YYYY-MM-DD'
//   dots:  [{ date, v }]                     single measurements
//   lines: [{ data: [{ date, v }], color, dashed, width }]
export function timeChart(width, height, { from, to, dots = [], lines = [], dotColor = 'var(--ink-3)', emptyText = 'No data yet' }) {
  const pad = { l: 34, r: 10, t: 12, b: 24 };
  const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
  const values = [...dots, ...lines.flatMap((l) => l.data)].map((p) => p.v);
  if (!values.length) {
    svg.append(
      s('line', { x1: 0, x2: width, y1: height - pad.b, y2: height - pad.b, stroke: 'var(--line)' }),
      s('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty' }, emptyText),
    );
    return svg;
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const step = niceStep(Math.max(hi - lo, 1));
  lo = Math.floor((lo - step * 0.2) / step) * step;
  hi = Math.ceil((hi + step * 0.2) / step) * step;
  if (hi === lo) hi = lo + step;
  const days = Math.max(1, diffDays(from, to));
  const x = (date) => pad.l + (diffDays(from, date) / days) * (width - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);

  for (let v = lo; v <= hi + 1e-9; v += step) {
    svg.append(
      s('line', { x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 }),
      s('text', { x: pad.l - 8, y: y(v) + 3.5, 'text-anchor': 'end', class: 'chart-label' }, trim(v)),
    );
  }
  const marks = days > 20 ? [from, addDays(from, Math.round(days / 2)), to] : [from, to];
  marks.forEach((d, i) => {
    svg.append(s('text', {
      x: x(d), y: height - 6, class: 'chart-label',
      'text-anchor': i === 0 ? 'start' : i === marks.length - 1 ? 'end' : 'middle',
    }, fmtDate(d, 'day')));
  });

  for (const line of lines) {
    if (line.data.length < 2) continue;
    const path = line.data.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
    svg.append(s('path', {
      d: path, fill: 'none', stroke: line.color ?? 'var(--ink)', 'stroke-width': line.width ?? 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': line.dashed ? '3 5' : null,
    }));
  }
  for (const p of dots) {
    svg.append(s('circle', { cx: x(p.date), cy: y(p.v), r: 2.6, fill: dotColor }));
  }
  return svg;
}

// Vertical bars. bars: [{ label, v, strong }]. goal draws a dashed line at that value.
export function barChart(width, height, { bars, goal, color = 'var(--ink)', unit = '' }) {
  const pad = { l: 30, r: 6, t: 12, b: 24 };
  const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
  const top = Math.max(goal ?? 0, ...bars.map((b) => b.v), 1);
  const step = niceStep(top);
  const hi = Math.ceil(top / step) * step;
  const y = (v) => pad.t + (1 - v / hi) * (height - pad.t - pad.b);
  const slot = (width - pad.l - pad.r) / Math.max(1, bars.length);
  const barWidth = Math.min(34, slot * 0.62);

  for (let v = 0; v <= hi + 1e-9; v += step) {
    svg.append(
      s('line', { x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v), stroke: 'var(--line)' }),
      s('text', { x: pad.l - 8, y: y(v) + 3.5, 'text-anchor': 'end', class: 'chart-label' }, `${trim(v)}${v === hi ? unit : ''}`),
    );
  }
  if (goal != null) {
    svg.append(s('line', { x1: pad.l, x2: width - pad.r, y1: y(goal), y2: y(goal), stroke: 'var(--ink-3)', 'stroke-dasharray': '3 5' }));
  }
  const everyOther = bars.length > 8;
  bars.forEach((b, i) => {
    const cx = pad.l + slot * (i + 0.5);
    svg.append(s('rect', {
      x: cx - barWidth / 2, y: y(b.v), width: barWidth, height: Math.max(0, height - pad.b - y(b.v)),
      fill: color, opacity: b.strong === false ? 0.45 : 1,
    }));
    if (!everyOther || i % 2 === 0 || i === bars.length - 1) {
      svg.append(s('text', { x: cx, y: height - 6, 'text-anchor': 'middle', class: 'chart-label' }, b.label));
    }
  });
  return svg;
}
