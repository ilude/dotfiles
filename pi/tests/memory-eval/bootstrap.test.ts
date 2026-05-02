import { describe, expect, it } from 'vitest';
import { bootstrapByStratum, bootstrapSuccess, pairedDifferenceBootstrap } from './bootstrap';
import type { TaskResult } from './score';

const baseline: TaskResult[] = [
  { id: 'c1', stratum: 'control', success: true, tokens: 1, wall_ms: 0 },
  { id: 'p1', stratum: 'positive', success: false, tokens: 1, wall_ms: 0 },
  { id: 'n1', stratum: 'negative', success: true, tokens: 1, wall_ms: 0 },
];
const candidate: TaskResult[] = baseline.map((row) => (row.id === 'p1' ? { ...row, success: true } : row));

describe('memory eval bootstrap', () => {
  it('computes success interval around observed mean', () => expect(bootstrapSuccess(baseline, 50, 0).mean).toBeCloseTo(2 / 3));
  it('is deterministic for fixed seed', () => expect(bootstrapSuccess(baseline, 50, 7)).toEqual(bootstrapSuccess(baseline, 50, 7)));
  it('computes paired lift', () => expect(pairedDifferenceBootstrap(baseline, candidate, 50, 0).mean).toBeCloseTo(1 / 3));
  it('returns all strata', () => expect(Object.keys(bootstrapByStratum(baseline)).sort()).toEqual(['control', 'negative', 'positive']));
});
