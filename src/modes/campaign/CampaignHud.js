import { h } from '../../ui/dom.js';

/*
  Capa de HUD de la campaña (se monta en la capa de juego del HUD general): enemigos restantes y metas
  de estrellas del nivel. Solo toca el DOM cuando cambia un valor.
*/
export class CampaignHud {
  constructor(hud) {
    this.remaining = h('strong', {}, '0');
    this.goals = h('div', { class: 'cg-goals' });
    this.root = h(
      'div',
      { class: 'cg-panel', hidden: true },
      h('div', { class: 'cg-remaining' }, h('small', {}, 'Restantes'), this.remaining),
      this.goals,
    );
    hud.refs.crosshair.parentElement.append(this.root);
    this.last = null;
  }

  setLevel(level) {
    this.goals.replaceChildren(
      ...level.goals.map((g, i) => h('span', {}, h('i', {}, '★'.repeat(i + 1)), ` ${g}`)),
    );
    this.last = null;
  }

  setVisible(visible) {
    this.root.hidden = !visible;
  }

  update(phase) {
    const v = String(phase.remaining);
    if (v === this.last) return;
    this.last = v;
    this.remaining.textContent = v;
  }

  dispose() {
    this.root.remove();
  }
}
