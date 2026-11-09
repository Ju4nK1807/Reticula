/*
  Etalonaje de color del postproceso (calidad alta): saturación, contraste, negros y luces teñidos,
  viñeta y grano de película. Lo aplica el pase de salida (gradePass.js), sin pases extra. Neutro por
  defecto: cada modo puede fijar el suyo (el modo zombi lo usa para su noche fría) y quitarlo al salir.
*/

export const GRADE_NEUTRAL = Object.freeze({ saturation: 1, contrast: 1, vignette: 0, grain: 0, lift: [0, 0, 0], gain: [1, 1, 1] });

let current = GRADE_NEUTRAL;

/** Fija el etalonaje (null = neutro). */
export function setGrade(grade) {
  current = grade ? { ...GRADE_NEUTRAL, ...grade } : GRADE_NEUTRAL;
}

export function getGrade() {
  return current;
}
