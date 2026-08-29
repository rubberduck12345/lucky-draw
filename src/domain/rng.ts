// 결정론적 난수원. 테스트에서 seed를 고정해 회전 결과·셔플을 재현한다.
// NFR-1: 결과는 애니메이션과 독립적으로 결정되며 조작 불가해야 한다.
// 프로덕션에서는 seed 없이 생성해 매번 다른 시퀀스를 쓴다.

export interface Rng {
  // [0, 1) 범위의 부동소수.
  next(): number;
  // [0, n) 범위의 정수. n <= 0이면 예외.
  int(n: number): number;
}

// mulberry32 — 작고 분포가 고른 32비트 PRNG.
export function createRng(seed?: number): Rng {
  let state = (seed ?? (Math.floor(Math.random() * 0xffffffff) >>> 0)) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (n: number): number => {
    if (!Number.isInteger(n) || n <= 0) {
      throw new RangeError(`int(n): n은 양의 정수여야 합니다 (받은 값: ${n})`);
    }
    return Math.floor(next() * n);
  };

  return { next, int };
}

// Fisher–Yates. 원본을 변경하지 않고 새 배열을 반환한다.
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
