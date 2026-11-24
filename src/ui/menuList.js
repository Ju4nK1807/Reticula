import { h } from './dom.js';
import { icon } from './icons.js';

const NEXT_KEYS = new Set(['ArrowDown', 'KeyS']);
const PREV_KEYS = new Set(['ArrowUp', 'KeyW']);
const BACK_KEYS = new Set(['Escape', 'Backspace']);

export function menuList(items, { onBack, onFocus, sfx, initial, enter = null } = {}) {
  const bar = h('span', { class: 'ml-bar', 'aria-hidden': 'true' }, ['tl', 'tr', 'bl', 'br'].map((c) => h('i', { class: c })));
  let active = -1;

  const buttons = items.map((it, i) =>
    h(
      'button',
      {
        class: `ml-item${it.locked ? ' locked' : ''}${it.tone ? ` ${it.tone}` : ''}`,
        type: 'button',
        role: 'menuitem',
        'data-id': it.id,
        'aria-disabled': it.locked ? 'true' : null,
        style: { '--i': i },
        onclick: () => choose(i),
        onpointermove: (e) => e.pointerType === 'mouse' && setActive(i, { instant: false }),
        onfocus: () => setActive(i),
      },
      h('span', { class: 'ml-label' }, it.label),
      h(
        'span',
        { class: 'ml-end' },
        it.badge && h('span', { class: 'ml-badge' }, it.badge),
        it.locked ? h('span', { class: 'ml-lock', html: icon('lock', 14) }) : it.icon && h('span', { class: 'ml-icon', html: icon(it.icon, 16) }),
      ),
    ),
  );
  const el = h('div', { class: `menu-list${enter ? ` enter-${enter}` : ''}`, role: 'menu', 'data-disposable': '' }, bar, buttons);

  function place(instant) {
    const b = buttons[active];
    if (!b) return;
    el.toggleAttribute('data-instant', instant);
    bar.style.height = `${b.offsetHeight}px`;
    bar.style.transform = `translateY(${b.offsetTop}px)`;
    el.classList.add('placed');
  }

  function setActive(i, { instant = true, silent = false } = {}) {
    if (i === active || !buttons[i]) return;
    active = i;
    buttons.forEach((b, j) => b.classList.toggle('active', j === i));
    if (el.isConnected && document.activeElement !== buttons[i]) buttons[i].focus({ preventScroll: true });
    if (el.isConnected) place(instant);
    if (!silent) sfx?.uiMove();
    onFocus?.(items[i], i);
  }

  function choose(i) {
    const it = items[i];
    setActive(i, { silent: true });
    if (it.locked) {
      sfx?.error();
      return;
    }
    if (it.back) sfx?.uiBack();
    else sfx?.uiSelect();
    it.onSelect?.();
  }

  function move(step) {
    const n = buttons.length;
    setActive((((active + step) % n) + n) % n);
  }

  function onKey(e) {
    if (!el.isConnected) return dispose();
    if (e.target?.closest?.('input, select, textarea')) return;
    if (NEXT_KEYS.has(e.code)) move(1);
    else if (PREV_KEYS.has(e.code)) move(-1);
    else if (e.code === 'Enter' || e.code === 'Space') {
      if (buttons.includes(document.activeElement)) return;
      choose(active);
    } else if (BACK_KEYS.has(e.code) && onBack) {
      sfx?.uiBack();
      onBack();
    } else return;
    e.preventDefault();
  }

  active = Math.max(0, items.findIndex((it) => it.id === initial));
  buttons[active].classList.add('active');
  let started = false;
  function start() {
    if (!el.isConnected) return;
    if (!started) {
      started = true;
      if (!el.closest('[inert]')) buttons[active].focus({ preventScroll: true });
    }
    place(true);
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(start) : null;
  function dispose() {
    document.removeEventListener('keydown', onKey);
    ro?.disconnect();
  }

  document.addEventListener('keydown', onKey);
  ro?.observe(el);
  requestAnimationFrame(start);
  el._dispose = dispose;
  el.focusItem = (id) => setActive(Math.max(0, items.findIndex((it) => it.id === id)), { silent: true });
  return el;
}
