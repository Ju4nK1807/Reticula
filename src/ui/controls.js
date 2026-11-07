// Controles de formulario compartidos por las pantallas de configuración y el editor de retícula.
import { h } from './dom.js';

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'f-label' }, label), control, hint && h('span', { class: 'f-hint' }, hint));
}

export function select(options, value, onChange) {
  return h(
    'select',
    { onchange: (e) => onChange(e.target.value) },
    Object.entries(options).map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
  );
}

// Slider con valor visible a la derecha. Devuelve el contenedor; `.sync()` relee el valor.
export function slider(obj, key, { min, max, step = 1, fmt = (v) => v }, onChange) {
  const out = h('output', {}, fmt(obj[key]));
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    value: obj[key],
    oninput: (e) => {
      obj[key] = parseFloat(e.target.value);
      out.textContent = fmt(obj[key]);
      onChange();
    },
  });
  const fill = () => input.style.setProperty('--p', `${((Number(input.value) - min) / (max - min)) * 100}%`);
  input.addEventListener('input', fill);
  fill();
  const wrap = h('div', { class: 'slider' }, input, out);
  wrap.sync = () => {
    input.value = obj[key];
    out.textContent = fmt(obj[key]);
    fill();
  };
  return wrap;
}

export function checkbox(obj, key, onChange) {
  return h('input', {
    type: 'checkbox',
    checked: !!obj[key],
    onchange: (e) => {
      obj[key] = e.target.checked;
      onChange();
    },
  });
}
