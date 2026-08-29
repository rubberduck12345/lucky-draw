import { describe, expect, it } from "vitest";
import { createRng, shuffle } from "./rng.ts";

describe("createRng", () => {
  it("같은 seed면 같은 시퀀스를 낸다 (재현성)", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("다른 seed면 다른 시퀀스를 낸다", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("next()는 항상 [0, 1) 범위", () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(n)은 [0, n) 정수를 낸다", () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it("int(n)은 n <= 0 또는 비정수면 예외", () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(-3)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
  });
});

describe("shuffle", () => {
  it("원본을 변경하지 않는다", () => {
    const original = [1, 2, 3, 4, 5];
    const copy = original.slice();
    shuffle(original, createRng(99));
    expect(original).toEqual(copy);
  });

  it("같은 seed면 같은 순열", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    expect(shuffle(items, createRng(3))).toEqual(shuffle(items, createRng(3)));
  });

  it("원소 집합을 보존한다 (분실·중복 없음)", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(items, createRng(555));
    expect(out.slice().sort((x, y) => x - y)).toEqual(items);
  });

  it("길이 0, 1은 그대로", () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle([42], createRng(1))).toEqual([42]);
  });

  it("충분히 섞인다 (항등 순열만 나오지 않음)", () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let differentCount = 0;
    for (let seed = 0; seed < 20; seed++) {
      const out = shuffle(items, createRng(seed));
      if (out.some((v, i) => v !== items[i])) differentCount++;
    }
    expect(differentCount).toBeGreaterThan(15);
  });
});
