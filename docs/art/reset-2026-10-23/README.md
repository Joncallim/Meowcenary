# Meowcenary visual reset — 23 October 2026

Status: active Janet-owned art reset; no replacement art accepted or shipped.
Owner request: 22 October 2026, 16:52 UTC, Slack #games-worlds, message 1792687922.020849.
Scope: replace inconsistent legacy visual art and restart its production and validation workflow. This is not an engine, balance, save, audio or platform migration.

## What changed

The old visual payloads are retired on this nonshipping branch. The accompanying retirement manifest records every path, exact blob SHA and recovery commit. Main and the hosted game are unchanged. Git history is preserved; this is not a repository-history purge or disk-space reclamation.

Audio, fonts, gameplay catalogs and stable IDs, source code, tests, and diagnostic/release evidence remain. Historical screenshots and older briefs are evidence, not current visual approval. Old source generators are not authority to reintroduce retired art.

This branch is intentionally incomplete and must not be merged or deployed as a runnable game. Missing assets are a real integration blocker. Do not weaken validators, delete tests, add primitive production fallbacks, or mark missing art as accepted to make the branch green.

## Why reset

The inspected Figma file LHpXaKqFKksfF2uismDws5 mixes shaded character concepts, flat stencil identity portraits and chunky pixel equipment. Identity also drifts: the upright Hound portrait contradicts its long, low quadruped brief; the Raptor portrait reads as a bird soldier rather than the intended feathered raptor. Prior labels such as “selected” or “approved” do not carry acceptance into this reset.

Keep the established game vocabulary and canonical identities, not the inconsistent renderings. Current gameplay data and newer decisions override obsolete inventories. In particular, #232 and the roadmap select eight authored facing directions; the old right-facing-only asset standard is not the new production target.

## Ownership

Janet owns creative direction, concept generation, selection, source preparation, visual critique and acceptance records. Do not launch Codex or a paid specialist for art. Codex has no authority to select, generate, remove or approve replacement artwork under this request. Any later code integration is a separate, explicit handoff of already reviewed assets.

The existing correctness repair remains a separate code checkpoint. An art reset does not discard its save/ownership fixes or authorize an unvalidated release.

## One visual language

- Cute, chunky, deliberately pixel-made salvage-world art, not military realism.
- Shared silhouette language, edge treatment, lighting and material vocabulary across actors, portraits, gear, world, icons and effects.
- Compact flat palettes and clear pixel clusters. No glossy gradients, tiny texture noise, soft anti-aliased sprite edges or blurred high-resolution concepts sold as native sprites.
- Portraits enlarge the same character and equipment truth. No separate stencil costume or anatomy.
- Junkyard: worn steel, patched canvas, rust and restrained cyan power accents. Foundry: ordered machinery, refractory cream and contained copper heat, not a generic lava world.
- Quiet traversable ground; clear collision edges, ramps, bridges and layer transitions. Decoration must not imply nonexistent collision or hazards.
- Threat, reward and interaction cues distinguish by shape and value, not colour alone.
- Preserve original identities and semantic meanings. No copied game designs or roster padding by recolouring.

These are working constraints, not a claim that the new visual result has passed.

## Production order and stop gates

1. Reconcile active logical IDs and the exact current runtime display sizes. Use the existing catalogs and V4 coverage contracts; do not commission retired content or invent new assets merely to fill a list.
2. Prove the same genuinely weapon-free, unequipped Scrap Tabby in eight views. Preserve compact biped anatomy, square head, notched ear, short striped tail and amber/cream identity. Separate base anatomy from removable Helmet/Armour/Gloves/Boots and weapon layers.
3. Obtain the existing owner visual acceptance for Tabby and a different anatomy. Then prove Tabby, Bolt Hound, Brass Boar and Rattle Raptor together before producing the full roster. Do not silently replace that gate with an automated score.
4. Build a small coherent gameplay set with an enemy, gear, pickups and a representative Junkyard floor/obstacle/ramp composition. Compare all families together, at actual phone scale, before bulk production.
5. Produce the remaining families from the accepted standard. Keep one catalog and one source of identity; reuse genuine shared semantics.
6. Integrate only an accepted, complete dependency set and verify the exact candidate. Merge/deployment and final product/device acceptance remain separate gates.

Generated studies are concepts until reviewed. A selected generated source may enter production through the existing V4 deterministic import policy, but it must survive native-pixel, animation, source/export and live-game checks. No ceremonial redraw and no automatic acceptance.

## Source and export contract

Retain editable production sources, untouched selected inputs, provenance and reproducible export/import mapping. Keep stable logical IDs distinct from atlas placement. Repacking never changes gameplay or save IDs.

For the eight-direction actor proof retain the current 48 by 48 native-cell target and per-direction baseline: idle 4, run 6, hurt 2, defeat 4. That is 128 base frames per character, not a pre-rendered outfit combination matrix. Confirm actual runtime sizing before final acceptance; enlarged sheets alone are insufficient.

Feet anchors, anatomy, notched ears, tail and handedness must remain consistent. Counterpart views are authored unless mirroring is explicitly shown to preserve those invariants. Equipment and weapon mounts, occlusion and contact shadows must be appropriate to the direction and frame. No baked circular ground shadow or weapon hidden in the body source.

Do not freeze a new facing/attachment renderer contract from a concept sheet. Continuous movement and authoritative firing remain unchanged.

## Validation workflow

Each family records: exact source/export hashes, logical IDs, dimensions, animation tags/frames, review images, observed failures, disposition and reviewer/date.

A. Structural: ID coverage, resource references, dimensions, alpha, frame/tag counts, stable anchors and deterministic source/export parity. Run the existing art/content validators without lowering their requirements.

B. Visual: inspect actual pixels at native and real display sizes, not only enlarged previews. Check black silhouettes, grayscale, palette/lighting consistency, anatomy, materials, identity, and semantic collision groups. Labels must not rescue indistinguishable icons.

C. Motion/composition: inspect idle/run/hurt/defeat and direction transitions, equipment changes, weapon family/tier, contact shadows and occlusion. Preserve animation phase; verify the eventual facing policy separately from gameplay aim.

D. In-game: test ordinary production composition at 360 by 640, 390 by 844, tablet and desktop, in both quiet and crowded Junkyard/Foundry scenes. Cover resize, touch reachability, UI obstruction, overlapping actors, pickup/threat readability and reduced motion. Screenshots, browser emulation and real devices are distinct evidence.

E. Product: owner visual approval and the existing physical-device, listening and whole-game playtest gates are not implied by structural tests, CI, a merged PR or a generated image.

Use only these honest states: proposed, concept-reviewed, production-prepared, structurally-passed, visually-passed, integrated, deployed, owner-accepted, retired. Record which evidence supports each state; never call the whole family complete from one passing stage.

## Recovery and references

Restore retired paths from b19d25e4fe5ef793a5de06a524a2090e5dcb636a using ordinary Git recovery. The retirement manifest preserves exact previous blob identities. No force push or history rewrite is needed.

References: #167 (whole-game art), #191 (fidelity), #230/#232 (actor composition), #197/#193 (Loadout/Gunsmith), #171 (product acceptance), docs/roadmap.md, docs/art/alpha-3-v4-product-art-delta.md and the active content-authoring templates.
