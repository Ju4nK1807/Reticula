import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { getGrade } from './grade.js';

// Pase de salida con etalonaje (ver grade.js): mapeo de tonos y sRGB como el OutputPass de three.js,
// más el color del modo, la viñeta y el grano, en el mismo dibujo de pantalla completa.
const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec4 uGrade; // saturación, contraste, viñeta, grano
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uTime;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
float gHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
  #ifdef LINEAR_TONE_MAPPING
    gl_FragColor.rgb = LinearToneMapping(gl_FragColor.rgb);
  #elif defined(REINHARD_TONE_MAPPING)
    gl_FragColor.rgb = ReinhardToneMapping(gl_FragColor.rgb);
  #elif defined(CINEON_TONE_MAPPING)
    gl_FragColor.rgb = CineonToneMapping(gl_FragColor.rgb);
  #elif defined(ACES_FILMIC_TONE_MAPPING)
    gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
  #elif defined(AGX_TONE_MAPPING)
    gl_FragColor.rgb = AgXToneMapping(gl_FragColor.rgb);
  #elif defined(NEUTRAL_TONE_MAPPING)
    gl_FragColor.rgb = NeutralToneMapping(gl_FragColor.rgb);
  #elif defined(CUSTOM_TONE_MAPPING)
    gl_FragColor.rgb = CustomToneMapping(gl_FragColor.rgb);
  #endif
  vec3 c = max(gl_FragColor.rgb, 0.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGrade.x);
  c = 0.18 * pow(c / 0.18, vec3(uGrade.y));
  c = c * uGain + uLift * (1.0 - min(c, 1.0));
  vec2 d = vUv - 0.5;
  c *= mix(1.0, smoothstep(0.95, 0.2, length(d * vec2(1.15, 1.0)) * 1.25), uGrade.z);
  gl_FragColor.rgb = c;
  #ifdef SRGB_TRANSFER
    gl_FragColor = sRGBTransferOETF(gl_FragColor);
  #endif
  gl_FragColor.rgb += (gHash(vUv * 731.0 + fract(uTime * 7.31)) - 0.5) * uGrade.w;
}
`;

export class GradeOutputPass extends OutputPass {
  constructor() {
    super();
    Object.assign(this.uniforms, { uGrade: { value: [1, 1, 0, 0] }, uLift: { value: [0, 0, 0] }, uGain: { value: [1, 1, 1] }, uTime: { value: 0 } });
    this.material.fragmentShader = FRAGMENT;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const g = getGrade();
    this.uniforms.uGrade.value = [g.saturation, g.contrast, g.vignette, g.grain];
    this.uniforms.uLift.value = g.lift;
    this.uniforms.uGain.value = g.gain;
    this.uniforms.uTime.value = (this.uniforms.uTime.value + (deltaTime || 0.016)) % 1000;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
