import { h } from '../../ui/dom.js';

// Silueta SVG de cada forma (misma que en 3D), para el indicador de regla del ejercicio de color.
export const SHAPE_ICONS = {
  sphere: '<circle cx="12" cy="12" r="9"/>',
  cube: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/>',
  pyramid: '<polygon points="12,3 21.5,20 2.5,20"/>',
  diamond: '<polygon points="12,2 22,12 12,22 2,12"/>',
};

export function shapeIcon(shape, color, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="fill:${color};stroke:rgba(0,0,0,.55);stroke-width:1.2">${SHAPE_ICONS[shape] ?? SHAPE_ICONS.sphere}</svg>`;
}

/*
  Capa de HUD propia de los ejercicios de coordinación (se monta en la capa de juego del HUD general).
  Cada ejercicio describe qué mostrar con overlay():
    sequence   → "Siguiente: N" y la serie actual
    color      → regla actual (forma + color + nombre); destella al cambiar
    peripheral → aviso para volver la mirada al aro central
    dual       → anillo alrededor de la mira: verde si estás sobre la esfera
  Solo toca el DOM cuando cambia algo.
*/
export class CoordHud {
  constructor(hud) {
    this.panel = h('div', { class: 'ch-panel', hidden: true });
    this.hint = h('div', { class: 'ch-hint', hidden: true });
    this.ring = h('div', { class: 'ch-ring', hidden: true });
    this.root = h('div', { class: 'ch-root' }, this.ring, this.panel, this.hint);
    hud.refs.crosshair.parentElement.append(this.root);
    this.key = null;
    this.ruleId = null;
  }

  clear() {
    this.key = null;
    this.ruleId = null;
    this.panel.hidden = this.hint.hidden = this.ring.hidden = true;
  }

  update(o) {
    if (!o) return this.clear();
    if (o.kind === 'dual') {
      this.ring.hidden = false;
      this.ring.classList.toggle('on', o.on);
    }
    const key = this.keyFor(o);
    if (key === this.key) return;
    this.key = key;
    this.panel.hidden = this.hint.hidden = true;
    if (o.kind === 'sequence') this.showSequence(o);
    else if (o.kind === 'color') this.showColor(o);
    else if (o.kind === 'peripheral') this.showPeripheral(o);
    else if (o.kind === 'dual') this.showDual(o);
  }

  keyFor(o) {
    switch (o.kind) {
      case 'sequence':
        return `s|${o.next}|${o.size}|${o.sets}`;
      case 'color':
        return `c|${o.rule.id}`;
      case 'peripheral':
        return `p|${o.phase === 'fixate' && !o.fixated}`;
      case 'dual':
        return 'd';
      default:
        return null;
    }
  }

  showSequence(o) {
    this.panel.hidden = false;
    this.panel.className = 'ch-panel ch-seq';
    this.panel.replaceChildren(
      h('small', {}, 'Siguiente'),
      h('strong', {}, o.next),
      h('span', {}, `Serie ${o.sets + 1} · ${o.size} dianas`),
    );
  }

  showColor(o) {
    this.panel.hidden = false;
    const changed = this.ruleId !== null && this.ruleId !== o.rule.id;
    this.ruleId = o.rule.id;
    this.panel.className = 'ch-panel ch-rule';
    this.panel.style.setProperty('--rule', o.rule.color);
    this.panel.replaceChildren(
      h('small', {}, 'Dispara solo a'),
      h('div', { class: 'ch-rule-main' }, h('span', { class: 'ch-icon', html: shapeIcon(o.rule.shape, o.rule.color, 30) }), h('strong', {}, `${o.rule.name} · ${o.rule.shapeName}`)),
    );
    if (changed) {
      this.panel.classList.remove('flash');
      void this.panel.offsetWidth;
      this.panel.classList.add('flash');
    }
  }

  showPeripheral(o) {
    if (o.phase === 'fixate' && !o.fixated) {
      this.hint.hidden = false;
      this.hint.textContent = 'Lleva la mira al aro central';
    }
  }

  showDual() {
    this.ring.hidden = false;
  }

  dispose() {
    this.root.remove();
  }
}
