import { describe, expect, it } from 'vitest';
import { estimateTokens, scoreOutput, summarize, type TaskResult } from './score';

const rows: TaskResult[] = [
  { id: 'c1', stratum: 'control', success: true, tokens: 1, wall_ms: 0 },
  { id: 'p1', stratum: 'positive', success: false, tokens: 1, wall_ms: 0 },
  { id: 'n1', stratum: 'negative', success: true, tokens: 1, wall_ms: 0 },
];

describe('memory eval scoring', () => {
  it('scores exit codes deterministically', () => expect(scoreOutput({ type: 'exit_code', expected: 0 }, '', 0)).toBe(true));
  it('scores contains matches', () => expect(scoreOutput({ type: 'contains', text: 'needle' }, 'hay needle stack')).toBe(true));
  it('rejects missing contains matches', () => expect(scoreOutput({ type: 'contains', text: 'needle' }, 'hay')).toBe(false));
  it('scores exact matches', () => expect(scoreOutput({ type: 'exact', text: 'ok' }, 'ok')).toBe(true));
  it('summarizes aggregate success rate', () => expect(summarize(rows).success_rate).toBeCloseTo(2 / 3));
  it('summarizes per-stratum rates', () => expect(summarize(rows).per_stratum.positive.success_rate).toBe(0));
  it('estimates tokens with char/4 rule', () => expect(estimateTokens('12345')).toBe(2));
});
