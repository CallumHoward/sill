export interface Position {
  line: number;
  column: number;
}

/** Maps string offsets to 1-based line/column positions. */
export class LineIndex {
  readonly #text: string;
  #lineStarts: number[] | null = null;

  constructor(text: string) {
    this.#text = text;
  }

  positionAt(offset: number): Position {
    const starts = this.#starts();
    const clamped = Math.max(0, Math.min(offset, this.#text.length));
    // Binary search: greatest line start <= offset.
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if ((starts[mid] ?? 0) <= clamped) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: clamped - (starts[lo] ?? 0) + 1 };
  }

  #starts(): number[] {
    if (this.#lineStarts) return this.#lineStarts;
    const starts = [0];
    for (let i = 0; i < this.#text.length; i += 1) {
      if (this.#text[i] === "\n") starts.push(i + 1);
    }
    this.#lineStarts = starts;
    return starts;
  }
}
