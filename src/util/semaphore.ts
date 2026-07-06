/** Minimal FIFO async semaphore. */
export class Semaphore {
  #available: number;
  readonly #waiters: (() => void)[] = [];

  constructor(limit: number) {
    this.#available = limit;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#available > 0) {
      this.#available -= 1;
    } else {
      await new Promise<void>((resolve) => this.#waiters.push(resolve));
    }
    try {
      return await fn();
    } finally {
      const next = this.#waiters.shift();
      if (next) next();
      else this.#available += 1;
    }
  }
}
