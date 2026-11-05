import * as THREE from 'three';
import { World } from '../../scenes/World.js';

const RADIUS = 18; // m hasta la cara interior del muro
const SIDES = 24; // muro poligonal (low-poly)
const HEIGHT = 9;
const PANEL_T = 0.5;
const PAD = 1.2; // el jugador se mueve poco: es una sala de coordinación, no de movimiento
const HORIZON_Y = 1.62; // línea a la altura de los ojos: referencia para la visión periférica

/*
  Cúpula: sala circular oscura y neutra para los ejercicios de coordinación ojo-mano.
  - Sin muros ni coberturas dentro: un objetivo puede aparecer en cualquier parte del campo visual.
  - Muro poligonal de 24 paneles (todos sólidos para balas y línea de visión, así las marcas de
    impacto se ven), costillas verticales y una línea de horizonte a la altura de los ojos como
    referencias espaciales para la periferia.
  - El jugador está en una plataforma central de 2.4 m.
*/
export class DomeMap extends World {
  constructor() {
    super({
      name: 'Cúpula',
      background: '#0e131b',
      fogNear: 60,
      fogFar: 140,
      spawn: new THREE.Vector3(0, 0, 0),
      playerZone: { minX: -PAD, maxX: PAD, minZ: -PAD, maxZ: PAD },
    });

    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#cfd8e6', '#1c2029', 1.55));
    const key = new THREE.DirectionalLight('#ffffff', 0.7);
    key.position.set(0, 20, 6);
    scene.add(key);

    const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    const M = {
      floor: lambert('#1f2530'),
      panel: lambert('#273041'),
      panelAlt: lambert('#232b3a'),
      ceiling: lambert('#141922'),
      pad: lambert('#2c3545'),
      rib: new THREE.MeshBasicMaterial({ color: '#33405a' }),
      accent: new THREE.MeshBasicMaterial({ color: '#00ffa3' }),
      accentDim: new THREE.MeshBasicMaterial({ color: '#0d5a45', side: THREE.DoubleSide }),
    };

    // Piso con anillos de referencia.
    this.ground(90, 90, 0, M.floor);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD + 0.4, PAD + 0.5, 0.06, SIDES), M.pad);
    pad.position.y = 0.03;
    scene.add(pad);
    for (const r of [PAD + 0.45, 7, 12]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.05, SIDES * 2), M.accentDim);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.07;
      scene.add(ring);
    }

    // Muro: paneles alrededor del centro, con su cara interior en RADIUS.
    const width = 2 * RADIUS * Math.tan(Math.PI / SIDES) + 0.02;
    const panelGeo = new THREE.BoxGeometry(width, HEIGHT, PANEL_T);
    const ribGeo = new THREE.BoxGeometry(0.08, HEIGHT, 0.08);
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      const panel = new THREE.Mesh(panelGeo, i % 2 ? M.panelAlt : M.panel);
      panel.position.set(Math.sin(a) * (RADIUS + PANEL_T / 2), HEIGHT / 2, Math.cos(a) * (RADIUS + PANEL_T / 2));
      panel.rotation.y = a;
      scene.add(panel);
      this.solids.push(panel);

      const seam = a + Math.PI / SIDES;
      const rib = new THREE.Mesh(ribGeo, M.rib);
      rib.position.set(Math.sin(seam) * (RADIUS - 0.02), HEIGHT / 2, Math.cos(seam) * (RADIUS - 0.02));
      scene.add(rib);
    }

    // Línea de horizonte (a la altura de los ojos) y borde superior.
    for (const [y, mat] of [
      [HORIZON_Y, M.accentDim],
      [HEIGHT - 0.3, M.accentDim],
    ]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS - 0.04, RADIUS - 0.04, 0.05, SIDES, 1, true), mat);
      band.position.y = y;
      scene.add(band);
    }

    // Techo (sólido: bloquea balas hacia arriba).
    const ceiling = new THREE.Mesh(new THREE.CircleGeometry(RADIUS + 0.8, SIDES), M.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = HEIGHT;
    scene.add(ceiling);
    this.solids.push(ceiling);

    scene.updateMatrixWorld(true);
  }
}
