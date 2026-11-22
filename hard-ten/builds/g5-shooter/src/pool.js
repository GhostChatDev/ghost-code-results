// Fixed-size object pool. All objects are made up front; acquire() hands out
// a free one and release() returns it. Nothing is allocated after creation.

export class Pool {
  /**
   * @param {number} size  how many objects to pre-make
   * @param {() => object} make  factory, called `size` times at construction
   */
  constructor(size, make) {
    this.items = new Array(size);
    this.free = new Array(size);
    this.freeCount = size;
    this.active = 0;
    for (let i = 0; i < size; i++) {
      const o = make();
      o.alive = false;
      o._poolIndex = i;
      this.items[i] = o;
      this.free[i] = size - 1 - i;
    }
  }

  get size() {
    return this.items.length;
  }

  /** Returns a free object marked alive, or null when the pool is full. */
  acquire() {
    if (this.freeCount === 0) return null;
    const idx = this.free[--this.freeCount];
    const o = this.items[idx];
    o.alive = true;
    this.active++;
    return o;
  }

  release(o) {
    if (!o.alive) return;
    o.alive = false;
    this.free[this.freeCount++] = o._poolIndex;
    this.active--;
  }

  releaseAll() {
    for (let i = 0; i < this.items.length; i++) this.release(this.items[i]);
  }
}
