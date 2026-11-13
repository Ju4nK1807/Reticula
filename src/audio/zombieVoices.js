/*
  Voces de zombi para Sfx.zombieVoice: todo lo que hay que tocar para que suenen distinto.

  f       Hz de las cuerdas vocales (al azar entre los dos). Grave = más grande y pesado.
  dur     s que dura (al azar entre los dos).
  bend    contorno del tono a lo largo de la voz (multiplica f): sube, baja, se quiebra…
  jitter  cuánto tiembla el tono al azar (fracción de f): más = más enfermo.
  sub     volumen del subarmónico (una octava abajo): más = más ronco y monstruoso.
  breath  aire de la garganta (ruido) y su color (breathF, Hz).
  drive   saturación: 1 limpio … 8 garganta destrozada.
  fry     Hz del carraspeo al empezar y al terminar; fryDepth 0 nada … 1 voz cortada en pedazos.
  formants vocales por las que pasa la boca: [F1, F2, F3] en Hz (OO, UH, AA, EH, II).
  q       ancho de cada formante (alto = más "vocal", bajo = más ruido).
  attack  fracción de la duración que tarda en llegar al máximo.
  gain    volumen.
*/
const OO = [320, 800, 2240];
const OH = [450, 830, 2400];
const UH = [600, 1170, 2390];
const AA = [730, 1090, 2440];
const EH = [530, 1840, 2480];
const AE = [900, 1500, 2900]; // grito abierto

export const VOICES = {
  // Caminante: gruñido que sale del pecho y se cierra.
  groan: { f: [62, 88], dur: [1.1, 1.9], bend: [0.9, 1.08, 0.95, 0.78], jitter: 0.05, sub: 0.55, breath: 0.35, breathF: 900, drive: 4, fry: [34, 22], fryDepth: 0.7, formants: [UH, AA, OH, OO], q: [5, 7, 8], attack: 0.25, gain: 0.5 },
  // Caminante: lamento largo, como si intentara hablar.
  moan: { f: [78, 110], dur: [1.8, 2.8], bend: [0.85, 1.05, 1.12, 0.92, 0.7], jitter: 0.04, sub: 0.35, breath: 0.25, breathF: 700, drive: 2.5, fry: [26, 14], fryDepth: 0.5, formants: [OO, OH, AA, UH, OO], q: [6, 8, 9], attack: 0.35, gain: 0.45 },
  // Corredor: chillido agudo y quebrado.
  shriek: { f: [170, 240], dur: [0.7, 1.1], bend: [1.0, 1.45, 1.3, 0.75], jitter: 0.07, sub: 0.25, breath: 0.6, breathF: 2400, drive: 7, fry: [48, 30], fryDepth: 0.45, formants: [EH, AE, AE, UH], q: [4, 5, 6], attack: 0.12, gain: 0.42 },
  // Bruto: rugido grave, enorme.
  brute: { f: [42, 58], dur: [1.6, 2.4], bend: [0.85, 1.15, 1.05, 0.7], jitter: 0.06, sub: 0.9, breath: 0.45, breathF: 600, drive: 6, fry: [24, 14], fryDepth: 0.75, formants: [OH, AA, AA, OO], q: [4, 6, 7], attack: 0.2, gain: 0.62 },
  // Bruto al aparecer: rugido largo de desafío.
  roar: { f: [46, 60], dur: [2.4, 3.0], bend: [0.8, 1.25, 1.2, 1.0, 0.65], jitter: 0.08, sub: 1, breath: 0.6, breathF: 800, drive: 7, fry: [28, 12], fryDepth: 0.6, formants: [UH, AA, AE, AA, OO], q: [3.5, 5, 6], attack: 0.18, gain: 0.75 },
  // Reptante: gorgoteo húmedo y siseo.
  gurgle: { f: [95, 130], dur: [1.0, 1.6], bend: [1.0, 0.9, 1.05, 0.8], jitter: 0.09, sub: 0.4, breath: 0.7, breathF: 3200, drive: 3, fry: [16, 9], fryDepth: 0.95, formants: [OO, UH, OO, OH], q: [6, 7, 8], attack: 0.2, gain: 0.45 },
  // Al morder o golpear: gruñido corto y rabioso.
  snarl: { f: [95, 140], dur: [0.38, 0.55], bend: [0.9, 1.35, 1.1], jitter: 0.08, sub: 0.6, breath: 0.7, breathF: 1800, drive: 8, fry: [40, 30], fryDepth: 0.6, formants: [UH, AE, AA], q: [3, 4, 5], attack: 0.1, gain: 0.6 },
  // Al morir: estertor que se apaga y se ahoga.
  death: { f: [70, 95], dur: [1.0, 1.5], bend: [1.1, 0.9, 0.6, 0.45], jitter: 0.1, sub: 0.5, breath: 0.55, breathF: 1100, drive: 4, fry: [24, 6], fryDepth: 0.9, formants: [AA, UH, OO, OO], q: [5, 6, 7], attack: 0.08, gain: 0.48 },
};
