// Clase base de los modos de juego: documenta la interfaz que espera Game y da valores seguros.
// Un modo nuevo la extiende y sobrescribe solo lo que necesita.
//
// Ciclo de vida:
//   Game.startMode(mode) → mode.start()          (mostrar su pantalla de inicio, cargar mapa)
//   cada cuadro (sin pausa) → mode.update(dt)
//   clic izquierdo → mode.onShoot(time)          (time = timeStamp del clic, en ms)
//   mouse capturado → mode.onLock()              (salvo al reanudar una pausa)
//   pérdida de captura con wantsLock() → pausa → mode.onPause()
//   salir o cambiar de modo → mode.dispose()
export class Mode {
  constructor(game) {
    this.game = game;
  }

  start() {}

  update() {}

  // Por defecto dispara el arma (semiautomático); el modo recibe el resultado en weapon.onShot.
  onShoot(time) {
    this.game.weapon.trigger(time);
  }

  onLock() {}

  onPause() {}

  // true mientras el modo necesita el mouse capturado: perder la captura pausa el juego.
  wantsLock() {
    return false;
  }

  weaponEnabled() {
    return false;
  }

  // true en los modos de entrenamiento: el cargador no se vacía y no hay que recargar.
  infiniteAmmo() {
    return false;
  }

  // Mallas que pueden recibir balas (hitboxes de bots y dianas).
  hitMeshes() {
    return [];
  }

  // Cuerpos que bloquean al jugador: [{ x, z, r, y0, h }].
  bodyColliders() {
    return [];
  }

  // Retroceso / "Reiniciar fase" en la pausa.
  restartStage() {}

  dispose() {}
}
