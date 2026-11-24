export class Mode {
  constructor(game) {
    this.game = game;
  }

  start() {}

  update() {}

  onShoot(time) {
    this.game.weapon.trigger(time);
  }

  onLock() {}

  onPause() {}

  wantsLock() {
    return false;
  }

  weaponEnabled() {
    return false;
  }

  infiniteAmmo() {
    return false;
  }

  hitMeshes() {
    return [];
  }

  bodyColliders() {
    return [];
  }

  restartStage() {}

  dispose() {}
}
