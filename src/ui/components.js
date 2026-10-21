import { h } from './dom.js';
import { RANKS, rankIndex } from '../config/ranks.js';

export const LOGO_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="32" r="3.5" fill="currentColor"/><path d="M32 4v14M32 46v14M4 32h14M46 32h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;

// Insignia hexagonal; el número de chevrones indica el nivel del rango.
export function rankBadge(rank, size = 72) {
  const color = rank?.color ?? '#5b6676';
  const count = rank ? rankIndex(rank.id) + 1 : 0;
  const spacing = 8;
  const top = 50 - ((count - 1) * spacing) / 2 - 5;
  let chevrons = '';
  for (let i = 0; i < count; i++) {
    const y = top + i * spacing;
    chevrons += `<polyline points="34,${y + 10} 50,${y} 66,${y + 10}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const unknown = rank ? '' : `<text x="50" y="62" text-anchor="middle" font-size="34" font-weight="700" fill="${color}">?</text>`;
  return h('div', {
    class: 'rank-badge',
    style: { width: `${size}px`, height: `${size}px` },
    html: `<svg viewBox="0 0 100 100"><polygon points="50,4 92,27 92,73 50,96 8,73 8,27" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="4"/><polygon points="50,15 82,33 82,67 50,85 18,67 18,33" fill="none" stroke="${color}" stroke-opacity="0.35" stroke-width="2"/>${chevrons}${unknown}</svg>`,
  });
}

export function rankLadder(currentId) {
  return h(
    'ol',
    { class: 'rank-ladder' },
    RANKS.map((r) =>
      h(
        'li',
        { class: r.id === currentId ? 'current' : '', style: { '--rank': r.color } },
        h('span', { class: 'name' }, r.name),
        h('span', { class: 'min' }, `${r.min}+`),
      ),
    ),
  );
}

export function button(label, onClick, { variant = '', disabled = false } = {}) {
  return h('button', { class: `btn ${variant}`, onclick: onClick, disabled }, label);
}
