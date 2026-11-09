import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GradeOutputPass } from './gradePass.js';

// Postproceso de la calidad alta (se carga bajo demanda: en media y baja no se descarga).
// Bloom: solo brilla lo que supera 1.0 en HDR (neón y luces de los materiales glow), no las paredes.
// El pase de salida aplica además el etalonaje del modo (grade.js): neutro salvo que un modo lo fije.
const BLOOM = { strength: 0.32, radius: 0.22, threshold: 1 };

export function createComposer(renderer, scene, camera) {
  // MSAA en el render target (el antialias del canvas no se aplica al postproceso). WebGL2.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold));
  composer.addPass(new GradeOutputPass());
  return { composer, renderPass };
}
