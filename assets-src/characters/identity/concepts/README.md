# Alpha 3 Mercenary identity-art provenance

These untouched generated boards preserve the identity-art provenance. The
selected board is also the production master for the eight large Mercenary
portraits: `build-mercenary-portrait-atlas.py` deterministically crops its
portrait columns into the editable PXO and runtime atlas without repainting or
regenerating the approved direction.

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
  board into the editable PXO and a 96 px-per-frame runtime atlas. Stable art
  IDs and ability/passive semantics are unchanged.

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
