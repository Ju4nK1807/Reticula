// Contenedor de pantallas (menú, ajustes, pausa, resultados) y avisos.
export class UI {
  constructor(el, toastEl) {
    this.el = el;
    this.toastEl = toastEl;
    this.toastTimer = null;
  }

  show(screen) {
    this.el.replaceChildren(screen);
    this.el.classList.add('active');
    this.el.scrollTop = 0;
  }

  hide() {
    this.el.replaceChildren();
    this.el.classList.remove('active');
  }

  toast(message, ms = 3200) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
