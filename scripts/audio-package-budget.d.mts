import type { Buffer } from 'node:buffer';

export interface AudioWaveInfo {
  readonly channels: number;
  readonly sampleRate: number;
  readonly blockAlign: number;
  readonly frames: number;
  readonly encodedBytes: number;
  readonly durationSeconds: number;
}

export interface AudioPackageBudgetPolicy {
  readonly version: 1;
  readonly targetSampleRateHz: 96000;
  readonly bytesPerFloatSample: 4;
  readonly maxCacheUnionBytes: number;
  readonly maxSfxBytes: number;
  readonly description?: string;
}

export function parsePcm16Wav(buffer: Buffer): AudioWaveInfo;
export function aggregateAudioPackageRows(rows: readonly {
  readonly lifecycle: 'menu-common' | 'run-common';
  readonly kind: 'sfx' | 'music';
  readonly encodedBytes: number;
  readonly decodedBytes: number;
  readonly durationSeconds: number;
}[]): {
  readonly closures: Readonly<Record<string, { keys: number; encodedBytes: number; decodedBytes: number; durationSeconds: number }>>;
  readonly total: { keys: number; encodedBytes: number; decodedBytes: number; durationSeconds: number };
  readonly sfx: { keys: number; encodedBytes: number; decodedBytes: number; durationSeconds: number };
};
export function estimateDecodedBytes(
  info: Pick<AudioWaveInfo, 'frames' | 'sampleRate' | 'channels'>,
  targetSampleRateHz?: number,
  bytesPerFloatSample?: number,
): number;
export function inspectAudioPackage(options?: {
  root?: string;
  catalog?: {
    readonly sfx: readonly { readonly key: string; readonly url: string; readonly lifecycle: string }[];
    readonly music: readonly { readonly key: string; readonly url: string; readonly lifecycle: string }[];
  };
  policy?: AudioPackageBudgetPolicy;
}): {
  readonly policy: Readonly<Record<string, string | number>>;
  readonly closures: Readonly<Record<string, { keys: number; encodedBytes: number; decodedBytes: number; durationSeconds: number }>>;
  readonly sfx: { keys: number; encodedBytes: number; decodedBytes: number; durationSeconds: number };
  readonly total: { keys: number; encodedBytes: number; decodedBytes: number; durationSeconds: number };
  readonly assets: readonly {
    key: string; url: string; lifecycle: string; kind: string; sampleRate: number; channels: number;
    frames: number; durationSeconds: number; encodedBytes: number; decodedBytes: number;
  }[];
};
