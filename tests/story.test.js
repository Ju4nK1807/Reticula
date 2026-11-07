import { describe, expect, it } from 'vitest';
import { CHAPTERS, CHAPTER_KINDS, PROLOGUE, SPEAKERS, completeChapter, emptyStoryRecord, isUnlocked, lineDuration, missionTotal, nextChapter, normalizeStory } from '../src/modes/story/storyData.js';
import { WEAPONS } from '../src/combat/weapons.js';
import { modeSummary } from '../src/ui/menuData.js';

// Funciones puras de las fases y de la voz (los módulos importan Three.js, no el DOM al cargarse).
const { sequenceStep, roundDigits } = await import('../src/modes/story/storyPhases.js');
const { numbersToSpeech } = await import('../src/modes/story/StoryHud.js');

const WORLDS = ['range', 'yard', 'warehouse', 'city', 'arena', 'ruins', 'dome'];
const allLines = (ch) => [...ch.intro, ...ch.outro, ...(ch.radio?.start ?? []), ...(ch.radio?.end ?? []), ...Object.values(ch.radio?.encounters ?? {}).flat(), ...Object.values(ch.radio?.kills ?? {}).flat()];

describe('Historia ECO: datos', () => {
  it('8 capítulos numerados en orden, con ids únicos', () => {
    expect(CHAPTERS).toHaveLength(8);
    CHAPTERS.forEach((c, i) => expect(c.number).toBe(i + 1));
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTERS.length);
  });

  it('cada capítulo usa un mapa conocido, un tipo válido y armas que existen', () => {
    for (const c of CHAPTERS) {
      expect(WORLDS).toContain(c.world);
      expect(CHAPTER_KINDS).toContain(c.kind);
      expect(c.loadout.length).toBeGreaterThan(0);
      for (const w of c.loadout) expect(WEAPONS[w], `${c.id}: ${w}`).toBeTruthy();
      expect(c.objective).toBeTruthy();
      expect(c.intro.length).toBeGreaterThan(0);
      expect(c.outro.length).toBeGreaterThan(0);
    }
  });

  it('las misiones tienen encuentros válidos y la radio apunta a encuentros que existen', () => {
    for (const c of CHAPTERS.filter((x) => x.kind === 'mission')) {
      expect(missionTotal(c)).toBeGreaterThan(0);
      expect(c.difficulty).toBeGreaterThanOrEqual(0);
      expect(c.difficulty).toBeLessThanOrEqual(11);
      for (const e of c.encounters) {
        expect(['flick', 'strafe', 'peek', 'mixed']).toContain(e.type);
        expect(e.concurrent).toBeGreaterThan(0);
      }
      for (const k of Object.keys(c.radio?.encounters ?? {})) expect(Number(k)).toBeLessThan(c.encounters.length);
    }
  });

  it('la dificultad sube a lo largo de la historia', () => {
    const d = CHAPTERS.filter((c) => c.kind === 'mission').map((c) => c.difficulty);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
  });

  it('todas las líneas tienen un personaje conocido y texto', () => {
    for (const l of [...PROLOGUE, ...CHAPTERS.flatMap(allLines)]) {
      expect(SPEAKERS[l.who], l.text).toBeTruthy();
      expect(l.text.length).toBeGreaterThan(0);
    }
  });

  it('las rondas de números son dígitos sin repetir y cada una más larga', () => {
    const c = CHAPTERS.find((x) => x.kind === 'numbers');
    c.rounds.forEach((r, i) => {
      expect(new Set(r).size).toBe(r.length);
      for (const d of r) expect(d >= 0 && d <= 9).toBe(true);
      if (i) expect(r.length).toBeGreaterThan(c.rounds[i - 1].length);
    });
  });

  it('las líneas de radio duran entre 1.8 y 7 s', () => {
    expect(lineDuration({ text: '' })).toBeCloseTo(1.8);
    expect(lineDuration({ text: 'x'.repeat(500) })).toBe(7);
  });
});

describe('Historia ECO: progreso', () => {
  it('solo el primer capítulo está abierto al empezar', () => {
    const rec = emptyStoryRecord();
    expect(isUnlocked(rec, CHAPTERS[0].id)).toBe(true);
    expect(isUnlocked(rec, CHAPTERS[1].id)).toBe(false);
    expect(isUnlocked(rec, 'no-existe')).toBe(false);
    expect(nextChapter(rec).id).toBe(CHAPTERS[0].id);
  });

  it('terminar un capítulo abre el siguiente y guarda el mejor tiempo', () => {
    const rec = emptyStoryRecord();
    expect(completeChapter(rec, CHAPTERS[0].id, { time: 50, kills: 24, accuracy: 0.8 })).toBe(true);
    expect(isUnlocked(rec, CHAPTERS[1].id)).toBe(true);
    expect(nextChapter(rec).id).toBe(CHAPTERS[1].id);
    expect(completeChapter(rec, CHAPTERS[0].id, { time: 40, kills: 24, accuracy: 0.7 })).toBe(false);
    expect(rec.completed[CHAPTERS[0].id]).toMatchObject({ time: 40, accuracy: 0.8, plays: 2 });
    expect(rec.finished).toBe(false);
  });

  it('se marca como terminada al completar los 8', () => {
    const rec = emptyStoryRecord();
    for (const c of CHAPTERS) completeChapter(rec, c.id, { time: 10 });
    expect(rec.finished).toBe(true);
    expect(nextChapter(rec).id).toBe(CHAPTERS.at(-1).id);
  });

  it('normaliza un guardado viejo o vacío', () => {
    expect(normalizeStory(undefined)).toEqual(emptyStoryRecord());
    expect(normalizeStory({ completed: { escuela: { time: 3 } } }).completed.escuela.time).toBe(3);
  });

  it('resumen del menú', () => {
    expect(modeSummary('story', { records: {} }).text).toBe('Sin empezar');
    expect(modeSummary('story', { records: { story: { completed: { escuela: {} } } } }).text).toBe('Capítulo 2');
    expect(modeSummary('story', { records: { story: { finished: true, completed: {} } } }).text).toBe('Completada');
  });
});

describe('Historia ECO: la Cúpula', () => {
  it('sequenceStep avanza con el número correcto y reinicia al fallar', () => {
    const seq = [7, 3, 9];
    expect(sequenceStep(seq, 0, 7)).toEqual({ ok: true, next: 1, done: false });
    expect(sequenceStep(seq, 1, 9)).toEqual({ ok: false, next: 0, done: false });
    expect(sequenceStep(seq, 2, 9)).toEqual({ ok: true, next: 3, done: true });
  });

  it('roundDigits añade señuelos que no están en la secuencia', () => {
    const d = roundDigits([7, 3, 9], 2, () => 0);
    expect(d).toHaveLength(5);
    expect(new Set(d).size).toBe(5);
    expect(d.slice(0, 3)).toEqual([7, 3, 9]);
  });

  it('la voz lee los dígitos en palabras', () => {
    expect(numbersToSpeech('7 · 3 · 9')).toBe('siete. tres. nueve.');
    expect(numbersToSpeech('0 · 0 · 0')).toBe('cero. cero. cero.');
  });
});
