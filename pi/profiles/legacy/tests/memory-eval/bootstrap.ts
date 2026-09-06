import type { Stratum, TaskResult } from './score';

export interface ConfidenceInterval {
  mean: number;
  ci_lower: number;
  ci_upper: number;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

export function bootstrapSuccess(results: readonly TaskResult[], iterations = 1000, seed = 0): ConfidenceInterval {
  if (results.length === 0) return { mean: 0, ci_lower: 0, ci_upper: 0 };
  const random = lcg(seed);
  const rates: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let successes = 0;
    for (let j = 0; j < results.length; j += 1) {
      const pick = results[Math.floor(random() * results.length)];
      if (pick?.success) successes += 1;
    }
    rates.push(successes / results.length);
  }
  const mean = results.filter((r) => r.success).length / results.length;
  return { mean, ci_lower: quantile(rates, 0.025), ci_upper: quantile(rates, 0.975) };
}

export function pairedDifferenceBootstrap(
  baseline: readonly TaskResult[],
  candidate: readonly TaskResult[],
  iterations = 1000,
  seed = 0,
): ConfidenceInterval {
  const byId = new Map(candidate.map((r) => [r.id, r]));
  const diffs = baseline.map((b) => (byId.get(b.id)?.success ? 1 : 0) - (b.success ? 1 : 0));
  if (diffs.length === 0) return { mean: 0, ci_lower: 0, ci_upper: 0 };
  const random = lcg(seed);
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let total = 0;
    for (let j = 0; j < diffs.length; j += 1) total += diffs[Math.floor(random() * diffs.length)] ?? 0;
    samples.push(total / diffs.length);
  }
  return { mean: diffs.reduce((a, b) => a + b, 0) / diffs.length, ci_lower: quantile(samples, 0.025), ci_upper: quantile(samples, 0.975) };
}

export function bootstrapByStratum(results: readonly TaskResult[]) {
  const out: Record<Stratum, ConfidenceInterval> = {
    control: bootstrapSuccess(results.filter((r) => r.stratum === 'control')),
    positive: bootstrapSuccess(results.filter((r) => r.stratum === 'positive')),
    negative: bootstrapSuccess(results.filter((r) => r.stratum === 'negative')),
  };
  return out;
}
