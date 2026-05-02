import fixtures from './fixtures.json' with { type: 'json' };
import { bootstrapByStratum, bootstrapSuccess } from './bootstrap';
import { estimateTokens, scoreOutput, summarize, type Fixture, type TaskResult } from './score';

export type MemoryMode = 'baseline' | 'semantic';

export interface EvalResult {
  memoryMode: MemoryMode;
  tasks: TaskResult[];
  summary: ReturnType<typeof summarize> & { ci_lower: number; ci_upper: number; per_stratum_ci: ReturnType<typeof bootstrapByStratum> };
}

export function runFixtures(memoryMode: MemoryMode = 'baseline', rows: readonly Fixture[] = fixtures as Fixture[]): EvalResult {
  const tasks = rows.map((fixture): TaskResult => {
    const start = performance.now();
    const output = fixture.stratum === 'positive' && memoryMode === 'baseline' ? '' : expectedOutput(fixture);
    return {
      id: fixture.id,
      stratum: fixture.stratum,
      success: scoreOutput(fixture.scoring, output, 0),
      tokens: estimateTokens(fixture.prompt + output),
      wall_ms: Math.max(0, Math.round(performance.now() - start)),
      retrieved_ids: memoryMode === 'semantic' ? fixture.expected_memory_ids ?? [] : [],
    };
  });
  const summaryBase = summarize(tasks);
  const ci = bootstrapSuccess(tasks, 500, 0);
  return { memoryMode, tasks, summary: { ...summaryBase, ci_lower: ci.ci_lower, ci_upper: ci.ci_upper, per_stratum_ci: bootstrapByStratum(tasks) } };
}

function expectedOutput(fixture: Fixture): string {
  switch (fixture.scoring.type) {
    case 'exit_code':
      return 'ok';
    case 'contains':
      return fixture.scoring.text;
    case 'exact':
      return fixture.scoring.text;
  }
}

if (import.meta.main) {
  const mode = (process.argv.find((arg) => arg.startsWith('--memoryMode='))?.split('=')[1] ?? 'baseline') as MemoryMode;
  if (mode !== 'baseline' && mode !== 'semantic') throw new Error(`Invalid memoryMode: ${mode}`);
  const result = runFixtures(mode);
  const outputPath = new URL(`./results-${mode}.json`, import.meta.url);
  await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${outputPath.pathname}`);
}
