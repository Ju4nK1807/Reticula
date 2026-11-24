export class UI {
  constructor(el, toastEl) {
    this.el = el;
    this.toastEl = toastEl;
    this.toastTimer = null;
    this.onBack = null;
    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || !this.el.classList.contains('active')) return;
      if (e.code !== 'Escape' && e.code !== 'Backspace') return;
      if (e.target?.closest?.('input, select, textarea')) return;
      const back = this.el.querySelector('[data-back]');
      if (!back || back.disabled) return;
      e.preventDefault();
      this.onBack?.();
      back.click();
    });
  }

  dispose() {
    for (const node of this.el.querySelectorAll('[data-disposable]')) node._dispose?.();
  }

  show(screen) {
    this.dispose();
    this.el.replaceChildren(screen);
    this.el.classList.add('active');
    this.el.scrollTop = 0;
  }

  hide() {
    this.dispose();
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
