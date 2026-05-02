export type Stratum = 'control' | 'positive' | 'negative';

export type Scoring =
  | { type: 'exit_code'; expected: number }
  | { type: 'contains'; text: string }
  | { type: 'exact'; text: string };

export interface Fixture {
  id: string;
  stratum: Stratum;
  prompt: string;
  scoring: Scoring;
  provenance: 'session' | 'synthetic' | 'history';
  expected_memory_ids?: string[];
  expected_facts?: string[];
}

export interface TaskResult {
  id: string;
  stratum: Stratum;
  success: boolean;
  tokens: number;
  wall_ms: number;
  retrieved_ids?: string[];
}

export function scoreOutput(scoring: Scoring, output: string, exitCode = 0): boolean {
  switch (scoring.type) {
    case 'exit_code':
      return exitCode === scoring.expected;
    case 'contains':
      return output.includes(scoring.text);
    case 'exact':
      return output === scoring.text;
  }
}

export function summarize(results: readonly TaskResult[]) {
  const successRate = results.length === 0 ? 0 : results.filter((r) => r.success).length / results.length;
  const perStratum: Record<Stratum, { count: number; success_rate: number }> = {
    control: { count: 0, success_rate: 0 },
    positive: { count: 0, success_rate: 0 },
    negative: { count: 0, success_rate: 0 },
  };

  for (const stratum of Object.keys(perStratum) as Stratum[]) {
    const slice = results.filter((r) => r.stratum === stratum);
    perStratum[stratum] = {
      count: slice.length,
      success_rate: slice.length === 0 ? 0 : slice.filter((r) => r.success).length / slice.length,
    };
  }

  return { count: results.length, success_rate: successRate, per_stratum: perStratum };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
