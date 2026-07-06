import { describe, expect, it } from "vitest";

import { Semaphore } from "./semaphore.ts";

describe("Semaphore", () => {
  it("limits concurrent runners", async () => {
    const semaphore = new Semaphore(2);
    let inFlight = 0;
    let maxInFlight = 0;

    const job = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return "done";
    };

    const results = await Promise.all(Array.from({ length: 8 }, () => semaphore.run(job)));
    expect(maxInFlight).toBe(2);
    expect(results).toHaveLength(8);
    expect(new Set(results)).toEqual(new Set(["done"]));
  });

  it("releases the slot when a job throws", async () => {
    const semaphore = new Semaphore(1);
    await expect(semaphore.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(semaphore.run(() => Promise.resolve(42))).resolves.toBe(42);
  });

  it("propagates return values", async () => {
    const semaphore = new Semaphore(3);
    await expect(semaphore.run(() => Promise.resolve("value"))).resolves.toBe("value");
  });
});
