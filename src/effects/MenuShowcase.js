import * as THREE from 'three';
import { BotSkin, loadSoldier } from '../bots/botSkin.js';
import { loadWeaponProp } from '../scenes/props.js';

/*
  Soldados de la pantalla de título: el mismo soldado animado de los enemigos, con uniforme neutro y
  visor encendido. El mapa del menú dice dónde se para cada uno (world.showcase):
    { hero: { position, yaw, clip, uniform, slung }, extra: { … } }
  - hero: en primer plano, 3/4 de espaldas (como la portada de un juego), con el rifle colgado en
    diagonal a la espalda (se ve de perfil desde la cámara) y las manos libres.
  - extra: al fondo, apuntando hacia el campo de tiro con la pistola.
  Solo existen en el menú y solo en mapas que los definen.
*/

const VISOR = '#2dffc0';
const VISOR_GLOW = 0.9;

// Rifle a la espalda, en el espacio del soldado (mira hacia +Z; +X es su izquierda): de la culata, sobre
// el hombro derecho, al cañón, junto a la cadera izquierda. De perfil hacia atrás (se ve desde la cámara).
const SLING_DIR = new THREE.Vector3(0.55, -0.835, 0).normalize(); // de la culata a la boca del cañón
const SLING_CENTER = new THREE.Vector3(-0.01, 1.1, -0.095);
const SLING_MODEL_CENTER = new THREE.Vector3(0, -0.1, -0.45); // centro del rifle en su propio espacio

/** Matriz del rifle a la espalda en el espacio del soldado (ejes del modelo: cañón hacia -Z, lomo +Y). */
export function slingMatrix() {
  const z = SLING_DIR.clone().negate();
  const y = new THREE.Vector3(-z.y, z.x, 0).normalize().multiplyScalar(-1); // perpendicular, lomo hacia arriba
  if (y.y < 0) y.negate();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  const offset = SLING_MODEL_CENTER.clone().applyMatrix4(new THREE.Matrix4().extractRotation(m));
  m.setPosition(SLING_CENTER.clone().sub(offset));
  return m;
}

export class MenuShowcase {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;
    this.cast = []; // { key, cfg, holder, skin }
    this.loading = false;
    this.active = false;
    this.config = null;
  }

  /** El soldado de primer plano (para pruebas y para saber si ya cargó). */
  get skin() {
    return this.cast.find((c) => c.key === 'hero')?.skin ?? null;
  }

  /** Se llama al cambiar de mapa: los soldados solo aparecen en mapas con `showcase`. */
  attach(scene, spawn, key, world = null) {
    this.root.removeFromParent();
    this.config = world?.showcase ?? null;
    this.active = !!this.config;
    if (!this.active) return;
    scene.add(this.root);
    for (const [k, cfg] of Object.entries(this.config)) {
      let c = this.cast.find((x) => x.key === k);
      if (!c) {
        c = { key: k, cfg, holder: new THREE.Group(), skin: null };
        this.root.add(c.holder);
        this.cast.push(c);
      }
      c.cfg = cfg;
      c.holder.position.copy(cfg.position);
      c.holder.rotation.y = cfg.yaw;
    }
  }

  load() {
    this.loading = true;
    for (const c of this.cast) {
      loadSoldier(c.cfg.uniform ?? '#3b4552', { parts: true }).then((template) => {
        if (!template || c.skin) return;
        const skin = new BotSkin(template, c.cfg.uniform ?? '#3b4552');
        // Visor encendido (verde azulado), como los acentos del menú.
        for (const m of skin.mats) {
          if (m.name === 'Visor') {
            m.emissive.set(VISOR);
            m.userData.glow = VISOR_GLOW;
          }
        }
        skin.play(c.cfg.clip ?? 'idle', 0);
        skin.mixer.update(0);
        c.skin = skin;
        c.holder.add(skin.root);
        if (c.cfg.slung) this.sling(c, skin);
      });
    }
  }

  // Cuelga el arma a la espalda: se ata al hueso del pecho (respira con él) y la mano queda libre.
  async sling(c, skin) {
    skin.gun?.removeFromParent();
    const chest = skin.bones.Chest;
    const rifle = await loadWeaponProp(c.cfg.slung);
    if (!rifle || !chest || c.skin !== skin) return;
    skin.root.updateMatrixWorld(true);
    const world = new THREE.Matrix4().multiplyMatrices(skin.root.matrixWorld, slingMatrix());
    const local = new THREE.Matrix4().copy(chest.matrixWorld).invert().multiply(world);
    local.decompose(rifle.position, rifle.quaternion, rifle.scale);
    chest.add(rifle);
  }

  update(dt, visible) {
    const show = visible && this.active;
    this.root.visible = show && this.cast.some((c) => c.skin);
    if (!show) return;
    if (!this.loading) this.load();
    for (const c of this.cast) {
      const s = c.skin;
      if (!s) continue;
      s.play(c.cfg.clip ?? 'idle');
      s.mixer.update(dt);
      // El destello de daño de los bots no aplica: el visor brilla fijo.
      for (const m of s.mats) m.emissiveIntensity = m.userData.glow ?? 0;
    }
  }
}
