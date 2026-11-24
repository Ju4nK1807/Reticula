export const GRADE_NEUTRAL = Object.freeze({ saturation: 1, contrast: 1, vignette: 0, grain: 0, lift: [0, 0, 0], gain: [1, 1, 1] });

let current = GRADE_NEUTRAL;

export function setGrade(grade) {
  current = grade ? { ...GRADE_NEUTRAL, ...grade } : GRADE_NEUTRAL;
}

export function getGrade() {
  return current;
}
