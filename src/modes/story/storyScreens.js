import { h } from '../../ui/dom.js';
import { button } from '../../ui/components.js';
import { clock } from '../../utils/format.js';
import { CHAPTERS, SPEAKERS, isUnlocked, nextChapter } from './storyData.js';
import { speakNumbers, stopVoice } from './StoryHud.js';

const TYPE_SPEED = 42; // caracteres por segundo

// --- Lista de capítulos -------------------------------------------------------------------------

export function storyChaptersScreen({ rec, onPlay, onBack }) {
  const next = nextChapter(rec);
  return h(
    'div',
    { class: 'screen wide st-screen' },
    h(
      'header',
      { class: 'screen-head' },
      h(
        'div',
        {},
        h('div', { class: 'eyebrow' }, 'Historia · 1979 – 1983'),
        h('h2', { class: 'st-logo' }, 'ECO'),
        h('p', { class: 'muted' }, 'Una voz lee números en una radio. Un soldado no recuerda por qué los conoce. Ocho capítulos, de Base Cóndor a la Torre Faro.'),
      ),
      button('← Volver', onBack, { variant: 'ghost' }),
    ),
    rec.finished && h('p', { class: 'st-finished' }, 'Historia completada. Puedes volver a jugar cualquier capítulo.'),
    h(
      'section',
      { class: 'st-chapters' },
      CHAPTERS.map((ch) => {
        const done = rec.completed[ch.id];
        const open = isUnlocked(rec, ch.id);
        const isNext = ch.id === next.id && !rec.finished;
        return h(
          'article',
          { class: `panel st-chapter${open ? '' : ' locked'}${isNext ? ' next' : ''}` },
          h('div', { class: 'st-num' }, String(ch.number).padStart(2, '0')),
          h(
            'div',
            { class: 'st-info' },
            h('h3', {}, open ? ch.title : 'Clasificado'),
            h('div', { class: 'st-meta' }, open ? `${ch.place} · ${ch.date}` : '▮▮▮▮▮▮ ▮▮▮▮ ▮▮▮▮▮'),
            done && h('div', { class: 'st-done' }, `✓ Completado · ${clock(done.time)}${done.accuracy != null ? ` · ${Math.round(done.accuracy * 100)}% precisión` : ''}`),
          ),
          open ? button(done ? 'Rejugar' : isNext ? 'Jugar' : 'Jugar', () => onPlay(ch.id), { variant: isNext ? 'primary' : '' }) : h('span', { class: 'cp-lock' }, 'Termina el anterior'),
        );
      }),
    ),
  );
}

// --- Escena (diálogo entre misiones) -----------------------------------------------------------------

/*
  Escena cinemática: cabecera con lugar y fecha, y las líneas una a una con efecto de máquina de
  escribir. Clic, Espacio o Enter: completa la línea o pasa a la siguiente. «Saltar» termina la escena.
  Al final, el botón principal (`action`) llama a onDone (un clic: sirve para capturar el mouse).
*/
export function storySceneScreen({ eyebrow, title, subtitle, lines, action = 'Continuar', onDone, onSkip, extra = [] }) {
  const log = h('div', { class: 'st-log', 'aria-live': 'polite' });
  const done = button(action, () => onDone(), { variant: 'primary' });
  const skip = button('Saltar escena', () => finishAll(), { variant: 'ghost' });
  const hint = h('div', { class: 'st-hint' }, 'Clic o Espacio para continuar');
  const foot = h('div', { class: 'st-foot' }, hint, skip, ...extra, done);
  done.hidden = true;
  const root = h(
    'div',
    { class: 'screen st-scene', 'data-disposable': true },
    h('div', { class: 'st-scene-head' }, h('div', { class: 'eyebrow' }, eyebrow ?? ''), title && h('h2', {}, title), subtitle && h('p', { class: 'muted' }, subtitle)),
    log,
    foot,
  );

  let i = -1;
  let typing = null; // { el, text, shown }
  let timer = null;
  let last = 0;

  const lineEl = (line) => {
    const sp = SPEAKERS[line.who] ?? SPEAKERS.narrador;
    const text = h('span', { class: 'st-text' });
    const el = h('p', { class: `st-line ${line.who}` }, sp.name && h('b', { style: { color: sp.color } }, sp.name), text);
    log.append(el);
    el.scrollIntoView?.({ block: 'end' });
    return text;
  };

  const tick = (now) => {
    if (!typing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    typing.shown = Math.min(typing.text.length, typing.shown + TYPE_SPEED * dt);
    typing.el.textContent = typing.text.slice(0, Math.floor(typing.shown));
    if (typing.shown >= typing.text.length) typing = null;
    else timer = requestAnimationFrame(tick);
  };

  const finishLine = () => {
    if (!typing) return;
    cancelAnimationFrame(timer);
    typing.el.textContent = typing.text;
    typing = null;
  };

  const advance = () => {
    if (typing) return finishLine();
    if (i >= lines.length - 1) return end();
    i++;
    const line = lines[i];
    const el = lineEl(line);
    if (line.who === 'numeros') speakNumbers(line.text);
    typing = { el, text: line.text, shown: 0 };
    last = performance.now();
    timer = requestAnimationFrame(tick);
  };

  const end = () => {
    finishLine();
    hint.hidden = true;
    skip.hidden = true;
    done.hidden = false;
    done.focus?.();
  };

  const finishAll = () => {
    finishLine();
    while (i < lines.length - 1) {
      i++;
      lineEl(lines[i]).textContent = lines[i].text;
    }
    stopVoice();
    onSkip?.();
    end();
  };

  const onKey = (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (!done.hidden) return; // al final, Enter / Espacio activan el botón con foco
    e.preventDefault();
    advance();
  };
  const onClick = (e) => {
    if (e.target.closest('button')) return;
    if (done.hidden) advance();
  };
  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  root._dispose = () => {
    cancelAnimationFrame(timer);
    window.removeEventListener('keydown', onKey);
    stopVoice();
  };
  if (lines.length) advance();
  else end();
  return root;
}

// --- Caída en combate ------------------------------------------------------------------------------

export function storyFailedScreen({ chapter, onRetry, onChapters }) {
  return h(
    'div',
    { class: 'screen st-scene st-failed' },
    h('div', { class: 'st-scene-head' }, h('div', { class: 'eyebrow' }, `Capítulo ${chapter.number} · ${chapter.title}`), h('h2', {}, 'Señal perdida')),
    h('p', { class: 'st-line voz' }, h('b', { style: { color: SPEAKERS.voz.color } }, SPEAKERS.voz.name), h('span', {}, 'No, capitán. Así no fue como ocurrió. Otra vez.')),
    h('div', { class: 'st-foot' }, button('Capítulos', onChapters, { variant: 'ghost' }), button('Reintentar', onRetry, { variant: 'primary' })),
  );
}
