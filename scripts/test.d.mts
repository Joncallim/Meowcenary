export interface TestRunnerSpawnOptions {
  cwd: string;
  stdio: 'inherit';
  env: Record<string, string | undefined>;
}

export interface TestRunnerSpawnResult {
  status: number | null;
}

export type TestRunnerSpawn = (
  file: string,
  args: string[],
  options: TestRunnerSpawnOptions,
) => TestRunnerSpawnResult;

export function runTestRunner(
  rawArgs?: string[],
  dependencies?: { spawn?: TestRunnerSpawn },
): number;
