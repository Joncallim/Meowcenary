# Alpha 3 Art Production Briefs

**Status:** reviewed production plan for Issue #167. Planning only; runtime rules remain authoritative.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Authoring contract:** this document is used with `docs/architecture/content-authoring-templates.md` and `docs/architecture/content-authoring-template-coverage.md`. Future content instantiates the same family templates rather than adding one-off art rules.

This packet inventories the player-facing art required by the current Alpha 3 game and freezes implementation-ready briefs for every current logical asset/family. It extends the existing art standards in `docs/art/`; those standards remain authoritative for export, source, originality and validation mechanics.

If a brief and live gameplay/data disagree, the current repository catalog wins. The brief must be corrected; art production must never invent a replacement content item to make the document internally consistent.

---

# 1. Universal production rules

## 1.1 Visual language

Meowcenary is cute, chunky, readable, improvised and deliberately pixel-made. Use junkyard/workshop vocabulary: rivets, patched canvas, repurposed tins, worn steel, copper, cable, crude gauges, salvage hooks, workshop markings and powered modules.

Avoid:

- military realism;
- generic fantasy UI;
- glossy mobile-game gradients;
- copied genre-game silhouettes;
- realistic ammunition/firearm branding;
- tiny decorative noise that vanishes at runtime scale;
- protected real-world emblems where an original symbol will do.

Near-black `#0a0f14` remains the default silhouette separator. Use compact flat palettes and deliberate clusters. Do not use semitransparent anti-aliased edge pixels, baked lighting cones, baked ground shadows, large soft glows or sub-pixel detail.

## 1.2 Scale and readability

The canonical visual review viewport is **390×844**. Every asset is approved at its actual runtime display size, not only as an enlarged contact-sheet preview.

- Ordinary character/enemy actors: preserve the established 48×48 source contract unless a reviewed mechanic forces a migration.
- Character runtime display target: about 28×28.
- Ordinary enemy runtime display target: about 26×26.
- Bosses: begin at 64×64; use 96×96 only if the silhouette cannot be made readable without clipping. The current 313×313 expanded/generated-image cells are replacement targets, not precedent.
- Small semantic icons: normally 24×24.
- Equipment/Gunsmith item icons: normally 32×32 source, reviewed at 24–32 px display.
- Character portraits: 96×96 static pixel portraits unless final layout proves a smaller source sufficient.
- World tiles keep their authored native dimensions and are reviewed under actual camera/FIT scaling.

Nearest-neighbour is the default for sprites/icons. Current world entries use linear sampling; any migration must be decided from actual in-game evidence rather than changed mechanically.

## 1.3 Actor animation contract

Characters and ordinary enemies retain the stable-anchor actor sheet unless a mechanic explicitly needs an extension:

| Tag | Frames | Intent |
| --- | ---: | --- |
| `idle` | 4 | personality/readiness without body-center drift |
| `run` | 6 | readable locomotion/pursuit |
| `hurt` | 2 | obvious recoil/compression |
| `defeat` | 4 | legible collapse/deactivation |

Right-facing source art is mirrored by the engine. Torso/body mass remains pinned. Motion belongs to limbs, tails, antennae, tools and accents rather than accidental whole-sprite wobble.

Bosses may add mechanic-specific telegraph/phase clips only where runtime consumes them. Art never owns authoritative combat timing.

## 1.4 Production provenance

For every new actor or major family:

1. start from the relevant content-authoring template;
2. write/freeze the brief against current stable IDs;
3. generate/draw 3–5 concept directions where exploration adds value;
4. retain prompts/reference boards as provenance only;
5. record the selected direction and rejection rationale;
6. create/edit the Pixelorama `.pxo` source;
7. mirror accepted pixels into the deterministic builder or reviewed generalized builder;
8. export untrimmed PNG/JSON;
9. run structural/art validation;
10. independently review silhouette, palette, anchor, semantic collision and originality;
11. review in the real game at phone and desktop scale.

Concept-board pixels are never copied directly into a runtime sheet. Builder, `.pxo` and exported runtime art may not silently diverge.

---

# 2. Authoritative current inventory

The reviewed `visual-art.json` baseline has **77 current logical runtime bindings**:

- 8 character actor sheets;
- 10 enemy/boss actor sheets;
- 18 run-upgrade icons;
- 9 weapon rack icons;
- 9 held-weapon images;
- 4 projectile sheets (legacy/default plus three weapon-family projectiles);
- 4 pickup sheets;
- 15 world assets.

Alpha 3 also requires presentation art not yet represented by those original bindings: character portraits, active/passive icons, Gunsmith physical-part and slot art, equipment/set art, achievement badges, stage/chapter/objective art, permanent-progression icons if that UI survives #165, menu/navigation art, reusable UI chrome, stat/action glyphs, settings/HUD/result treatments and the Compendium navigation surface.

Reuse semantic art when the object is genuinely the same. Do not duplicate an XP icon because another screen needs to show XP; do not duplicate weapon art for starting-loadout summaries.

---

# 3. Playable mercenaries — 8 actor sheets + 8 portraits

Every character gets one gameplay actor sheet and one select/Compendium-quality portrait. The portrait magnifies the same design; it does not become a parallel costume.

## 3.1 Scrap Tabby — `scrap-tabby`

**Gameplay read:** balanced resourceful scavenger/generalist.

**Actor:** compact biped; square head; two strong triangular ears with one notch; short striped tail close to body; round tin-lid shoulder guard; small utility belt; teal neckerchief. Amber/cream body with burnt orange and teal identity accents. Shortest/most compact feline silhouette.

**Animation:** sturdy two-step jog; restrained scarf/tail secondary motion; hurt recoils behind shoulder guard; defeat settles into compact seated/slumped shape.

**Portrait:** three-quarter workshop pose; notched ear, tin-lid guard and neckerchief dominate. Friendly confidence, not aggression.

**Must not become:** tall Volt Lynx, muscular Ember Cougar, generic orange mascot.

## 3.2 Bolt Hound — `bolt-hound`

**Gameplay read:** wiry high-speed striker with sustain ability.

**Actor:** long low quadruped runner; one swept-back ear and one short upright ear; angular natural-fur tail; springy legs; lightweight canvas/cable racing harness; cyan foreleg bracer; lime timing light. Steel-blue/pale-cyan base, lime accent, rusty copper hardware.

**Animation:** coiled alert idle; six-frame bound with clear airborne extension; hurt tucks front legs; defeat ends in low skid.

**Portrait:** long muzzle/asymmetric ears remain dominant; harness/bracer visible. No electricity aura.

**Must not become:** upright wolf soldier, Volt Lynx, blue recolour of another character.

## 3.3 Volt Lynx — `volt-lynx`

**Gameplay read:** recon/mobility specialist; precise and restless.

**Actor:** tall narrow upright feline; long limbs; high lynx ear tufts; short angular cheek ruff; compact sensor harness; one small powered hip cell; no broad shoulder armor. Cool violet/navy with sharp cyan sensor accent and pale silver face/ear details.

**Animation:** light toe-first idle; long clean stride with little vertical bounce; hurt folds inward; defeat kneels/slides before settling.

**Portrait:** ear tufts + narrow sensor harness are the read; alert/curious expression.

**Must not become:** generic electric cat, taller Tabby, canine runner.

## 3.4 Brass Boar — `brass-boar`

**Gameplay read:** heavy/tank bruiser; durable and stubborn.

**Actor:** wide low biped boar; wedge snout; two unmistakable tusks; broad aged-brass chest/shoulder plating; short planted legs; thick forearms; leather/canvas straps. Aged brass/ochre, oxblood brown, cream tusks, dark steel.

**Animation:** weight shift rather than bounce; short driving run; hurt rocks the plate; defeat drops to knee then heavy low rest.

**Portrait:** shoulders, tusks and dented brass dominate; unimpressed/calm expression rather than rage.

**Must not become:** Trash Brute with an animal head, Piston Ram, bulky orange Tabby.

## 3.5 Ember Cougar — `ember-cougar`

**Gameplay read:** elemental/damage striker; heat held under control.

**Actor:** sleek muscular upright cougar; low rounded ears; long dark-tipped tail; broader shoulders than Lynx; refractory shoulder mantle; vented copper chest piece. Charcoal outfit with burnt vermilion/copper and pale ember accents. Heat identity comes from vents/materials, not a permanent flame halo.

**Animation:** controlled stalking idle; low athletic run; compressed defensive hurt; defeat vents once then collapses. Heat Vent VFX stays runtime-owned.

**Portrait:** low ears, strong muzzle and copper vent mantle dominate.

**Must not become:** orange Volt Lynx, Junk Rusher, flaming superhero.

## 3.6 Scrap Weasel — `scrap-weasel`

**Gameplay read:** scavenger-engineer; loot and parts specialist.

**Actor:** long narrow upright/stooped weasel; elongated torso; small head; oversized asymmetric salvage satchel; belt magnetic coil; hooked sorting tool; quick short legs. Moss/olive workwear, cream face, rust hardware, small mint/cyan coil accent.

**Animation:** inventory-check fidget idle; fast scurry with satchel counter-swing; hurt protects bag; defeat becomes long low shape without spawning fake loot.

**Portrait:** satchel strap, long body and coil dominate; curious acquisitive expression.

**Must not become:** quadruped Hound, generic thief, Tabby-with-backpack.

## 3.7 Rattle Raptor — `rattle-raptor`

**Gameplay read:** precision/range hunter.

**Actor:** small feathered/mechanical raptor silhouette; pronounced beak/snout; long straight stabilizing tail; digitigrade legs; compact monocular optic; light shoulder harness; no giant rifle baked into body. Bone/cream feather plates, petrol teal, dark forest/navy, one magenta optic cluster.

**Animation:** head-locking idle while tail balances; sharp run; hurt snaps optic-side shoulder back; defeat folds into triangular rest.

**Portrait:** side profile, optic and tail base dominate; observant rather than robotic.

**Must not become:** bird soldier, dinosaur parody, another feline.

## 3.8 Piston Ram — `piston-ram`

**Gameplay read:** overclocked mechanical attack-speed specialist.

**Actor:** horned ram/automaton hybrid; two broad curved horn arcs; box mechanical chest; readable piston forearms; compact hoof-like feet; small pressure gauge. Gunmetal/slate, cobalt powered housing, pale face/gauge, tiny hot-orange redline accent.

**Animation:** hydraulic idle compression; piston-driven run; hurt over-compresses one arm; defeat loses pressure and sinks.

**Portrait:** horns, gauge and box chest dominate; expressive eyes retain character.

**Must not become:** Brass Boar, literal industrial ram vehicle, humanoid mech.

## 3.9 Character silhouette gate

Black-fill at runtime scale must produce these reads:

- Tabby = compact ears;
- Hound = long quadruped;
- Lynx = tall ear-tufted;
- Boar = wide/tusked;
- Cougar = athletic low-eared feline;
- Weasel = long stooped/satchel;
- Raptor = beak + long tail;
- Ram = horn arcs + box chest.

If any pair cannot be named without palette/detail, revise both before production approval.

---

# 4. Active ability icons — 8

One 24×24 family: dark outline, compact workshop-metal badge backing, one dominant symbol, at most one effect accent. Must survive grayscale.

1. **`ability:scrap-burst` — Scrap Burst:** jagged scrap nut with four short impact wedges. Radial force, not flame/explosion.
2. **`ability:giga-chomp` — Giga Chomp:** chunky canine jaw biting repair ration/metal biscuit, one healing spark. Recovery, not damage bite.
3. **`ability:adrenaline` — Adrenaline:** lean paw/leg crossing compact speedometer arc pushed forward. No weapon.
4. **`ability:shield-flicker` — Shield Flicker:** incomplete hex shield blinking through separated bright segments around small protected center.
5. **`ability:heat-vent` — Heat Vent:** vent grille with three short outward heat tongues/waves. Vent is mandatory to distinguish from Scrap Burst.
6. **`ability:scavenge-pulse` — Scavenge Pulse:** salvage coil sending two angular pulse rings toward XP mote and bolt. No horseshoe magnet.
7. **`ability:precision-mark` — Precision Mark:** hostile-head silhouette with diamond weak-point tag and piercing line. No pistol silhouette.
8. **`ability:overclock` — Overclock:** compact gear/piston + redline gauge + two motion ticks. No weapon silhouette.

---

# 5. Passive icons — 8

Use a quieter square/hex passive frame than active abilities.

1. **Scrap Hoarder:** pouch opening toward two scrap fragments; collection/proximity, not magnet.
2. **Quick Tail:** swept canine tail with short speed ticks.
3. **Light Paws:** two narrow lynx paw prints with lifted heel/air gap.
4. **Thick Hide:** three nested hide/plate layers; durability, not active shield.
5. **Ember Aura:** contained ember inside dark vent ring; constant effect, not outward Heat Vent.
6. **Magnet Belly:** belt-mounted coil embracing one bolt; no pulse rings/horseshoe.
7. **Hunter Eye:** angular raptor eye/optic + long range line; no target tag.
8. **Hydraulic Core:** piston pair around rotating core; no overclock redline gauge.

Collision gate: Scrap Magnet / Magnet Belly / Scavenge Pulse and Quick Paws / Quick Tail / Light Paws / Adrenaline must remain distinguishable in black/white.

---

# 6. Weapons — 9 rack icons + 9 held images + 4 projectiles

## 6.1 Shared tier language

Adjacent tiers differ in mass/modules before color:

- T1: one compact core mass;
- T2: core + one visibly protruding functional module;
- T3: heavier front/energy housing with distinctive cutout/chamber.

No stars, Roman numerals or recolours as primary tier cues.

## Scrap Pistol

- **T1:** short square scrap receiver, cream muzzle cap, compact worn grip.
- **T2:** T1 core + visible cyan side cell and slightly longer cap.
- **T3:** broad forward housing + larger chamber cutout; remains shortest family.
- **Held T1–T3:** same silhouettes on 32×20 held canvas with stable grip/hand anchor; growth extends forward.
- **`projectile:pistol`:** compact cyan/cream filed-metal slug with two-frame seam spark.

## Can-Drum SMG

- **T1:** low horizontal receiver + unmistakable round can/drum below center.
- **T2:** larger drum + short rear brace.
- **T3:** heavier front cap + broad horizontal energy strip; drum still visible.
- **Held:** longer than pistol, lower mass than shotgun; stable grip anchor.
- **`projectile:smg`:** narrow teal chevron/spark with tiny mass and brisk two-frame tail.

## Bolt Shotgun

- **T1:** longest family; two parallel barrel masses; wrapped rear grip.
- **T2:** second visible barrel band + thicker chamber.
- **T3:** broad industrial front + warm-orange chamber cutout.
- **Held:** stable rear grip; bands/forward mass own tier progression.
- **`projectile:shotgun`:** warm-orange pellet cluster with one honest centered physics mass.

## Legacy/default Scrap Shot

**`projectile:default`:** neutral compact hex scrap slug with cream nose, cyan seam and dark rear recess. It remains family-neutral and visually distinct from SMG spark/shotgun cluster. Remove only if runtime proves the binding unused and validation is updated deliberately.

---

# 7. Run upgrade cards — exact current 18 icons

Use 24×24 one-object compositions. No letters/numbers. The list below is keyed to the authoritative `upgrades.json` catalog.

1. **`quick-paws` — Quick Paws:** two bold paw prints leaning forward with three speed ticks.
2. **`extra-scrap` — Extra Scrap:** low irregular scrap bundle with tyre/bolt cue and one value glint; never cyan like XP.
3. **`hot-barrel` — Hot Barrel:** short vented barrel section with heat fins/marks; short by design.
4. **`scrap-magnet` — Scrap Magnet:** horseshoe magnet pulling one bolt across a gap; no pulse rings.
5. **`reinforced-coat` — Reinforced Coat:** patched work vest with one square plate and large stitch/rivet clusters.
6. **`fast-learner` — Fast Learner:** XP mote rising through one broad upward chevron; no generic book.
7. **`heavy-rounds` — Heavy Rounds:** oversized broad fictional slug/nut over small weight plate.
8. **`long-barrel` — Long Barrel:** very elongated clean barrel/pipe profile with small sight cap; no heat cue.
9. **`split-shot` — Split Shot:** one centered projectile splitting into two visibly diverging slugs.
10. **`punch-through` — Punch Through:** generic projectile crossing two thin plates in a straight line; no weapon family silhouette.
11. **`glass-cannon` — Glass Cannon:** cracked energy chamber/amplifier on small barrel core; bright center/fracture, no literal wheeled cannon.
12. **`run-and-gun` — Run and Gun:** running paw/boot under small forward muzzle flash; combined movement/fire read.
13. **`pistol-deadeye` — Pistol Deadeye:** Scrap Pistol centered in circular sight ring.
14. **`pistol-needle-rounds` — Pistol Needle Rounds:** Scrap Pistol muzzle paired with one extremely narrow filed-metal needle slug passing through a thin plate. The long thin slug is the primary cue; a small rear reduction notch suggests “more penetration, less mass” without text. **Must not resemble** generic Punch Through (no pistol) or Pistol Deadeye (sight ring, no needle).
15. **`smg-overclock` — SMG Overclock:** can-drum SMG + small side coil/gauge at redline; weapon silhouette separates it from the character ability.
16. **`smg-spray` — SMG Spray:** can-drum SMG + fan of three tiny outgoing rounds.
17. **`shotgun-buckshot` — Shotgun Buckshot:** twin-barrel muzzle + dense compact pellet cluster directly ahead.
18. **`shotgun-breacher` — Shotgun Breacher:** shotgun muzzle/ram breaking one heavy plate at close range.

### Upgrade collision gate

Review in black/white:

- Quick Paws vs Run and Gun;
- Hot Barrel vs Long Barrel;
- Heavy Rounds vs Punch Through vs Pistol Needle Rounds;
- Pistol Deadeye vs Precision Mark;
- SMG Overclock vs character Overclock;
- Scrap Magnet vs Magnet Belly vs Scavenge Pulse.

Any pair requiring label text to distinguish fails.

---

# 8. Gunsmith — exact current 12 parts + 8 slot glyphs + 3 trait emblems

Current part presentation borrows upgrade icons. Final Gunsmith art uses dedicated physical-component icons keyed to the authoritative `gun-parts.json` stable IDs.

## 8.1 Slot glyphs — 8

Neutral schematic glyphs for empty slots/filtering. They must not look like an owned item.

1. **Receiver:** rectangular gun core with front/rear connection tabs.
2. **Barrel:** isolated tube/housing with clear muzzle end.
3. **Optic:** raised lens/sight block on tiny rail.
4. **Stock:** rear shoulder brace with open negative space.
5. **Trigger:** trigger bow + mechanism block, not a whole gun.
6. **Magazine:** detachable can/box feed shape.
7. **Underbarrel:** lower-rail module with top attachment line.
8. **Trait:** socket/core cradle with a central insertion node; clearly a modifier/core slot rather than a physical barrel/receiver.

## 8.2 Exact current part icons — 12

1. **`part:receiver-compact` — Compact Receiver:** short lightweight rectangular core; small cyan side fastener; most negative space of receiver pair.
2. **`part:receiver-heavy` — Heavy Receiver:** taller/wider block with reinforced front lug and two broad plates; visibly heavier without relying on rarity hue.
3. **`part:barrel-standard` — Standard Barrel:** medium straight housing; simple steel/cream muzzle ring.
4. **`part:barrel-long` — Long Barrel:** near-full-width narrow tube + support band near front. Length, not color, owns identity.
5. **`part:optic-red-dot` — Red-Dot Optic:** low single-lens sight with tiny coral/red dot inside dark hood; no text.
6. **`part:stock-padded` — Padded Stock:** triangular/braced rear stock with a thick wrapped/cushioned shoulder pad. The padded end mass differentiates it from the neutral Stock slot glyph.
7. **`part:trigger-hair` — Hair Trigger:** narrow trigger bow + bright spring/pin mechanism; enlarge the mechanism cluster enough to survive 24px review.
8. **`part:magazine-extended` — Extended Magazine:** tall/curved box/can magazine extending well below a small reference feed lip.
9. **`part:underbarrel-grenade` — Grenade Launcher:** short broad secondary tube with round chamber and reinforced mount. EXPLOSIVE identity comes from chamber geometry, not orange paint.
10. **`part:barrel-piercing` — Piercing Barrel:** medium/long hardened barrel with a narrow cream/steel muzzle insert and aligned penetration groove/notch. Distinct from Long Barrel by hardened pointed/insert construction rather than simple length.
11. **`part:trait-fire` — Fire Trait Core:** standalone socketable core/canister in the **trait** slot, with one contained ember/heat coil inside a dark containment ring. It is not an incendiary barrel.
12. **`part:trait-fire-mastered` — Mastered Fire Trait Core:** same trait-core family, but unmistakably T3 through double containment ring, second vent band and larger refined central core. Structural progression, not recolor.

## 8.3 Trait emblems — reusable overlays, not physical parts

1. **FIRE:** contained angular ember/heat coil in a ring; simpler than the physical Fire Trait Core.
2. **PIERCING:** one straight slug crossing one plate with clean exit notch.
3. **EXPLOSIVE:** compact cracked scrap charge with four short blast wedges.

The trait emblems may annotate parts/builds. They never substitute for the 12 physical current part icons.

---

# 9. Equipment — 32 piece icons + 8 set emblems

Every equipment piece gets dedicated art. Slot silhouette answers **what is it?**; set construction answers **which family?**. Palette alone never carries set identity.

## 9.1 Commando — orderly modular handling/fire-control gear

**Emblem:** three aligned squared plates + short handling stripe.

- Helmet: low squared scrap helmet/cap; one side radio/tab; short brow plate.
- Armour: tidy three-plate vest with even rivets and central strap.
- Gloves: compact knuckle plates over close-fitting work gloves.
- Boots: squared ankle boots, reinforced toe cap, straight strap.

Avoid modern military insignia/camo.

## 9.2 Scavenger — asymmetrical pockets/hooks/collection gear

**Emblem:** hooked salvage claw curling around one loose bolt.

- Helmet: patched work cap/hood with offset headlamp and stitched panel.
- Armour: pouch-heavy apron/vest with oversized side pocket and diagonal salvage strap.
- Gloves: mismatched grip gloves; one broad hook/clip.
- Boots: mismatched but coherent strapped boots; one higher cuff.

## 9.3 Demolition — blast plates, impact padding, warning geometry

**Emblem:** squat reinforced charge casing + two impact wedges.

- Helmet: rounded blast shell with thick forehead shock pad and ear blocks.
- Armour: heavy blast bib with central impact plate and padded lower flap.
- Gloves: thick gauntlets with broad shock pads.
- Boots: wide shock soles with thick heel/toe masses.

Orange hazard accent is secondary to shape.

## 9.4 Pyro — refractory surfaces, vents, copper heat management

**Emblem:** three vertical vent slits over contained ember core.

- Helmet: vented heat hood/helmet, narrow face slit, copper side shield.
- Armour: overlapping refractory chest plates around copper coil/vent block.
- Gloves: long insulated gloves, layered cuff, heat-shield plate.
- Boots: insulated high boots, thick dark sole, copper ankle guard.

No permanent flame halos.

## 9.5 Juggernaut — maximum slab mass

**Emblem:** four-bolt square slab with central recessed plate.

- Helmet: near-square/domed slab shell with tiny face opening.
- Armour: enormous rectangular torso shell; widest chest silhouette.
- Gloves: massive block gauntlets.
- Boots: heavy rectangular greaves/boots with broad planted soles.

Must read heavy in grayscale silhouette.

## 9.6 Recon — lightweight lenses, straps, angular low-mass panels

**Emblem:** narrow eye/lens diamond crossed by one range line.

- Helmet: slim half-visor/headset with offset lens and open negative space.
- Armour: crossed harness with two small angular chest panels rather than solid vest.
- Gloves: slim sensor/fingerless gloves with wrist optic block.
- Boots: narrow split-sole boots/greaves with swept heel profile.

No futuristic neon bodysuit.

## 9.7 Technician — cables, sockets, powered workshop modules

**Emblem:** hex socket around small cyan powered node.

- Helmet: work visor with hinged magnifier/tool light and side cable.
- Armour: compact tool-rig chest hub with two large cable routes and socket panel.
- Gloves: multi-tool gauntlets with broad clamp + powered wrist node.
- Boots: magnetic clamp boots with rectangular sole magnets and cable cuff.

Cyan is accent, not full palette.

## 9.8 Medic — padding, repair canisters, original sustain symbolism

**Emblem:** tied bandage knot around one pulse bead/repair droplet. **Never use the protected Red Cross emblem.**

- Helmet: padded work hood with bandage-knot emblem and open face area.
- Armour: soft segmented vest carrying repair canister and broad fastening straps.
- Gloves: wrapped/padded gloves with sealant cartridge at wrist.
- Boots: cushioned high work boots with rounded sole and one wrap band.

## 9.9 Equipment acceptance

A 4×8 black-silhouette contact sheet must preserve slot columns and set-family construction. Grayscale must still distinguish Technician vs Recon and Demolition vs Juggernaut. Future Set N+1 follows the set + four-piece template rather than inventing another UI/render path.

---

# 10. Achievements — exact current 10 badges + hidden treatment

Use one 32×32 junkyard medal/patch frame. The central silhouette is unique; progress/rarity color is secondary. The list is keyed exactly to `achievements.json`.

1. **`achievement:first-kill` — First Blood:** one hostile eye/target silhouette receiving a single decisive impact notch. No gore/blood droplet; “first defeat” is the read.
2. **`achievement:kill-milestone-25` — Scrap Squad:** three grouped hostile-target plates/eyes arranged as a compact squad/tally cluster. No numeric `25`.
3. **`achievement:kill-milestone-100` — Junkyard Veteran:** worn chapter/yard crest with layered defeated-target notches and one repaired plate. More seasoned/earned than Scrap Squad without numeric `100`.
4. **`achievement:first-merge` — Forge Initiate:** two matching weapon modules converging into one visibly upgraded core.
5. **`achievement:boss-crusher` — Crusher Down:** cracked industrial compactor jaw/ram plate with deep central fracture.
6. **`achievement:chapter-junkyard` — Junkyard Champion:** opened junkyard gate inside a chapter crest with a clear route/completion notch.
7. **`achievement:first-victory` — First Victory:** compact contract/route plate with bold completion notch/check and one restrained victory spark. Distinct from Junkyard Champion by contract plate rather than gate/chapter geometry.
8. **`achievement:mastery-scrap-tabby` — Tabby Mastery:** Scrap Tabby's notched-ear silhouette inside a workshop mastery crest.
9. **`achievement:scrap-banked-1000` — Scrap Tycoon:** scrap bundle filling a compact riveted storage bin/vault with one value glint. No coin pile; this is the current hidden achievement.
10. **`achievement:permanent-reinforced-coat-3` — Well Protected:** reinforced work coat/vest with three clearly stepped reinforcement plates/progression layers. Distinct from the run-upgrade Reinforced Coat icon and equipment armour by its progression/stacked-plate framing.

**Hidden/locked treatment:** reusable dark riveted badge face with large unknown silhouette/question geometry and a small latch. The hidden Scrap Tycoon art is not shown until reveal; do not draw fake hidden achievements.

---

# 11. Enemies and bosses — 10 actor sheets

Threat behavior must be readable before fine detail. Ordinary current expanded 313×313 actor exports are replacement targets, not the new source standard.

## 11.1 Dust Mite — `dust-mite`

Low circular rust-fluff/metal-filings body; oversized dark goggle eye; cream brush cheeks; six pin legs; bent wire antennae. Smallest/roundest hostile silhouette. Frantic scuttle; defeat becomes compact rust pile.

## 11.2 Junk Rusher — `junk-rusher`

Low triangular wedge; bent dustpan bumper dominates; crushed-can shell; coil-spring rear legs; no wheels. Wind-up compresses coils/lowers wedge. Orange/dark-rust/steel.

## 11.3 Trash Brute — `trash-brute`

Maximum-width near-square compactor body; two bin-lid forearms; narrow cream face slit; tiny planted feet; one bent exhaust. Purple/deep-violet/steel. Heavy marching weight shifts, no bouncy run.

## 11.4 Scrap Sniper — `scrap-sniper`

Tall narrow tripod-like scrap creature; long sighting stalk/arm creates horizontal aiming cue; small rear battery/counterweight; three thin planted legs create negative space. Pale steel/icy blue + one danger-red sight accent. No humanoid rifleman.

## 11.5 Scrap Skitter — `scrap-skitter`

Very low lateral crescent/crab-spider; wide side legs; narrow center face plate; asymmetric antenna; width exceeds height. Acid-lime/cream/rust accents over dark steel. Must not collapse into Dust Mite-with-long-legs.

## 11.6 Bastion Beetle — `bastion-beetle`

Domed shell behind oversized frontal shield/mandible plate; shield spans most front width; rear body remains exposed. Deep teal/navy, cream wear, rust fasteners. Facing must read in black silhouette.

## 11.7 Junk Nester — `junk-nester`

Rear-heavy mobile nest/backpack of bundled cable/mesh/scrap cup; smaller front body; two tall antennae; visible open nest mouth. Ochre/olive/rust. Summon cue raises/opens nest assembly before runtime spawn.

## 11.8 Shard Bot — `shard-bot`

Angular diamond/kite core with four major fracture seams and splinter limbs; dark magenta/blue-steel with cream fracture gaps. Hurt widens seams; defeat clearly splits/collapses, anticipating spawned Dust Mites without drawing them into the sheet.

## 11.9 Scrap Crusher — boss `boss-crusher`

Asymmetric low industrial boss with giant horizontal compactor jaws/ram, one heavy side piston, exposed motor and small recessed sensor/face. Hazard red/dark steel/cream, restrained cyan machinery accent. Not an enlarged Trash Brute.

Mechanic readability: charge wind-up draws ram back and braces chassis; aimed-shot state exposes a small launcher/pressure port; late/enraged state escalates vibration/heat treatment without art owning thresholds.

Canvas: begin 64×64; use 96×96 only on silhouette evidence.

## 11.10 Forge Warden — boss `boss-forge`

Taller furnace/gantry silhouette than Crusher: central furnace core, two asymmetric articulated tool arms, overhead vent/hood, heavy base legs. Charcoal/gunmetal, white-hot cream, copper/orange bands, small cyan control nodes.

Mechanic readability: aimed-shot arm locks forward; charge lowers gantry/body; summon state raises signal/tool arm; escalation opens vent shutters/exposes more hot core. Runtime owns timing/thresholds.

Canvas: begin 64×64; use 96×96 only if tool-arm silhouette requires it.

## 11.11 Enemy silhouette gate

Black-fill matrix:

Mite = round; Rusher = wedge; Brute = square; Sniper = tall tripod; Skitter = lateral crescent; Beetle = dome + front wall; Nester = rear-heavy nest; Shard Bot = fractured diamond; Crusher = horizontal compactor jaw; Warden = furnace gantry.

Every pair must be nameable at expected display scale.

---

# 12. Pickups — 4 sheets

1. **`drop:xp`:** tall seed/diamond; white center, sky-blue upper facets, teal lower facet; four-frame fixed-center shimmer. Never round orb/coin.
2. **`drop:scrap`:** low irregular bundle with obvious tyre/bolt/plate cue; silver/rust; four-frame tiny settle/glint. Never cyan like XP.
3. **`drop:chest`:** squat wide purple box with gold corner hardware/dark hinge; one-pixel pulse. Wider/lower than weapon case.
4. **`drop:weapon`:** tall strapped gold/orange case with dark weapon-shaped mark and cyan latch; not a chest recolor.

Review all four together over darkest/busiest arena backgrounds and in grayscale.

---

# 13. World — exact current 15 assets

World art remains quieter/darker than actors and pickups. Decoration cannot imply collision where none exists.

## Floor tiles

1. Junkyard base 32×32: dark steel/concrete plates, sparse seams/rivets, seamless, no focal mark.
2. Patch A 32×32: repaired plate/diagonal welded seam; same average value as base.
3. Patch B 32×32: different plate break + sparse bolts/scuffs; not a repeat of A.

## Boundary tiles

4. Straight 32×32: continuous stacked scrap barrier with clear inner edge.
5. Corner 32×32: turns that edge cleanly; no overhang into playable lane.
6. Patch 32×32: repaired/dented straight section preserving passability read.
7. Gate 32×32: monster-chute/gate opening belonging to wall system; visual opening matches collision/spawn semantics.

## Decorative props

8. Tyre pile 24×18: two/three large rings; low non-colliding pile.
9. Crate 22×22: squat salvaged wood/metal crate with broad X/strap geometry; no text.
10. Engine block 32×24: chunky motor; two large cylinders/vents; clearly machinery, not chest.
11. Scrap heap 40×24: three/four large recognizable masses rather than pixel noise.
12. Oil stain 36×20: irregular very-dark flat ground cluster; never hazard-colored.
13. Warning sign 20×30: battered sign plate on short post; abstract hazard geometry, no copied logo/tiny text.

## Landmarks

14. Hanging press 48×64: tall overhead workshop press/crane silhouette; decorative upper mass must not lie about collider footprint.
15. Power stack 48×64: stacked barrels/cells/generator modules + large cable + one cyan node; footprint aligns with collision.

Current stages still use `junkyard-lot`; do not invent a fake second arena solely to justify art. New locations use the arena/world + bundle template when authoritative content introduces them.

---

# 14. Stage/chapter presentation — 8 logical pieces

Stage cards compose reusable authoritative art rather than commissioning one disconnected painting per stage.

1. **Junkyard chapter emblem:** bent gate/stacked scrap around central route marker.
2. **Forge chapter emblem:** furnace hood + anvil/vent silhouette around hot core; not generic flame badge.
3. **Junkyard Lot location card:** crop-safe 96×64-ish scene showing floor plates, boundary, press/power-stack language and open lane; no actors/text baked in.
4. **Objective Kill:** hostile silhouette + tally slash motif; no numeric text.
5. **Objective Collect:** scrap pickup entering collection tray/marker.
6. **Objective Survive:** workshop timer/clock protected by small ring; no fantasy hourglass.
7. **Objective Defeat:** large boss/ram silhouette + decisive strike/check cue.
8. **Boss-stage marker:** compact **compactor-jaw/toothed-gear hazard mark**. No generic skull shorthand.

Locked/cleared/selected states are reusable overlays, not separate paintings.

---

# 15. Legacy permanent/meta progression — current 4 icons

These remain required only while #165 retains the Progression surface.

1. **`reinforced-vest` — Reinforced Vest:** work vest on small workshop mannequin/stand with two stacked reinforcement plates + progress notch. Distinct from run Reinforced Coat and equippable armor.
2. **`quick-paws-training` — Quick Paws Training:** paw trail across three chunky workshop stepping/training blocks + upward notch. Distinct from Quick Paws/Light Paws/Adrenaline.
3. **`sharpened-ammo` — Sharpened Ammo:** broad fictional scrap slug against filing/grinding jig; visible preparation operation. Distinct from Heavy Rounds/Punch Through/PIERCING.
4. **`magnetic-whiskers` — Magnetic Whiskers:** compact cat muzzle with two long bent coil-tipped whiskers drawing bolts inward. Distinct from Scrap Magnet/Magnet Belly/Scavenge Pulse.

If #165 removes the feature, remove these art requirements with it rather than preserving obsolete UI to justify commissioned assets.

---

# 16. Global menu/navigation art

## Brand

1. **Meowcenary title lockup:** bespoke chunky pixel lettering + subtle salvage/paw/bolt motif. Accessible text remains separately rendered.
2. **Menu backdrop:** crop-safe workshop dispatch-board/junkyard shelter: dark bench/metal wall, cables/tools, distant yard opening; quiet UI zones; no baked buttons/text.

## Navigation icons — 24×24 riveted-tab family

3. Stages/Contracts: route card + objective marker/check notch.
4. Characters: mercenary head/ear silhouette in roster frame.
5. Progression/Goals: route/map + forward goal pin; conditional on #165.
6. Gunsmith: wrench + modular receiver/barrel connection.
7. Equipment: four-slot armored torso/helmet arrangement.
8. Achievements: junkyard medal/patch.
9. Settings: cog + small speaker/motion notch.
10. Compendium: battered field-guide plate/book + monster-eye silhouette.
11. Golden Run/Classic: circular endurance dial around Junkyard gate; distinct from Contracts.

---

# 17. Reusable UI chrome/state art

One reusable system, not per-screen decoration:

1. primary panel 9-slice — dark sheet metal/workbench, restrained riveted corners;
2. card frame — lighter inset plate, clipped/notched corners;
3. focus/selected frame — cream/cyan corner brackets or welded highlight; shape/thickness survives grayscale;
4. locked overlay — chunky padlock/closed latch;
5. disabled overlay — broken/dim plate treatment; opacity stays runtime-owned;
6. scroll track — narrow recessed rail;
7. scroll thumb — chunky riveted slider tab;
8. tab/chip frame — compact clipped-corner plate;
9. tooltip frame — small inspection plate with pointer notch;
10. modal/result frame — stronger center plate with header/footer zones;
11. selection chevron/cursor — bold scrap-arrow bracket;
12. state marker family — new/spark, unlocked/open latch, complete/check, boss/hazard;
13. merge icon — two matching modules/cards converge into one improved module;
14. contract cleared emblem — open gate/check stamp;
15. contract failed emblem — cracked contract/broken route marker; no punitive skull/gore.

---

# 18. Stat/comparison glyphs — 16

Use one semantic glyph everywhere the stat appears.

1. max health — repair core inside armor plate;
2. move speed — forward paw/boot + speed notch;
3. damage — impact burst hitting scrap plate;
4. attack speed — rotating firing gear/gauge + fast tick;
5. range — outward range line from muzzle point;
6. projectile speed — projectile + long motion streak;
7. spread/accuracy — three-line narrowing/fanning cone;
8. pickup radius — pickup inside widening collection ring;
9. currency gain — scrap bolt/bundle + plus spark;
10. XP gain — XP seed + plus/up chevron;
11. projectile count — one-to-three projectile cluster;
12. pierce — projectile through plate;
13. knockback — hostile block pushed by broad impact arrow;
14. cooldown — circular workshop timer with missing wedge;
15. healing — repair core receiving droplet/patch spark;
16. protection/invulnerability — complete hex shield around center point.

Compose primitives for combined stats rather than inventing one icon per equation.

---

# 19. HUD, controls and settings

## HUD-only glyphs

Reuse XP/scrap/objective/ability art. Add only:

1. health marker — repair-core/plate glyph matching max-health semantics;
2. run timer — compact workshop stopwatch/dial;
3. kills — defeated hostile-eye/target tally mark; no human skull.

## Device-neutral logical-action glyphs

No baked Xbox/PlayStation identity:

1. Move — four-direction stick/paw arrows.
2. Confirm — strong check/press-in symbol.
3. Back — bent return arrow.
4. Dash — short forward burst/boot wedge.
5. Ability — powered hex/star slot; character ability art can sit inside.
6. Pause — two chunky bars in metal button plate.
7. Inventory/Rack — three weapon-slot rectangles in tray.

Runtime overlays resolved key/button labels.

## Settings glyphs

1. master mute/audio — speaker + removable slash state;
2. music — workshop speaker + music-note motif;
3. SFX — impact/spark burst from metal plate;
4. reduced motion — motion ticks crossed by calm/still ring;
5. fullscreen — four outward corner brackets.

---

# 20. Compendium art reuse

The Monster Compendium under #168 defaults to the **same approved enemy/boss actor sheets** from §11, rendered at crisp integer scale with real idle animation. It does not create a parallel monster-portrait pipeline by default.

Dedicated monster portraits may be commissioned only if the enlarged production sprite is materially insufficient in the final layout. Any portrait remains keyed to the same enemy ID and uses the full source/builder/validation pipeline.

Unseen entries derive a black silhouette/masked final sprite plus reusable unknown/locked treatment. Do not draw fake mystery creatures.

Reduced-motion presentation uses a stable approved frame rather than looping animation.

---

# 21. Art binding and scalable authoring

Stable IDs describe semantic ownership; rendering kinds describe renderer contracts. During #167 integration, do not grow one renderer branch merely because an icon belongs to equipment vs achievements vs passives.

Recommended logical IDs:

```text
character-portrait:<character-id-tail>
ability-icon:<ability-id-tail>
passive-icon:<passive-id-tail>
equipment-icon:<equipment-id-tail>
equipment-set-icon:<set-id-tail>
gun-part-icon:<part-id-tail>
gun-slot-icon:<slot>
trait-icon:<trait-id-tail>
achievement-icon:<achievement-id-tail>
permanent-upgrade-icon:<upgrade-id>
objective-icon:<objective-type>
chapter-icon:<chapter-id-tail>
arena-card:<arena-id>
nav-icon:<destination>
stat-icon:<stat>
action-icon:<logical-action>
ui-chrome:<name>
```

Current character/enemy actor art may retain the simple, documented and machine-validated `character:<character.id>` / `enemy:<enemy.id>` convention. Multi-asset presentation must use explicit references or a validated presentation catalog rather than hidden string construction.

Editable sources live under `assets-src/`; runtime exports under `public/assets/`. Major families require deterministic builders/contact-sheet output. UI primitives may use a reviewed generalized atlas/builder where that reduces meaningless file boilerplate while preserving reproducibility.

---

# 22. Production order

1. Render every current manifest binding and classify `approved`, `polish`, `placeholder/duplicate`, `missing`.
2. Build roster silhouette board: 8 characters + 8 ordinary enemies + 2 bosses at runtime size.
3. Replace placeholder/duplicate/313px-expanded actors.
4. Confirm weapons/projectiles/pickups against new actor readability.
5. Build semantic icon system primitives: stat/action/slot/trait.
6. Produce abilities/passives/exact 18 run upgrades.
7. Produce exact 12 Gunsmith parts and 8 slot glyphs.
8. Produce 8 set emblems + 32 equipment icons.
9. Produce exact 10 achievement badges.
10. Produce stage/chapter/menu/chrome/settings/result assets.
11. Produce four meta-progression icons only if #165 retains that UI.
12. Polish current 15 world assets.
13. Run integrated phone/desktop/grayscale/reduced-motion review.

Art may be produced while runtime remediation proceeds, but final in-game approval must use the stable post-remediation candidate.

---

# 23. Automated/reproducibility gates

Extend generic validation; do not add one script per content ID. Before #167 closes, validation should catch:

- every release content definition requiring art resolves an approved binding/reference;
- missing `.pxo`, builder, export or manifest entry;
- wrong frame size/count/tag/layer contract;
- trimmed/shifted actor frames and measurable anchor drift where feasible;
- guide/shadow/note leakage;
- malformed metadata or unexpected smoothing configuration;
- stale presentation art IDs;
- byte-identical distinct release actors/items unless explicitly allow-listed with rationale;
- placeholder/fallback exports still referenced by release content;
- orphaned final exports/sources;
- bundle omissions;
- concept/reference images accidentally wired as runtime assets;
- exact catalog coverage for the current 18 upgrades, 12 Gunsmith parts, 32 equipment pieces and 10 achievements;
- synthetic N+1 presentation references resolving through the same path as current content.

Run the current full validation gate after integration: lint, tests, art validation, content validation and build.

---

# 24. Iterative review record

## Pass 1 — current-game completeness

Resolved:

- corrected manifest baseline to 77 by including `projectile:default`;
- added presentation art outside the original manifest;
- added settings, controls, HUD, result/merge and management-screen art;
- added four legacy meta-progression icons found by catalog-wide review;
- stage art uses reusable composition rather than one painting per contract.

## Pass 2 — silhouette/semantic distinguishability

Resolved:

- froze distinct silhouettes for the three feline characters and all 10 hostiles;
- equipment sets now own construction motifs rather than palette swaps;
- collision-prone ability/passive/upgrade/Gunsmith concepts have explicit comparison gates;
- trait-core physical items are distinct from reusable trait emblems.

## Pass 3 — production feasibility/reproducibility

Resolved:

- 313×313 expanded actor sheets explicitly rejected as source standard;
- bosses start at 64×64 with evidence-driven 96×96 allowance;
- generalized deterministic builders allowed for small UI families;
- world sampling remains evidence-based rather than mechanically normalized.

## Pass 4 — UX/accessibility

Resolved:

- grayscale/silhouette gates added;
- reduced-motion behavior specified for enlarged/animated collection views;
- action icons made device-neutral;
- UI backdrops/chrome reserve legible text/focus space.

## Pass 5 — originality/legal coherence

Resolved:

- Medic set explicitly avoids protected Red Cross imagery;
- realistic firearm/military shorthand rejected;
- generic skull/fantasy shorthand removed where workshop-specific symbols exist.

## Pass 6 — independent catalog audit / PR review

The first PR review found three P1 catalog mismatches in the earlier draft. All are corrected here rather than waived:

1. nonexistent `Last Stand` replaced by the authoritative **Pistol Needle Rounds** upgrade;
2. Gunsmith section rewritten against the exact 12 current stable part IDs, including the `trait` slot, Padded Stock, Piercing Barrel, Fire Trait Core and Mastered Fire Trait Core;
3. achievement section rewritten against the exact 10 current achievement IDs/names, including First Victory, Scrap Tycoon and Well Protected.

These findings also changed the process: a brief is no longer considered complete merely because counts match. The production gate compares **stable IDs from every authoritative catalog** against the brief/art references.

## Pass 7 — scalable-authoring review

Resolved at planning level:

- every art family has a reusable brief template;
- every content-bearing catalog has an authoring path in `content-authoring-template-coverage.md`;
- current actor naming convention is documented/machine-validated rather than implicit;
- multi-asset presentation uses explicit references;
- synthetic N+1 validation is required;
- equipment-set provider-piece/source-ID debts are recorded as runtime authoring blockers rather than copied into future templates.

**Closure condition:** no art-production implementation should start from an older draft of §§7, 8 or 10. This document is the corrected catalog-aligned authority. Any future content addition must update both its source catalog and the template/coverage gates in the same change.