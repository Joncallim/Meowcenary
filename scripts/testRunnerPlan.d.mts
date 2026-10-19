export declare const ALLOC_FILE: string;
export declare const RUNNER_TESTS: string;
export declare const RUNNER_EXPLICIT_TESTS: string;
export declare const RUNNER_EXECUTABLE_TESTS: string;
export declare const ART_VALIDATOR_NODE_TESTS: string;
export declare const ALLOC_ISOLATION: readonly string[];

export interface TestStage {
  kind: string;
  args: string[];
}

export interface TestStagePlan {
  forwarded: string[];
  positional: string[];
  explicitlySelectsAlloc: boolean;
  stages: TestStage[];
}

export declare function parseForwarded(rawArgs: string[]): string[];
export declare function isExplicitAllocSelection(arg: string, root?: string): boolean;
export declare function buildStagePlan(rawArgs: string[], root?: string): TestStagePlan;
export declare function executeStagePlan(
  plan: TestStagePlan,
  execute: (args: string[], kind: string) => { status: number },
): { status: number };
