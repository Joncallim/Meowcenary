import type { EventBus } from '../engine/eventBus';
import type { System } from '../engine/system';
import type { DpsMeter } from '../gameplay/metrics';
import type { RunOutcome, RunState } from '../gameplay/runState';

export interface PlaytestSummarySystemOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly dpsMeter: DpsMeter;
  /** Epic 18 (D11): scheduled weapon rewards successfully issued, read from
   *  `WeaponRewardSystem`'s read-only diagnostic. Never inferred from
   *  `weapon:acquired` — ordinary loot can also acquire weapons, and an
   *  issued physical reward may remain uncollected. */
  readonly weaponRewardIssuedCount?: () => number;
  readonly logger?: Pick<Console, 'info' | 'table'>;
}

export interface PlaytestSummaryRow {
  readonly seed: number;
  readonly characterId: string;
  readonly arenaId: string;
  readonly outcome: RunOutcome;
  readonly time: string;
  readonly timeMs: number;
  readonly level: number;
  readonly kills: number;
  readonly currency: number;
  readonly avgDps: number;
  readonly upgradesTaken: number;
  /** Epic 18 (D11) additions. */
  readonly offersSeen: number;
  readonly offerOverlapRate: number;
  readonly firstMergeTimeMs: number | undefined;
  readonly totalMerges: number;
  readonly weaponsAcquired: number;
  readonly pickupBlocked: number;
  readonly weaponRewardsIssued: number;
  readonly finalRackSize: number;
  readonly finalRackFamilies: string;
}

interface OfferRecord {
  readonly offerId: number;
  readonly choices: readonly string[];
}

/**
 * Development-only local playtest snapshot (Epic 11 remainder §8; extended
 * per Epic 18 §D11 with build-variety/Golden-Run evidence). Prints exactly
 * once per run on the first terminal event, after ProgressionSystem has
 * banked. Local console output only — no network, PII, or persistence.
 */
export class PlaytestSummarySystem implements System {
  private readonly runState: RunState;
  private readonly dpsMeter: DpsMeter;
  private readonly weaponRewardIssuedCount?: () => number;
  private readonly logger: Pick<Console, 'info' | 'table'>;
  private readonly unsubscribers: Array<() => void>;
  private readonly levelUps: Array<{ readonly level: number; readonly timeMs: number }> = [];
  private readonly offers: OfferRecord[] = [];
  private readonly chosenUpgradeIds: string[] = [];
  private readonly weaponAcquisitions: Array<{
    readonly definitionId: string;
    readonly timeMs: number;
  }> = [];
  private mergeCount = 0;
  private firstMergeTimeMs: number | undefined;
  private pickupBlockedCount = 0;
  private printed = false;
  private destroyed = false;

  constructor(options: PlaytestSummarySystemOptions) {
    this.runState = options.runState;
    this.dpsMeter = options.dpsMeter;
    this.weaponRewardIssuedCount = options.weaponRewardIssuedCount;
    this.logger = options.logger ?? console;
    this.unsubscribers = [
      options.bus.on('run:won', () => this.print('won')),
      options.bus.on('run:lost', () => this.print('lost')),
      options.bus.on('level:up', ({ level }) => {
        this.levelUps.push({ level, timeMs: this.runState.timeMs });
      }),
      options.bus.on('card:offered', ({ offerId, choices }) => {
        this.offers.push({ offerId, choices });
      }),
      options.bus.on('card:chosen', ({ upgradeId }) => {
        this.chosenUpgradeIds.push(upgradeId);
      }),
      options.bus.on('weapon:merged', () => {
        this.mergeCount += 1;
        if (this.firstMergeTimeMs === undefined) {
          this.firstMergeTimeMs = this.runState.timeMs;
        }
      }),
      options.bus.on('weapon:acquired', ({ definitionId }) => {
        this.weaponAcquisitions.push({ definitionId, timeMs: this.runState.timeMs });
      }),
      options.bus.on('weapon:pickup-blocked', () => {
        this.pickupBlockedCount += 1;
      }),
    ];
  }

  update(_dtMs: number): void {}

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  private print(outcome: RunOutcome): void {
    if (this.destroyed || this.printed) {
      return;
    }
    // Guard before logging so a throwing logger cannot cause a second print.
    this.printed = true;

    const { runState, dpsMeter } = this;
    const safeTimeMs = Number.isFinite(runState.timeMs)
      ? Math.max(0, runState.timeMs)
      : 0;
    const elapsedSeconds = Math.max(1, safeTimeMs / 1000);
    const rawAverage = dpsMeter.totalDamage / elapsedSeconds;
    const avgDps = Number.isFinite(rawAverage)
      ? Math.round(rawAverage * 10) / 10
      : 0;
    const upgradesTaken = Object.values(runState.upgradeStacks).reduce(
      (sum, count) => sum + count,
      0,
    );
    const rack = finalRackDistribution(runState.equipped);

    const row: PlaytestSummaryRow = Object.freeze({
      seed: runState.seed,
      characterId: runState.characterId,
      arenaId: runState.arenaId,
      outcome,
      time: formatTime(safeTimeMs),
      timeMs: safeTimeMs,
      level: runState.level,
      kills: runState.kills,
      currency: runState.currency,
      avgDps,
      upgradesTaken,
      offersSeen: this.offers.length,
      offerOverlapRate: consecutiveOfferOverlapRate(this.offers),
      firstMergeTimeMs: this.firstMergeTimeMs,
      totalMerges: this.mergeCount,
      weaponsAcquired: this.weaponAcquisitions.length,
      pickupBlocked: this.pickupBlockedCount,
      weaponRewardsIssued: this.weaponRewardIssuedCount?.() ?? 0,
      finalRackSize: rack.count,
      finalRackFamilies: rack.families,
    });

    this.logger.info('[playtest] run summary');
    this.logger.table([row]);
    if (Object.keys(runState.upgradeStacks).length > 0) {
      this.logger.table(runState.upgradeStacks);
    }

    // Epic 18 (D11) requires *recording* level-up timestamps, offered IDs per
    // offerId, and weapon-acquisition timestamps — not just their counts. The
    // aggregate row answers "did pacing hit its target"; these detail tables
    // are what a tuning session reads to work out why it did not. Each is
    // emitted only when it has rows, mirroring the upgradeStacks table above.
    if (this.levelUps.length > 0) {
      this.logger.table(
        this.levelUps.map((entry) => ({
          level: entry.level,
          at: formatTime(entry.timeMs),
          timeMs: entry.timeMs,
        })),
      );
    }
    if (this.offers.length > 0) {
      this.logger.table(
        this.offers.map((offer, index) => ({
          offerId: offer.offerId,
          offered: offer.choices.join(', '),
          // Offers resolve in emission order, so the nth chosen card belongs
          // to the nth offer; a trailing offer left unresolved by the run
          // ending simply has no chosen entry.
          chosen: this.chosenUpgradeIds[index] ?? '(unresolved)',
        })),
      );
    }
    if (this.weaponAcquisitions.length > 0) {
      this.logger.table(
        this.weaponAcquisitions.map((entry) => ({
          definitionId: entry.definitionId,
          at: formatTime(entry.timeMs),
          timeMs: entry.timeMs,
        })),
      );
    }
  }
}

/** Average, across consecutive offer pairs, of the fraction of the later
 *  offer's choices that also appeared in the immediately prior offer
 *  (Epic 18 §D11: "consecutive-offer overlap rate"). Fewer offers than two
 *  yields 0 — there is nothing to compare. */
function consecutiveOfferOverlapRate(offers: readonly OfferRecord[]): number {
  if (offers.length < 2) {
    return 0;
  }

  let sum = 0;
  let pairs = 0;
  for (let index = 1; index < offers.length; index += 1) {
    const current = offers[index]!.choices;
    if (current.length === 0) {
      continue;
    }
    const previousIds = new Set(offers[index - 1]!.choices);
    const overlap = current.filter((id) => previousIds.has(id)).length;
    sum += overlap / current.length;
    pairs += 1;
  }

  return pairs === 0 ? 0 : Math.round((sum / pairs) * 100) / 100;
}

function finalRackDistribution(
  equipped: RunState['equipped'],
): { readonly count: number; readonly families: string } {
  const byFamily = new Map<string, number>();
  for (const weapon of equipped) {
    byFamily.set(weapon.family, (byFamily.get(weapon.family) ?? 0) + 1);
  }
  const families = Array.from(byFamily.entries())
    .map(([family, count]) => `${family}:${count}`)
    .join(', ');
  return { count: equipped.length, families };
}

function formatTime(timeMs: number): string {
  const safeMs = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
