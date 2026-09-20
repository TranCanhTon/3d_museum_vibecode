/**
 * Tracks keyboard state, right-mouse-drag rotation deltas, and wheel zoom deltas.
 * Consumers should poll `wheelDelta` / `dragDelta` once per frame and call
 * `resetFrameDeltas()` afterwards.
 */
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;
    this.keys = new Set();
    this.wheelDelta = 0;
    this.dragDelta = { x: 0, y: 0 };
    this.isDragging = false;

    this._onKeyDown = (e) => this.keys.add(e.code);
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onWheel = (e) => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    };
    this._onMouseDown = (e) => {
      if (e.button === 2) {
        this.isDragging = true;
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 2) {
        this.isDragging = false;
      }
    };
    this._onMouseMove = (e) => {
      if (this.isDragging) {
        this.dragDelta.x += e.movementX;
        this.dragDelta.y += e.movementY;
      }
    };
    this._onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    domElement.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  isPressed(code) {
    return this.keys.has(code);
  }

  getMoveAxis() {
    let x = 0;
    let z = 0;
    if (this.isPressed('KeyW') || this.isPressed('ArrowUp')) z -= 1;
    if (this.isPressed('KeyS') || this.isPressed('ArrowDown')) z += 1;
    if (this.isPressed('KeyA') || this.isPressed('ArrowLeft')) x -= 1;
    if (this.isPressed('KeyD') || this.isPressed('ArrowRight')) x += 1;
    return { x, z };
  }

  resetFrameDeltas() {
    this.wheelDelta = 0;
    this.dragDelta.x = 0;
    this.dragDelta.y = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
  }
}
