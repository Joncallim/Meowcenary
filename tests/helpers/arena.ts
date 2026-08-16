import type { ArenaVisualDefinition } from '../../src/systems/types';

export const TEST_ARENA_VISUAL: ArenaVisualDefinition = Object.freeze({
  floorArtIds: Object.freeze(['world:junkyard-floor:base']),
  boundary: Object.freeze({
    straightArtId: 'world:junkyard-boundary:straight',
    cornerArtId: 'world:junkyard-boundary:corner',
    patchArtId: 'world:junkyard-boundary:patch',
    gateArtId: 'world:junkyard-boundary:gate',
  }),
  decorations: Object.freeze([]),
  obstacleSkins: Object.freeze([]),
});
