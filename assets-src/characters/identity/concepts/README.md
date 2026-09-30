# Alpha 3 Mercenary identity-art provenance

These untouched generated boards preserve the identity-art exploration and the
production masters for the ability/passive icon family. They are not the live
large-portrait source; the later runtime portrait cutover is documented below.

## Ability/passive production board — selected

- File: `ability-passive-icons-selected.png`
- SHA-256: `b2a9d5b45a8b456352e31a6d8b569fc09e899da7d0e26f541f98fe382d5d1039`
- Prompt summary: a strict 4×4 sheet containing the eight authored active
  abilities followed by the eight authored passives, with active powers on
  heavy hex/round salvage plates and passives on stitched teal patches. The
  prompt required bold grayscale-distinct silhouettes, cream/teal/brass/cyan
  workshop materials, no text, logos, skulls, crowns, realistic insignia or
  protected medical marks, and readability at 40–56 px.
- Production use: `build-mercenary-identity-concept-atlas.py` crops the selected
  board's passive rows into the editable PXO and runtime atlas. Stable art IDs
  and passive semantics are unchanged.

## Active ability symbol board V2 — selected runtime source

- File: `ability-icons-v2-selected.png`
- SHA-256: `1d6f426033693d8dad0535b0a7f9aaafd1116d89d5f899750f42abd4d327f6a3`
- Prompt summary: the prior active-ability row and the approved Mercenary
  material board were supplied as references. The generation requested the
  exact eight active abilities in a strict 4×2 order, broad native-pixel
  clusters, near-black outlines, one dominant semantic symbol occupying about
  78% of each cell, transparent gutters, and explicitly no surrounding badge,
  plate, frame, rivets, text, glow, gradients or painterly micro-detail.
- Selection rationale: the original heavy plates became a badge nested inside
  the HUD's own button frame, leaving the meaningful symbol too small. V2 lets
  the ability symbol own the available pixels while existing UI chrome owns
  focus, readiness and cooldown state.
- Production use: the deterministic atlas builder uses V2 for the first eight
  active frames and retains the selected original board for the eight passive
  frames.

## Direction B — selected

- File: `direction-b-selected.png`
- SHA-256: `b76aaeb6813d89be6b1dff95c33fd5ce59f5b6f56771774c96c696124eaf57a3`
- Prompt: "Create DIRECTION B concept board for Meowcenary's eight playable
  mercenaries, used as provenance for later 64px portraits and 32px
  ability/passive icons. It must be genuinely different from warm enamel
  dossier art. Layout exactly 8 square identity tiles in a clean 4-column x
  2-row grid on charcoal. Each tile contains a bold angular bust silhouette
  occupying the left two-thirds and two small separate stencil glyphs stacked
  at right: top ability, bottom passive. NO WORDS, NO LETTERS, NO NUMBERS, NO
  LOGOS, NO WATERMARKS. Style: graphic arcade stencil pixel emblems cut into
  dark gunmetal, extreme negative space, flat cyan/amber/rust/cream shapes,
  asymmetric frame notches, minimal texture, no parchment, no painterly
  rendering; crisp enough for 32px reduction. Tiles in order: Scrap Tabby,
  Bolt Hound, Volt Lynx, Brass Boar, Ember Cougar, Scrap Weasel, Rattle Raptor,
  Piston Ram, each with its authored active and passive identity. Make all
  eight portraits unmistakable in black silhouette and every glyph mutually
  distinct in grayscale. Avoid realistic military insignia, protected medical
  symbols, skulls/crowns, pseudo-text, and resemblance to existing game IP."
- Selection rationale: the flat stencil treatment, strong negative space and
  bounded accents survive reduction better than the painterly alternative.
  The production reconstruction corrects prompt drift: portraits follow the
  actor brief, Scrap Hoarder is a pouch rather than a magnet, and active versus
  passive frames use distinct visual weight.

## Direction A — rejected

- File: `direction-a-rejected.png`
- SHA-256: `3974161a72d1e44311924b93ec6f922a3034274a11763ed70c0bd3fdad4b0929`
- Prompt: "Create DIRECTION A concept board for Meowcenary's eight playable
  mercenaries, used as provenance for later 64px portrait art plus 32px ability
  and passive icons. Layout exactly 8 horizontal identity panels in a clean
  2-column x 4-row grid on neutral dark teal. Each panel contains an expressive
  head-and-shoulders portrait, one large ability glyph, and one smaller passive
  glyph. NO WORDS, NO LETTERS, NO NUMBERS, NO LOGOS, NO WATERMARKS. Original
  characters, playful scrapyard pixel-art design, bold black silhouettes,
  welded salvage materials, cream/rust/teal/gold palette with identity accents,
  readable when reduced, consistent camera and lighting. Direction A: handmade
  enamel mercenary dossier badges, warm expressive faces, chunky outlines,
  slightly asymmetrical salvage construction. Avoid realistic military
  insignia, protected medical symbols, skulls/crowns, pseudo-text, and
  resemblance to existing game IP."
- Rejection rationale: attractive enlarged, but painterly material noise and
  incidental glow collapse at the required 24–32px icon size.

## Runtime portrait cutover

The dossier silhouettes above remain the identity-system exploration record,
but are no longer the live Mercenary portraits. Runtime cards now crop the
approved full-character masters for Scrap Tabby, Bolt Hound, Volt Lynx and the
five-character Alpha 3 roster board. `build-mercenary-portrait-atlas.py`
performs the deterministic crop/matte and preserves the stable eight portrait
IDs; ability and passive icons continue to use the selected identity boards.

The exact approved portrait masters are preserved and hash-locked here:

- `docs/art/concepts/epic-13/scrap-tabby-concept.png` —
  `45fd3dbc077917e8afa41ee555f843d090f0fc37c4014d5cffdb13fccff750de`
- `docs/art/concepts/epic-13/bolt-hound-concept.png` —
  `010836b007027a4e885ae63635dc7df0044cc5853eb11304bf637109cafffb64`
- `assets-src/characters/volt-lynx/concepts/volt-lynx-direction-a-selected.png` —
  `ab84b83f729bdce701a50d50751bc04a1081dd3dd6b263127dfba50973aa5701`
- `assets-src/characters/alpha-3-roster-concepts/direction-b-selected.png` —
  `25cdc618848f853e8053d430e3ef0a8e1c26a699245f98e82d6d25e91bbbe729`
