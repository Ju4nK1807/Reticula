import * as THREE from 'three';
import { h } from '../../ui/dom.js';
import { POWERUPS } from './zombieData.js';

const MAX_ARROWS = 6;
const THREAT_RANGE = 7; // m: zombis más cerca que esto y fuera de pantalla → flecha
const EDGE = 0.9;
const _v = new THREE.Vector3();
const fmt = (n) => Math.round(n).toLocaleString('es');

/*
  Capa de HUD del modo zombi (dentro de la capa de juego del HUD general: se oculta con él).
  Solo escribe en el DOM cuando cambia un valor.
  - Panel de oleada (número, zombis que quedan, aviso de noche de corredores).
  - Puntos para la armería, con "+N" al ganar.
  - Granadas y potenciadores activos con su cuenta atrás.
  - Cartel central (cuentas, oleada nueva, oleada superada y aviso de la armería).
  - Flechas de amenaza: zombis cerca y fuera de la vista.
*/
export class ZombieHud {
  constructor(hud) {
    const layer = hud.refs.crosshair.parentElement;
    this.waveNum = h('strong', {}, '1');
    this.left = h('span', {}, '');
    this.tag = h('span', { class: 'zh-tag', hidden: true }, 'Noche de corredores');
    this.panel = h('div', { class: 'zh-panel' }, h('div', { class: 'zh-wave' }, h('small', {}, 'Oleada'), this.waveNum), h('div', { class: 'zh-meta' }, this.left, this.tag));

    this.cash = h('strong', {}, '0');
    this.gain = h('span', { class: 'zh-gain' });
    this.cashBox = h('div', { class: 'zh-cash' }, h('small', {}, 'Puntos'), this.cash, this.gain);

    this.grenades = h('span', { class: 'zh-nades' });
    this.powers = h('div', { class: 'zh-powers' });
    this.side = h('div', { class: 'zh-side' }, this.grenades, this.powers);

    this.bTitle = h('div', { class: 'zh-b-title' });
    this.bSub = h('div', { class: 'zh-b-sub' });
    this.banner = h('div', { class: 'zh-banner', hidden: true }, this.bTitle, this.bSub);

    this.arrows = [];
    this.arrowLayer = h('div', { class: 'zh-arrows' });
    for (let i = 0; i < MAX_ARROWS; i++) {
      const el = h('i', { class: 'zh-arrow', hidden: true });
      this.arrowLayer.append(el);
      this.arrows.push(el);
    }
    // Defensa: botellas que quedan en la barra (con su barra de vida).
    this.barCount = h('strong', {}, '');
    this.barFill = h('i');
    this.barBox = h('div', { class: 'zh-barbox', hidden: true }, h('small', {}, 'Barra'), this.barCount, h('div', { class: 'zh-barmeter' }, this.barFill));
    this.root = h('div', { class: 'zh-root' }, this.arrowLayer, this.panel, this.cashBox, this.barBox, this.side, this.banner);
    layer.append(this.root);
    this.cache = new Map();
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    el[prop] = value;
  }

  setVisible(on) {
    this.root.hidden = !on;
  }

  // "+N" que sube junto a los puntos (se reinicia la animación con cada ganancia).
  popGain(n) {
    this.gain.textContent = `+${fmt(n)}`;
    this.gain.classList.remove('show');
    void this.gain.offsetWidth;
    this.gain.classList.add('show');
  }

  banner_(title, sub) {
    const show = !!title;
    this.set('bShow', this.banner, !show, 'hidden');
    if (!show) return;
    this.set('bTitle', this.bTitle, title);
    this.set('bSub', this.bSub, sub ?? '');
  }

  update(game, run, mode) {
    this.set('wave', this.waveNum, String(Math.max(1, run.wave || mode.nextWave)));
    const left = run.remaining;
    const idle = mode.state === 'countdown' ? 'Preparación' : 'Descanso';
    this.set('left', this.left, run.state === 'wave' ? `${left} ${left === 1 ? 'zombi' : 'zombis'}` : idle);
    this.set('tag', this.tag, !(run.state === 'wave' && run.cfg?.runnerNight), 'hidden');
    this.set('cash', this.cash, fmt(run.cash));
    if (run.bar) {
      const left = run.bar.left;
      const total = run.bar.total;
      this.set('barShow', this.barBox, false, 'hidden');
      this.set('barCount', this.barCount, `${left} / ${total} botellas`);
      const k = left / total;
      this.set('barFill', this.barFill, `${Math.round(k * 100)}%`, '__w');
      if (this.barFill.style.width !== `${Math.round(k * 100)}%`) this.barFill.style.width = `${Math.round(k * 100)}%`;
      this.set('barLow', this.barBox, k < 0.35 ? 'zh-barbox low' : 'zh-barbox', 'className');
    }
    this.set('nades', this.grenades, game.touchMode ? `Granadas ×${mode.grenades}` : `Granadas ×${mode.grenades}  ·  G`);

    // Potenciadores activos (con su tiempo).
    const active = Object.entries(run.timers)
      .filter(([, t]) => t > 0)
      .map(([id, t]) => `${id}:${Math.ceil(t)}`)
      .join('|');
    if (this.cache.get('powers') !== active) {
      this.cache.set('powers', active);
      this.powers.replaceChildren(
        ...Object.entries(run.timers)
          .filter(([, t]) => t > 0)
          .map(([id, t]) => h('span', { class: 'zh-power', style: { '--c': POWERUPS[id].color } }, `${POWERUPS[id].name} ${Math.ceil(t)} s`)),
      );
    }

    // Cartel central según el estado del modo.
    if (mode.state === 'countdown') this.banner_('Prepárate', `La horda llega en ${Math.ceil(mode.timer)}`);
    else if (mode.state === 'intermission') {
      const shop = game.touchMode ? 'Toca «Armería»' : 'E: armería';
      this.banner_(`Oleada ${run.wave} superada`, `${shop} · siguiente oleada en ${Math.ceil(mode.timer)} s`);
    } else if (mode.state === 'wave' && mode.waveBannerT > 0) this.banner_(`Oleada ${run.wave}`, run.cfg?.runnerNight ? 'Noche de corredores: vienen rápido' : `${run.cfg?.count ?? ''} zombis`);
    else this.banner_(null);

    this.updateArrows(game, run);
  }

  // Flechas alrededor de la mira hacia los zombis cercanos que no se ven.
  updateArrows(game, run) {
    const cam = game.engine.camera;
    let n = 0;
    for (const z of run.bots) {
      if (n >= MAX_ARROWS || !z.alive) continue;
      const p = z.position;
      const d = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
      if (d > THREAT_RANGE) continue;
      _v.copy(p).setY(p.y + 1).project(cam);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < EDGE && Math.abs(_v.y) < EDGE;
      if (onScreen) continue;
      const angle = game.angleTo(p); // + = a la izquierda
      const el = this.arrows[n++];
      el.hidden = false;
      el.style.transform = `translate(-50%, -50%) rotate(${-angle}rad) translateY(-120px)`;
      el.style.opacity = String(0.45 + 0.55 * (1 - d / THREAT_RANGE));
    }
    for (let i = n; i < MAX_ARROWS; i++) if (!this.arrows[i].hidden) this.arrows[i].hidden = true;
  }

  dispose() {
    this.root.remove();
  }
}
