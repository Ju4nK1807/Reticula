import * as THREE from 'three';
import { BotSkin, loadSoldier } from '../bots/botSkin.js';

/*
  Soldado de la pantalla de título: el mismo soldado animado de los enemigos, con uniforme neutro,
  apuntando hacia el fondo del campo de tiro (3/4 de espaldas, a la derecha del encuadre), como la
  ilustración de portada de un juego. Solo existe en el menú y solo en el mapa del menú.
*/
const UNIFORM = '#3b4552';
const OFFSET = new THREE.Vector3(0.62, 0, -1.75); // respecto al punto de aparición del jugador: primer plano
const YAW = Math.PI + 0.42; // mira hacia el fondo del campo, un poco a la izquierda

export class MenuShowcase {
  constructor(worldKey = 'range') {
    this.worldKey = worldKey;
    this.root = new THREE.Group();
    this.root.rotation.y = YAW;
    this.root.visible = false;
    this.skin = null;
    this.loading = false;
    this.scene = null;
    this.active = false;
  }

  /** Se llama al cambiar de mapa: el soldado solo aparece en el del menú. */
  attach(scene, spawn, key) {
    this.root.removeFromParent();
    this.scene = scene;
    this.active = key === this.worldKey;
    if (!this.active) return;
    this.root.position.copy(spawn).add(OFFSET);
    scene.add(this.root);
  }

  update(dt, visible) {
    const show = visible && this.active;
    this.root.visible = show && !!this.skin;
    if (!show) return;
    if (!this.skin && !this.loading) {
      this.loading = true;
      loadSoldier(UNIFORM).then((template) => {
        if (!template) return;
        this.skin = new BotSkin(template, UNIFORM);
        this.root.add(this.skin.root);
      });
    }
    this.skin?.update(dt, { lateral: 0, forward: 0, speed: 0, crouch: 0, shotT: 9, dying: false, flash: 0 });
  }
}
