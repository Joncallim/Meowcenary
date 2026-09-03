# Alpha 3 Art Production Briefs

**Status:** reviewed production plan for Issue #167. This document plans art; it does not change runtime rules.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This packet inventories the player-facing art required by the current Alpha 3 game and freezes implementation-ready briefs for every logical production asset. It extends, rather than replaces, the existing visual standards in:

- `style-guide.md`
- `originality.md`
- `character-design-workflow.md`
- `character-asset-standard.md`
- `pixelorama-workflow.md`
- `epic-13-sprite-design.md`
- `epic-16-visual-design.md`

If this packet conflicts with a gameplay or asset-loading architecture contract, the architecture owns runtime behavior and this packet must be reconciled rather than worked around.

---

## 1. Production rules that apply to every asset

### Visual language

Meowcenary is cute, chunky, readable, improvised and deliberately pixel-made. Use junkyard/workshop vocabulary: rivets, patched canvas, repurposed tins, worn steel, copper, cable, workshop markings, salvaged housings and powered modules. Avoid military realism, generic fantasy UI, glossy mobile-game gradients and copied genre-game expression.

The near-black outline `#0a0f14` remains the default silhouette separator. Use a limited flat palette, normally one base, one shadow, one highlight and one or two identity accents per major material. Do not use semitransparent anti-aliased edge pixels, baked lighting cones, baked ground shadows, large soft glows or sub-pixel detail.

### Scale and readability

The canonical review viewport is 390×844. Every icon and sprite is judged at its actual runtime display size before being accepted. A successful enlarged preview is not sufficient.

- Ordinary character/enemy actors: preserve the established 48×48 source contract unless a reviewed migration proves a different canvas necessary.
- Character runtime display target: roughly 28×28.
- Ordinary enemy runtime display target: roughly 26×26.
- Bosses: select one deliberately pixel-sized source canvas per boss during production, expected to be 64×64 or 96×96 if 48×48 cannot preserve the required silhouette. Do **not** retain 313×313 generated-image frames as a production standard.
- Small semantic icons: normally 24×24.
- Detailed equipment/part icons: normally 32×32 source, reviewed at 24–32 px display.
- Character portraits: 96×96 static pixel portraits unless the UI proves a smaller source sufficient.
- World tiles retain their authored native dimensions and are reviewed in actual camera/FIT scaling.

Nearest-neighbour is the default for sprites/icons. World sampling must be decided consistently from actual native-scale/FIT evidence rather than changed mechanically; current world entries use linear sampling and must be visually compared before migration.

### Actor animation contract

Characters and ordinary enemies retain the established stable-anchor sheet unless a specific mechanic requires an explicit extension:

| Tag | Frames | Intent |
| --- | ---: | --- |
| `idle` | 4 | personality/readiness without body-center drift |
| `run` | 6 | readable locomotion / pursuit |
| `hurt` | 2 | obvious recoil/compression |
| `defeat` | 4 | legible collapse/deactivation |

Right-facing source art is mirrored by the engine. The torso/body mass remains pinned. Motion belongs to limbs, tails, antennae, tools and accents, not accidental whole-sprite wobble.

Bosses may add mechanic-specific telegraph/phase clips only when the runtime contract explicitly consumes them. Do not hide authoritative boss timing in an animation.

### Production provenance

For every new actor or major family:

1. write the brief;
2. generate or draw 3–5 concept directions where concept exploration adds value;
3. retain generation prompts/reference boards as provenance only;
4. select one direction with a written reason;
5. create/edit the Pixelorama `.pxo` source;
6. mirror the accepted pixels into the deterministic Lua builder or reviewed generalized builder;
7. export untrimmed PNG/JSON;
8. run structural/art validation;
9. review silhouette, palette, anchor and originality independently;
10. review in the real game at phone and desktop scale.

Concept-board pixels are never copied directly into a runtime sprite sheet. Builder and `.pxo` source may not silently diverge.

---

## 2. Complete asset inventory

At the reviewed baseline the visual-art manifest contains **77 logical runtime bindings** requiring production-quality review: 8 character actors, 10 enemy/boss actors, 18 upgrade icons, 9 weapon icons, 9 held-weapon images, 4 projectile sheets (the legacy/default projectile plus three family projectiles), 4 pickup sheets and 15 world assets.

Alpha 3 also needs presentation art not represented by those original bindings: character portraits, active/passive icons, equipment and Gunsmith iconography, achievement badges, stage/chapter/objective art, menu/navigation art, reusable UI chrome, stat/action glyphs and result/control treatments. These are logical art units; implementation may atlas or 9-slice them without changing their individual design briefs.

The production rule is **reuse a semantic asset where it already says the right thing; do not duplicate art merely because another screen needs it.** Example: the XP pickup can supply the XP HUD glyph, and weapon icons can supply starting-loadout imagery.

---

# 3. Playable mercenaries — 8 actor sheets + 8 portraits

All eight characters need a final gameplay sheet and one select/Compendium-quality portrait. Portraits are not separate character designs: they magnify the same silhouette, outfit and palette and may show more face/personality detail without contradicting the runtime sprite.

## 3.1 Scrap Tabby

**Gameplay read:** balanced, resourceful scavenger/generalist.

**Actor:** compact biped; square head; two strong triangular ears with one notch; short striped tail close to the body; round tin-lid shoulder guard; small utility belt; teal neckerchief. Amber/cream body with burnt orange and teal identity accents. The silhouette must remain the shortest/most compact feline in the roster.

**Animation:** sturdy two-step jog; small scarf/tail secondary motion; hurt recoils behind the shoulder guard; defeat settles into a compact seated/slumped shape.

**Portrait:** three-quarter workshop pose with the notched ear, tin-lid guard and neckerchief dominant. Friendly confidence rather than aggression. Do not make the held gun the portrait's largest shape.

**Must not become:** Volt Lynx's tall recon silhouette; Ember Cougar's muscular heat silhouette; a generic orange cat mascot.

## 3.2 Bolt Hound

**Gameplay read:** wiry high-speed striker with sustain ability.

**Actor:** long low quadruped runner; one swept-back ear and one short upright ear; angular natural-fur tail; springy legs; lightweight canvas/cable racing harness; cyan foreleg bracer; lime timing light. Steel-blue/pale-cyan base, lime timing accent, rusty copper hardware.

**Animation:** alert coiled idle; six-frame bound with clearly airborne extension; hurt tucks front legs; defeat ends in a low skid.

**Portrait:** long muzzle and asymmetric ears remain dominant; show the racing harness/bracer and eager forward lean. No electricity aura.

**Must not become:** an upright wolf soldier, Volt Lynx, or a blue recolour of another character.

## 3.3 Volt Lynx

**Gameplay read:** recon/mobility specialist; precise and restless.

**Actor:** tall, narrow upright feline with long forearms/legs, high lynx ear tufts and a short angular cheek ruff; compact sensor harness crossing the chest; one small powered hip cell; no broad shoulder armor. Use cool violet/navy body/outfit values with a sharp electric-cyan sensor accent and pale silver face/ear details. The body must read vertically, unlike compact Tabby and low Bolt Hound.

**Animation:** light toe-first idle shift; long clean running stride with minimal vertical bounce; hurt folds inward rather than flopping; defeat kneels/slides before settling.

**Portrait:** ear tufts and narrow sensor harness form the read; curious, alert expression; the small powered cell may glow as a single flat cyan cluster but no aura.

**Must not become:** a generic electric cat, a taller Scrap Tabby, or a canine runner.

## 3.4 Brass Boar

**Gameplay read:** heavy/tank bruiser; durable and stubborn.

**Actor:** wide, low biped boar; wedge snout and two unmistakable tusks; broad aged-brass chest/shoulder plating; short planted legs; thick forearms; small leather/canvas straps. Aged brass/ochre, deep oxblood brown, cream tusks and dark steel. Width and tusks must survive a black silhouette.

**Animation:** weight shifts rather than bouncing; short driving run; hurt rocks the brass plate; defeat drops onto one knee then rolls into a low heavy rest.

**Portrait:** broad shoulders, tusks and dented brass dominate; calm unimpressed expression, not rage.

**Must not become:** Trash Brute with an animal head, Piston Ram, or an orange/brown Scrap Tabby.

## 3.5 Ember Cougar

**Gameplay read:** elemental/damage striker; heat contained under pressure.

**Actor:** sleek but muscular upright cougar; low rounded feline ears, long tail with dark tip, broader shoulders than Lynx; compact refractory shoulder mantle and vented copper chest piece; dark charcoal outfit with burnt vermilion/copper and pale ember accents. Heat identity comes from vent shapes and copper, not a permanent flame halo.

**Animation:** controlled stalking idle; low athletic run; hurt flashes a compressed defensive pose; defeat vents once then collapses. `heat-vent` presentation can add runtime FX around the actor; do not bake an explosion into ordinary frames.

**Portrait:** low ears, strong muzzle and copper vent mantle distinguish the character immediately.

**Must not become:** Volt Lynx with orange colors, Junk Rusher, or a flaming superhero.

## 3.6 Scrap Weasel

**Gameplay read:** scavenger-engineer; loot and parts specialist.

**Actor:** long narrow upright/stooped weasel; elongated torso and small head; oversized asymmetrical salvage satchel; belt-mounted magnetic coil and hooked sorting tool; quick short legs. Moss/olive workwear, cream face, rust hardware and small mint/cyan powered-coil accent.

**Animation:** fidgeting inventory-check idle; fast scurrying run with satchel counter-swing; hurt protects the bag; defeat spills into a long low shape without literal loot objects scattering unless runtime owns them.

**Portrait:** satchel strap, long body and coil make the read; curious acquisitive expression.

**Must not become:** quadruped Bolt Hound, generic thief, or Scrap Tabby with a backpack.

## 3.7 Rattle Raptor

**Gameplay read:** precision/range hunter.

**Actor:** small feathered/mechanical raptor silhouette; pronounced beak/snout; long straight stabilizing tail; digitigrade legs; one compact monocular optic mounted beside the head; light shoulder harness, no giant rifle baked into actor art. Bone/cream feather plates, petrol teal, dark forest/navy and one magenta optic pixel cluster.

**Animation:** head-locking idle while tail balances; sharp two-step run; hurt snaps the optic-side shoulder back; defeat folds tail and body into a triangular rest.

**Portrait:** side profile, optic and long tail base are key; the eye/optic should feel observant rather than robotic.

**Must not become:** a bird soldier, a dinosaur parody, or another feline silhouette.

## 3.8 Piston Ram

**Gameplay read:** overclocked mechanical attack-speed specialist.

**Actor:** horned ram/automaton hybrid; two broad curved horn arcs; boxy mechanical chest; exposed but readable piston forearms; compact hoof-like feet; small pressure gauge on shoulder. Gunmetal/slate body, cobalt powered housing, pale cream face/gauge and a tiny hot-orange redline accent. The horn arc is the primary silhouette cue.

**Animation:** hydraulic idle compression; piston-driven run; hurt over-compresses one arm; defeat loses pressure and sinks. Overclock FX/timing remains runtime-owned.

**Portrait:** horns, gauge and box chest dominate; expressive eyes keep it characterful rather than a generic robot.

**Must not become:** Brass Boar, a literal industrial ram machine, or a humanoid mech.

### Character silhouette acceptance matrix

At black-fill only: Tabby = compact ears; Hound = long quadruped; Lynx = tall ear-tufted; Boar = wide tusked; Cougar = athletic low-eared feline; Weasel = long stooped satchel; Raptor = beak + long tail; Ram = horn arcs + box chest. If any two cannot be named at 28px silhouette scale, neither is approved.

---

# 4. Character active abilities — 8 icons

All ability icons use one 24×24 family: dark outline, compact metal badge backing, one dominant central symbol and at most one effect accent. They must remain distinguishable in grayscale; color reinforces meaning.

1. **`ability:scrap-burst` — Scrap Burst:** central jagged scrap nut with four short outward impact wedges. Radial force, not fire/explosion. Cyan/cream impact accent. Must not resemble Heat Vent.
2. **`ability:giga-chomp` — Giga Chomp:** chunky smiling canine jaw biting into a small repair ration/metal biscuit, with one healing spark. Read as immediate recovery, not damage bite.
3. **`ability:adrenaline` — Adrenaline:** lean paw/leg silhouette crossing a compact speedometer arc with needle pushed forward. Pure movement burst; no weapon.
4. **`ability:shield-flicker` — Shield Flicker:** incomplete hexagonal energy shield blinking through two separated bright segments around a small paw/boar silhouette. Protection, not permanent armor.
5. **`ability:heat-vent` — Heat Vent:** vent grille with three short outward heat tongues/waves; circular burst composition but distinct from Scrap Burst through vent/heat language.
6. **`ability:scavenge-pulse` — Scavenge Pulse:** central salvage coil sending two concentric angular pulse rings toward a tiny XP mote and bolt. Do not use a horseshoe magnet; that belongs to Scrap Magnet.
7. **`ability:precision-mark` — Precision Mark:** enemy-head/scrap target silhouette with a single diamond weak-point tag and one piercing line. No pistol silhouette, separating it from Pistol Deadeye.
8. **`ability:overclock` — Overclock:** compact gear/piston with a redline gauge and two small motion ticks. No weapon silhouette, separating it from SMG Overclock.

---

# 5. Character passive icons — 8 icons

Use the same 24×24 semantic-icon language but a quieter square/hex badge frame than active abilities so passive and active state are not confused.

1. **Scrap Hoarder:** small pouch opening toward two nearby scrap fragments; proximity/collection identity, not a magnet.
2. **Quick Tail:** stylized swept canine tail with two short speed ticks; character-specific movement passive, distinct from Quick Paws.
3. **Light Paws:** two narrow lynx paw prints with lifted heel/air gap; elegant movement, no speedometer.
4. **Thick Hide:** layered boar-hide/plate cross-section: three nested chunky plates; defensive durability, not Shield Flicker.
5. **Ember Aura:** tiny contained ember inside a dark vent ring; constant damage identity, not Heat Vent's outward burst.
6. **Magnet Belly:** curved belt-mounted coil embracing one bolt below it; permanent scavenger identity, distinct from the horseshoe Scrap Magnet and Scavenge Pulse rings.
7. **Hunter Eye:** angular raptor eye/optic with one long range line; range identity, not Precision Mark's tagged target.
8. **Hydraulic Core:** small piston pair around a rotating core, compressed/rapid mechanical rhythm; attack-speed identity, no redline gauge.

---

# 6. Weapons — 9 rack icons, 9 held silhouettes, 4 projectiles

## Shared tier rule

A family and adjacent tiers must remain identifiable in a grayscale screenshot. Tier progression changes mass/modules before hue:

- **T1:** one compact core mass.
- **T2:** core plus one clearly protruding functional module.
- **T3:** heavier front/energy housing with a distinctive cutout or chamber.

No stars, Roman numerals or palette swaps as primary tier cues.

## Scrap Pistol

- **Rack T1:** short square scrap receiver, cream muzzle cap, compact worn grip. No realistic service-pistol proportions.
- **Rack T2:** preserve T1 core; add a visible cyan side cell beneath/rear of receiver and a slightly longer cap.
- **Rack T3:** broad forward housing and larger energy chamber cutout; still unmistakably the shortest weapon family.
- **Held T1/T2/T3:** same silhouettes re-authored for the 32×20 held canvas with stable grip/hand anchor; barrel growth extends forward, not backward through the player.
- **Projectile `projectile:pistol`:** compact cyan/cream filed-metal slug, two-frame seam spark, 8px display target.

## Can-Drum SMG

- **Rack T1:** low horizontal receiver with repurposed round can/drum hanging below center; drum is the family cue.
- **Rack T2:** larger drum + short rear brace; retain low line.
- **Rack T3:** heavier front cap and broad horizontal energy strip; drum remains visible.
- **Held T1/T2/T3:** stable grip anchor; family remains longer than pistol but shorter/lower-mass than shotgun.
- **Projectile `projectile:smg`:** narrow teal chevron/spark with very small mass and brisk two-frame tail; reads fast rather than powerful.

## Bolt Shotgun

- **Rack T1:** longest family, two parallel barrel masses, wrapped rear grip.
- **Rack T2:** second visible barrel band and thicker chamber block.
- **Rack T3:** broad three-part industrial front and warm-orange chamber cutout.
- **Held T1/T2/T3:** stable rear grip; barrel bands/forward mass carry tier progression.
- **Projectile `projectile:shotgun`:** compact warm-orange pellet cluster; multiple points but one visually honest centered physics mass.

## Legacy/default Scrap Shot

**`projectile:default`:** neutral compact hexagonal scrap slug with cream nose, cyan seam and dark rear recess. It must remain family-neutral for legacy/effect paths and visibly distinct from the narrow SMG spark and orange shotgun cluster. If implementation later proves this binding truly unused, remove it deliberately with validation rather than letting it become unowned art.

---

# 7. Run upgrade cards — 18 icons

Use 24×24 icons with strong one-object compositions. No letters/numbers. Avoid relying on rarity color for meaning.

1. **Quick Paws:** two bold paw prints leaning forward with three short speed ticks. No gun or speedometer.
2. **Extra Scrap:** irregular low scrap bundle with one tyre/bolt cue and one small value glint. Never blue/cyan like XP.
3. **Hot Barrel:** short vented barrel section with hot fins/heat marks. Short by design, so it cannot be mistaken for Long Barrel.
4. **Scrap Magnet:** unmistakable horseshoe magnet pulling one bolt across a gap. No pulse rings.
5. **Reinforced Coat:** patched work vest with one added square metal plate and large stitch/rivet clusters.
6. **Fast Learner:** XP seed/mote rising through one broad upward chevron. Reuse the XP silhouette, not a generic book.
7. **Heavy Rounds:** one oversized broad hexagonal slug/nut over a small weight plate; bulky and slow-looking, not realistic ammunition.
8. **Long Barrel:** very elongated clean barrel/pipe profile with a small sight cap; no warm heat accent.
9. **Split Shot:** one centered projectile dividing into two clearly separated diverging slugs.
10. **Punch Through:** projectile crossing two thin pierced plates in a perfectly straight line.
11. **Glass Cannon:** cracked translucent-looking *pixel cluster* energy chamber/amplifier attached to a small barrel core; bright center, visible fracture, no literal wheeled cannon.
12. **Pistol Deadeye:** Scrap Pistol silhouette centered in a simple circular sight ring. Weapon is mandatory to separate it from Precision Mark.
13. **SMG Spray:** can-drum SMG with a readable fan of three tiny outgoing rounds.
14. **SMG Overclock:** can-drum SMG plus a small side coil/gauge at redline; weapon silhouette separates it from the character Overclock ability.
15. **Shotgun Buckshot:** twin-barrel muzzle with a dense compact pellet cluster directly ahead.
16. **Shotgun Breacher:** shotgun muzzle/ram visibly breaking one heavy plate at close range.
17. **Run and Gun:** one running paw/boot under a small forward muzzle flash; the dual movement+fire composition separates it from Quick Paws.
18. **Last Stand:** cracked defensive plate behind one bright final-shot/resolve spark; reads desperate offense/defense, not a generic health icon.

### Upgrade collision test

Review these pairs side-by-side in black/white: Quick Paws vs Run and Gun; Hot Barrel vs Long Barrel; Heavy Rounds vs Punch Through; Pistol Deadeye vs Precision Mark; SMG Overclock vs Overclock; Scrap Magnet vs Magnet Belly vs Scavenge Pulse. Any pair that requires reading the label to tell apart must be revised.

---

# 8. Gunsmith — 12 part icons + 7 slot icons + 3 trait emblems

Current part presentation reuses upgrade icons. That is placeholder debt. Final Gunsmith art uses dedicated physical-component silhouettes.

## Slot icons

1. **Receiver:** compact rectangular gun core with front/rear connection tabs.
2. **Barrel:** isolated forward tube/housing with clear muzzle end.
3. **Optic:** raised lens/sight block on a tiny rail.
4. **Stock:** rear shoulder brace with open negative space.
5. **Trigger:** trigger bow + small mechanism block, not a whole gun.
6. **Magazine:** detachable can/box feed shape.
7. **Underbarrel:** lower rail module with top attachment line.

These seven are neutral schematic glyphs used for empty slots and filtering; they must not resemble owned item art closely enough to imply an item is equipped.

## Part icons

1. **Compact Receiver:** short lightweight rectangular core; one small cyan side fastener; most negative space of the receiver pair.
2. **Heavy Receiver:** taller/wider block with reinforced front lug and two broad plates; visibly heavier than Compact without relying on rarity color.
3. **Standard Barrel:** medium straight barrel housing, simple steel/cream muzzle ring.
4. **Long Barrel:** nearly full-width narrow tube with a support band near the front; clearly longer than Standard.
5. **Red-Dot Optic:** low single-lens sight with tiny bright red/coral dot inside a dark hood; no literal text.
6. **Long-Range Optic:** longer raised optic tube with two support rings and larger front lens; silhouette distinct from Red-Dot.
7. **Stable Stock:** triangular/braced rear stock with broad shoulder pad; stable mass below centerline.
8. **Hair Trigger:** delicate but readable trigger mechanism with narrow bow and bright spring/pin; must not shrink into noise.
9. **Extended Magazine:** tall/curved box/can magazine with visible extension below a small reference feed lip.
10. **Standard Underbarrel:** compact rectangular lower module/foregrip with vent/rail marks; intentionally plain baseline.
11. **Incendiary Barrel:** Standard/Long family language transformed by a copper heat jacket, three vent cuts and contained ember chamber; FIRE identity is structural, not a flame sticker.
12. **Grenade Underbarrel:** short broad secondary tube with round chamber and reinforced lower mount; must not look like Standard Underbarrel with orange paint.

## Trait emblems

1. **FIRE:** contained angular ember/heat coil inside a ring; no large free flame.
2. **PIERCING:** one straight slug crossing a single plate with clean exit notch.
3. **EXPLOSIVE:** compact cracked scrap charge with four short blast wedges; deliberately different from Scrap Burst by charge casing.

Trait emblems are reusable overlays/badges. They do not replace physical part art.

---

# 9. Equipment — 32 piece icons + 8 set emblems

Every equipment piece gets dedicated art. The slot silhouette identifies **what** it is; set construction identifies **which family** it belongs to. Palette alone is insufficient.

## Commando set — orderly modular handling/fire-control gear

**Emblem:** three aligned squared plates with a small horizontal handling stripe.

- **Helmet:** low squared scrap helmet/cap with a single side radio/tab and short brow plate.
- **Armour:** tidy three-plate vest with evenly spaced rivets and central strap.
- **Gloves:** paired compact knuckle plates over close-fitting work gloves.
- **Boots:** squared ankle boots with one reinforced toe cap and straight strap.

Avoid realistic modern military insignia/camo.

## Scavenger set — asymmetrical pockets/hooks/collection gear

**Emblem:** hooked salvage claw curling around one loose bolt.

- **Helmet:** patched floppy work cap/hood with offset headlamp and one stitched panel.
- **Armour:** pouch-heavy apron/vest with one oversized side pocket and diagonal salvage strap.
- **Gloves:** mismatched grip gloves, one carrying a small hook/clip silhouette.
- **Boots:** visibly mismatched but compatible strapped boots, one higher cuff than the other.

Keep clutter in large clusters; do not fill 32px with tiny junk.

## Demolition set — blast plates, impact padding, warning geometry

**Emblem:** squat reinforced charge casing with two outward impact wedges.

- **Helmet:** rounded blast helmet with thick forehead shock pad and protected ear blocks.
- **Armour:** heavy blast bib with central impact plate and lower padded flap.
- **Gloves:** thick gauntlets with broad back-of-hand shock pads.
- **Boots:** wide shock-sole boots with thick heel/toe masses.

Use orange hazard accent sparingly; shape owns identity.

## Pyro set — refractory surfaces, vents and copper heat management

**Emblem:** three vertical vent slits over a contained ember core.

- **Helmet:** vented heat hood/helmet with narrow face slit and copper side shield.
- **Armour:** overlapping refractory chest plates around a visible copper coil/vent block.
- **Gloves:** long insulated gloves with layered cuff and one heat-shield plate.
- **Boots:** insulated high boots with thick dark sole and copper ankle heat guard.

No permanent flames baked into gear.

## Juggernaut set — maximum mass and broad slab geometry

**Emblem:** four-bolt square slab with a central recessed plate.

- **Helmet:** near-square/domed slab helmet with tiny face opening.
- **Armour:** enormous rectangular torso shell; widest equipment chest silhouette in the game.
- **Gloves:** massive block gauntlets with huge top plates.
- **Boots:** heavy rectangular greaves/boots with broad planted soles.

Must read heavy even in silhouette and grayscale.

## Recon set — lightweight lenses, straps and angular low-mass panels

**Emblem:** narrow eye/lens diamond crossed by one range line.

- **Helmet:** slim half-visor/headset with one offset lens and open crown/ear negative space.
- **Armour:** lightweight crossed harness with two small angular chest panels rather than a solid vest.
- **Gloves:** slim sensor/fingerless gloves with tiny wrist optic block.
- **Boots:** narrow split-sole boots/greaves with swept rear heel profile.

Do not turn Recon into a futuristic neon bodysuit.

## Technician set — cables, sockets and powered workshop modules

**Emblem:** hex socket surrounding a small cyan powered node.

- **Helmet:** work visor with hinged magnifier/tool light and visible side cable.
- **Armour:** compact tool-rig chest hub with two large cable routes and socket panel.
- **Gloves:** multi-tool gauntlets with one broad clamp and powered wrist node.
- **Boots:** magnetic clamp boots with rectangular sole magnets and cable ankle cuff.

Powered cyan is an accent, not the whole palette.

## Medic set — padding, repair canisters and original sustain symbolism

**Emblem:** tied bandage knot around one pulse bead/repair droplet. **Never use the protected Red Cross emblem.**

- **Helmet:** padded work hood with the bandage-knot emblem and open readable face area.
- **Armour:** soft segmented vest carrying one cylindrical repair canister and broad fastening straps.
- **Gloves:** wrapped/padded gloves with a small sealant cartridge at wrist.
- **Boots:** cushioned high work boots with rounded sole and one wrap band.

The set should read care/repair without copying real-world emergency-service marks.

### Equipment acceptance

A 4×8 black-silhouette contact sheet must let reviewers identify the four slot columns and distinguish set families from construction. A grayscale version must preserve the set read. If removing color collapses Technician into Recon or Demolition into Juggernaut, revise the shape language.

---

# 10. Achievements — 10 badges + hidden/locked treatment

Use a shared 32×32 junkyard medal/patch frame. Each badge's central silhouette is unique; rarity/progress color is secondary.

1. **First Contract:** stamped contract tag/clipboard plate with a large check-shaped notch; no text.
2. **Scrap Sweeper:** broad workshop broom/salvage brush sweeping two scrap pieces into a pile.
3. **Junkyard Reaper:** oversized salvage rake/cutting hook clearing a large scrap heap; avoid literal hooded Grim Reaper imagery.
4. **Merge Mechanic:** two matching weapon modules converging into one visibly larger upgraded core.
5. **Crusher Crushed:** cracked industrial compactor jaw/ram plate with a deep central fracture.
6. **Untouchable:** pristine paw silhouette inside one unbroken protective ring, with threats stopping outside.
7. **Top Cat:** Scrap Tabby's two-ear/notched-ear silhouette inside a workshop crest.
8. **Junkyard Cleared:** opened junkyard gate between two low boundary stacks, clear path through center.
9. **Hot Work:** glowing heated metal block/barrel surrounded by short heat waves; shares FIRE vocabulary without duplicating its trait emblem.
10. **Fully Suited:** four tiny slot silhouettes arranged around a complete armored torso/figure crest.

**Hidden/locked treatment:** one reusable dark riveted badge face with large question/silhouette shape and small lock plate. Do not create separate fake icons for hidden achievements.

---

# 11. Enemy and boss production — 10 actor sheets

Ordinary enemy silhouette communicates threat behavior before fine detail. Expanded Alpha 3 actor exports that currently use 313×313 generated-image frames are replacement targets, not a new standard.

## 11.1 Dust Mite — swarm/chaser

Low circular rust-fluff/metal-filings body; one oversized dark goggle eye; two cream brush cheeks; six pin legs; bent wire antennae. Danger-red/coral/rust palette. Run is a frantic scuttle; defeat becomes a compact rust pile. Must remain the smallest/roundest enemy.

## 11.2 Junk Rusher — charger

Low triangular wedge; bent dustpan bumper dominates; orange crushed-can shell; cream readiness lamp; coil-spring rear legs; no wheels. Wind-up compresses the coils and lowers the wedge; dash extension makes intent readable before speed. Orange/dark-rust/steel.

## 11.3 Trash Brute — tank

Maximum-width near-square compactor body; two bin-lid forearms; narrow cream face slit; tiny planted feet; one bent exhaust. Purple/deep-violet/steel. March shifts weight; no bouncy run. Must not become a tall humanoid robot.

## 11.4 Scrap Sniper — ranged threat

Tall/narrow tripod-like scrap creature rather than another round body; long sighting stalk/arm forms a clear horizontal aiming cue; small rear battery/counterweight; three thin planted legs create negative space. Pale steel/icy blue body with a single danger-red sight accent. The aiming telegraph should be readable through pose while authoritative aim line/projectile remains runtime-owned.

**Must not become:** Rattle Raptor, a humanoid with a rifle, or a tower indistinguishable from scenery.

## 11.5 Scrap Skitter — flanker

Very low lateral crescent/crab-spider silhouette; wide side legs, narrow central face plate, asymmetric antenna; body width exceeds height. Acid-lime/dirty cream/rust accents over dark steel, but danger read must survive without lime. Run animation emphasizes sideways leg banks and lateral feinting.

**Must not become:** Dust Mite with longer legs or Bastion Beetle without a shield.

## 11.6 Bastion Beetle — directional shield

Domed beetle shell behind one oversized frontal shield/mandible plate; shield spans most of front width and has a clear directional edge; rear legs/body remain exposed. Deep teal/navy shell, cream shield wear and rust fasteners. Facing must be legible even as a black silhouette.

**Must not become:** Trash Brute; the domed rear + dominant directional front plate are mandatory.

## 11.7 Junk Nester — spawner/support

Rear-heavy broad silhouette: mobile nest/backpack made from bundled cable, mesh and scrap cup; smaller front body/head; two tall antennae; visible open nest mouth on rear/top. Ochre/olive/rust with pale eggs/scrap nodes only as large clusters. Summon cue opens/raises the nest assembly before runtime spawn occurs.

**Must not become:** a static turret or walking chest.

## 11.8 Shard Bot — splitter/disruptor

Angular diamond/kite central body with four major fracture seams and splinter-like limbs; no round body mass. Dark magenta/blue-steel with pale cream fracture gaps. Hurt widens seams; defeat clearly splits/collapses so the subsequent Dust Mite spawns feel anticipated, without baking spawned enemies into the sheet.

**Must not become:** an XP crystal/collectible. Keep value, outline and hostile face/limbs unmistakably enemy-like.

## 11.9 Scrap Crusher — boss

**Read:** industrial compactor/press monster; relentless ram pressure.

Asymmetrical low industrial boss with giant horizontal compactor jaws/ram, one heavy side piston, exposed workshop motor and a small mean face/sensor recessed between plates. Hazard red/dark steel/cream with restrained cyan machinery accent. It must not be an enlarged Trash Brute.

**Mechanic readability:** charge wind-up draws the ram back and braces the chassis; aimed-shot state exposes/raises a small launcher/pressure port; below-half-health enraged state increases visible vibration/heat accent through a runtime phase treatment or dedicated reviewed clip, not a permanent palette swap.

**Canvas:** start with 64×64 pixel source; move to 96×96 only if the jaw/piston silhouette cannot remain readable without clipping. Never use 313×313 AI-image frames as final production cells.

## 11.10 Forge Warden — boss

**Read:** mobile furnace/gantry custodian; controls the field and calls reinforcements.

Taller furnace/gantry silhouette than Crusher: central furnace core/body, two asymmetric articulated tool arms, overhead vent/hood and heavy base legs. Charcoal/gunmetal with white-hot cream, copper/orange furnace bands and small cyan control nodes. Must not share Crusher's horizontal jaw silhouette.

**Mechanic readability:** aimed-shot arm locks forward; charge lowers the gantry/body; summon state raises a signal/tool arm; phase escalation at overheat/meltdown visibly opens vent shutters and exposes more hot core. Runtime timing remains authoritative.

**Canvas:** start at 64×64; use 96×96 only if needed for tool-arm silhouette. Keep animation center pinned despite articulated limbs.

### Enemy silhouette acceptance

Black-fill matrix: Mite = round; Rusher = wedge; Brute = square; Sniper = tall tripod; Skitter = low lateral crescent; Beetle = dome + front wall; Nester = rear-heavy nest; Shard Bot = fractured diamond; Crusher = horizontal compactor jaw; Warden = furnace gantry. Every pair must be nameable at expected runtime display size.

---

# 12. Pickups — 4 sheets

1. **XP (`drop:xp`):** tall seed/diamond, pointed top/bottom, white center, sky-blue upper facets, teal lower facet; four-frame fixed-center shimmer. Never a round orb, coin or weapon light.
2. **Scrap (`drop:scrap`):** low irregular bundle with one obvious tyre/bolt/plate cue, silver steel + rust; four-frame tiny settling/glint motion. Never cyan/blue like XP.
3. **Chest (`drop:chest`):** squat wide purple box with gold corner hardware and dark hinge; four-frame one-pixel pulse. Must read wider/lower than weapon crate.
4. **Weapon (`drop:weapon`):** tall strapped gold/orange case with dark weapon-shaped mark and cyan latch; four-frame subtle latch/pulse. Must not be a chest recolor.

Review all four together over the darkest and busiest arena backgrounds. Their silhouettes must remain distinct without color. Any confusing runtime object (including the acceptance cyan/green 'lollipop') is a runtime/asset-binding investigation under #164, not a reason to weaken these category rules.

---

# 13. World — 15 current assets

World art is quieter/darker than actors and pickups. Decoration may imply material and history but may not imply collision where none exists.

## Floor tiles

1. **Junkyard base 32×32:** large dark steel/concrete plates with sparse seams/rivets; seamless; no focal mark.
2. **Patch A 32×32:** one larger repaired plate/diagonal welded seam; same average value as base.
3. **Patch B 32×32:** different plate break + a few small bolts/scuffs; no repeated diagonal matching Patch A.

Variants must disappear into a field at a glance rather than forming an obvious checkerboard.

## Boundary tiles

4. **Straight 32×32:** continuous stacked scrap barrier with one clear inner edge; collision boundary visually honest.
5. **Corner 32×32:** turns the same inner edge cleanly; no decorative overhang into playable lane.
6. **Patch 32×32:** repaired/dented straight section retaining exactly the same passability read.
7. **Gate 32×32:** authored monster-chute/gate opening language that clearly belongs to the wall system; gameplay path must match collision/spawn semantics.

## Decorative props

8. **Tyre pile 24×18:** two/three large tyre rings, dark rubber with one steel rim; low non-colliding pile.
9. **Crate 22×22:** squat salvaged wooden/metal crate with broad X/strap geometry but no text.
10. **Engine block 32×24:** chunky rectangular motor, two large cylinders/vents and rust footings; clearly machinery, not chest/pickup.
11. **Scrap heap 40×24:** three/four large recognizable masses—pipe, plate, wheel edge—rather than pixel noise.
12. **Oil stain 36×20:** irregular very-dark ground decal, soft shape expressed with flat clusters; never hazard-colored.
13. **Warning sign 20×30:** battered sign plate on short post, abstract hazard stripe/shape only; no tiny text or copied real-world logo.

## Landmarks

14. **Hanging press 48×64:** tall overhead workshop press/crane silhouette; clear narrow physical footprint; decorative upper overhang must not misrepresent collider.
15. **Power stack 48×64:** stacked barrels/cells/generator modules with large cable and one cyan power node; footprint aligned to real collision area.

**Forge chapter note:** current stages still use `junkyard-lot` and the same core bundle. Do not invent a fake second arena solely in art. Forge-specific dressing may be added later through the existing data/bundle architecture once there is an authoritative way to compose it.

---

# 14. Stage / chapter presentation — 8 logical pieces

Do not commission ten unrelated stage paintings. Current architecture composes stages from chapter + arena + objective + boss data, so cards should compose reusable art too.

1. **Junkyard chapter emblem:** bent gate/stacked scrap silhouette around a central paw-route marker; dark steel/rust/teal.
2. **Forge chapter emblem:** furnace hood + anvil/vent silhouette around hot core; not a generic flame badge.
3. **Junkyard Lot location card:** 96×64 or similarly crop-safe pixel scene showing floor plates, boundary, hanging press/power stack and open movement lane; no actors/text baked in.
4. **Objective: Kill:** hostile enemy silhouette + clear count/tally slash motif, no numeric text.
5. **Objective: Collect:** scrap pickup entering a small collection tray/marker.
6. **Objective: Survive:** workshop timer/clock protected by a small ring, not an hourglass fantasy symbol.
7. **Objective: Defeat:** large boss silhouette/ram mark with one decisive strike/check cue.
8. **Boss-stage marker:** compact industrial skull/ram-warning emblem used as an overlay; distinct from achievement badges.

Locked/cleared/selected state is expressed by reusable UI state overlays, not separate stage paintings.

---

# 15. Global menu / navigation art

## Brand art

1. **Meowcenary title lockup:** bespoke chunky pixel lettering with one subtle scrap-metal/paw/bolt motif. Must remain readable at desktop and portrait widths. Keep accessible title text available separately; the image is not the only semantic source.
2. **Menu backdrop:** crop-safe workshop dispatch-board/junkyard shelter environment: dark bench/metal wall, hanging cables/tools, a distant yard opening. Leave quiet central/upper regions for UI. No baked buttons or readable text.

## Navigation icons

Use one 24×24 riveted-tab family. Labels remain text; icons accelerate recognition.

3. **Stages/Contracts:** route card with objective marker/check notch.
4. **Characters:** simple mercenary head/ear silhouette inside roster frame.
5. **Progression/Goals:** dispatch route/map with one forward goal pin. This asset remains conditional on #165's product decision; if the redundant Progression screen is removed, retire the icon rather than preserving the screen to justify art.
6. **Gunsmith:** wrench + modular receiver/barrel connection, not generic crossed tools.
7. **Equipment:** four-slot armored torso/helmet arrangement.
8. **Achievements:** junkyard medal/patch.
9. **Settings:** cog with one speaker/motion notch; simple system symbol.
10. **Compendium:** battered field-guide plate/book with small monster-eye silhouette.
11. **Golden Run / Classic:** circular endurance dial around Junkyard gate; explicitly different from Stages/Contracts.

---

# 16. Reusable UI chrome and state art

These are deliberately reusable, not per-screen decoration.

1. **Primary panel 9-slice:** dark sheet-metal/workbench panel with restrained riveted corners; center low-noise.
2. **Card frame:** slightly lighter inset plate with corner notches; supports characters, upgrades, equipment, achievements and Compendium cards.
3. **Focus/selected frame:** bright cream/cyan corner brackets or welded highlight; visible in grayscale through thickness/shape, not color alone.
4. **Locked overlay:** chunky padlock/closed latch, translucent backing handled by runtime.
5. **Disabled overlay:** broken/dim plate treatment; do not bake opacity into every asset.
6. **Scroll track:** narrow dark recessed rail.
7. **Scroll thumb:** chunky riveted slider tab large enough to remain visible on touch layouts.
8. **Tab/chip frame:** compact clipped-corner plate for filters.
9. **Tooltip frame:** small speech/inspection plate with one pointer notch; text remains rendered.
10. **Modal/result frame:** stronger central plate with wide header rail and clear button/footer zone.
11. **Selection chevron/cursor:** bold scrap-arrow bracket used for keyboard/controller focus where frame alone is insufficient.
12. **State marker family:** four symbols sharing one small badge backing: NEW/spark, unlocked/open latch, complete/check, boss/hazard. Avoid baked English words.
13. **Merge icon:** two matching modules/weapon cards converging into one upward result module.
14. **Contract cleared emblem:** open gate/check stamp shape; triumphant but compact.
15. **Contract failed emblem:** cracked contract plate/broken route marker; not gore/skull punishment.

---

# 17. Stat / comparison glyphs — 16

Use 16×16 or 20×20 high-contrast schematic glyphs. These appear in character, equipment and Gunsmith comparisons; one semantic concept gets one glyph everywhere.

1. `maxHealth` — heart-like repair core inside armor plate; not a realistic heart.
2. `moveSpeed` — forward paw/boot with one speed notch.
3. `damage` — impact burst striking scrap plate.
4. `attackSpeed` — rotating firing gear/gauge with fast tick.
5. `range` — outward arrow/range line from small muzzle point.
6. `projectileSpeed` — single projectile with long motion streak.
7. `spreadDeg` / accuracy — narrowing/fanning three-line cone; UI changes label based on sign, icon stays accuracy/spread.
8. `pickupRadius` — small pickup inside widening collection ring.
9. `currencyGain` — scrap bolt/bundle with plus spark; reuse scrap silhouette.
10. `xpGain` — XP seed with plus/up chevron.
11. `projectileCount` — one-to-three projectile cluster.
12. `pierce` — projectile through plate.
13. `knockback` — enemy block pushed by broad impact arrow.
14. `cooldown` — circular workshop timer with missing wedge.
15. `healing` — repair core receiving one droplet/patch spark.
16. `protection` / invulnerability — complete hex shield around center point.

Do not make an icon for every textual stat combination; compose these primitives.

---

# 18. HUD, controls and settings

## HUD-specific glyphs

Reuse XP, scrap, objective and ability art where available. Only three extra HUD concepts are needed:

1. **Health meter marker:** small repair-core/plate glyph matching `maxHealth`.
2. **Run timer:** compact workshop stopwatch/dial.
3. **Kills:** defeated hostile-eye/target tally mark; avoid a human skull.

The HUD should not become a row of decorative icons; meter/readability remains primary.

## Device-neutral action glyphs

The logical action model owns semantics; art never hard-codes Xbox/PlayStation button identity.

1. **Move:** four-direction compact stick/paw arrows.
2. **Confirm:** strong check/press-in symbol.
3. **Back:** bent return arrow.
4. **Dash:** short forward burst/boot wedge.
5. **Ability:** generic powered hex/star slot; character-specific ability icon can sit inside/above it.
6. **Pause:** two chunky bars in a metal button plate.
7. **Inventory/Rack:** three small weapon-slot rectangles in a tray.

Touch buttons use large runtime hit plates with these icons. Keyboard/controller hints overlay the actual resolved key/button label rather than baking a platform controller diagram into the asset.

## Settings glyphs

1. **Master mute/audio:** speaker with removable/overlay slash state.
2. **Music:** simple workshop-speaker + music-note motif.
3. **SFX:** small impact/spark burst from metal plate.
4. **Reduced motion:** three motion ticks crossed by a calm/still ring; avoid medical/accessibility symbolism that is unclear.
5. **Fullscreen:** four outward corner brackets.

Runtime text/value controls remain authoritative.

---

# 19. Compendium art reuse

The Monster Compendium under #168 defaults to the **same approved enemy/boss sheets** in Section 11, rendered at crisp integer scale with real idle animation. It does not create a parallel portrait pipeline.

Dedicated monster portrait art is optional and may only be commissioned after the enlarged production sprite has been reviewed in the final Compendium layout and found materially insufficient. If used, the portrait is keyed to the same enemy ID and follows the complete brief → concept → Pixelorama → builder → validation pipeline.

Unseen entries use a derived black silhouette/masked sprite plus the reusable locked/unknown treatment; do not draw fake mystery monsters.

---

# 20. Art binding and file conventions for new presentation assets

Exact runtime `kind` unions should be extended only by the implementation architecture, but stable logical IDs should follow domain semantics rather than screen locations. Recommended identity patterns:

```text
character-portrait:<character-id>
ability-icon:<ability-id-tail>
passive-icon:<passive-id>
equipment-icon:<equipment-id-tail>
equipment-set-icon:<set-id-tail>
gun-part-icon:<part-id-tail>
gun-slot-icon:<slot>
trait-icon:<trait-id-tail>
achievement-icon:<achievement-id-tail>
objective-icon:<objective-type>
chapter-icon:<chapter-id-tail>
arena-card:<arena-id>
nav-icon:<destination>
stat-icon:<stat>
action-icon:<logical-action>
ui-chrome:<name>
```

Do not rename existing shipped gameplay IDs merely to make art IDs look symmetrical. Cross-references must validate generically.

Editable sources live under `assets-src/`; runtime exports under `public/assets/`. Major new families should have deterministic builders and preview/contact-sheet output. UI primitives may use a reviewed generalized atlas/builder if that reduces meaningless one-file-per-icon boilerplate while preserving source reproducibility.

---

# 21. Production order

1. **Audit/current contact sheet:** render every current manifest binding and mark `approved`, `polish`, `placeholder/duplicate`, `missing`.
2. **Roster silhouette board:** all 8 characters + 8 ordinary enemy archetypes + 2 bosses in black-fill at runtime scale.
3. **Characters and enemies:** replace placeholder/duplicate/313px-expanded art first.
4. **Weapons/projectiles/pickups:** confirm combat readability after new actors exist.
5. **Semantic icon system:** stat/action/slot/trait primitives first, then abilities/passives/upgrades.
6. **Gunsmith and equipment:** use the frozen component/set shape languages.
7. **Achievements + stage/chapter art.**
8. **Menu backdrop/brand/chrome/nav.**
9. **World polish.**
10. **Full integrated phone/desktop visual review.**

Art can be produced while #164/#166 runtime remediation proceeds, but final in-game approval must use the stable post-remediation candidate so freezes/camera defects do not invalidate visual conclusions.

---

# 22. Automated and reproducibility gates

Extend generic art validation instead of accumulating per-ID scripts. Before this production pass closes, validation should catch:

- every release content definition that requires art resolves exactly one approved binding;
- missing `.pxo`, builder, export or manifest entry;
- wrong frame size/count/tag/layer contract;
- trimmed/shifted actor frames and measurable anchor drift where feasible;
- hidden notes/shadow/guide leakage;
- malformed metadata or unexpected smoothing/sampling configuration;
- stale presentation art IDs;
- distinct release actors/items with byte-identical exports unless explicitly allow-listed with written rationale;
- known placeholder/fallback exports still referenced by release content;
- orphaned final exports/sources;
- asset-bundle omissions;
- concept/reference images accidentally wired as runtime assets.

Run `npm run art:validate`, `npm run content:validate`, lint, ordinary tests and build after art/runtime integration.

---

# 23. Iterative review record and closure

This packet was revised through independent review passes before being committed.

## Pass 1 — completeness / current-game coverage

**Findings resolved:**

- Initial inventory missed `projectile:default`; added the fourth projectile brief and corrected the runtime baseline to 77 logical bindings.
- Menu art scope was too narrow; added settings, touch/controller actions, HUD, inventory/merge and result-state art.
- Alpha 3 management screens lacked dedicated physical-component art; added 32 equipment icons, 12 Gunsmith parts, slot/trait/set primitives, ability/passive art and achievement badges.
- Stage art risked exploding into one painting per stage; replaced that with architecture-aligned chapter + arena + objective + boss composition.
- Compendium could have created duplicate portraits; defaulted it to reuse approved runtime monster sheets.

**Result:** no known player-facing current-game art category remains unplanned.

## Pass 2 — silhouette and semantic distinguishability

**Findings resolved:**

- Three feline characters risked reading alike; froze compact Tabby / tall ear-tufted Lynx / muscular low-eared Cougar silhouettes and separate palettes/outfit masses.
- Bolt Hound, Scrap Weasel and Piston Ram needed stronger non-feline reads; froze quadruped runner / long stooped satchel / horn-arc automaton silhouettes.
- Expanded enemy designs risked stat-skin variation; froze behavior-first shapes for ranged, flanker, shielded, spawner and splitter enemies.
- Upgrade/ability/passive icon collisions were identified and explicitly separated: Quick Paws vs Run and Gun; Scrap Magnet vs Magnet Belly vs Scavenge Pulse; Hot vs Long Barrel; Precision Mark vs Pistol Deadeye; Overclock ability vs SMG Overclock.
- Equipment sets risked becoming palette swaps; each now owns a construction motif and slot-specific silhouette.

**Result:** every actor/family has a primary black-silhouette cue and all known semantic icon collisions have explicit counter-designs.

## Pass 3 — production feasibility and reproducibility

**Findings resolved:**

- Existing 313×313 expanded-actor sheets were at risk of becoming precedent; ordinary actors are returned to the disciplined pixel contract and boss canvas expansion is deliberate/bounded.
- Boss size was initially over-constrained; changed to a reviewed 64×64 starting canvas with 96×96 allowed only when silhouette evidence requires it.
- Requiring a bespoke builder file for every tiny UI glyph would create boilerplate; generalized deterministic icon/atlas builders are allowed if source/export reproducibility remains provable.
- World sampling cannot safely be changed from linear to nearest on principle alone; final rule now requires actual FIT/native-scale comparison and one consistent documented decision.

**Result:** every family has a feasible source/export route without legitimising generated-image runtime assets.

## Pass 4 — UX, accessibility and real-scale readability

**Findings resolved:**

- Color-only differentiation was too weak; grayscale/silhouette gates were added for actors, tiers and equipment sets.
- Reduced-motion behavior was missing for enlarged/animated collection art; Compendium/runtime presentations must be able to show stable first frames when motion is reduced.
- Platform-specific controller glyphs would violate the shared action model; action icons are device-neutral and runtime overlays resolved key/button labels.
- Stage/menu art could bury text/focus; backdrops/chrome now require low-noise content areas and focus state has shape/thickness, not color alone.

**Result:** planned art supports 390×844, desktop, grayscale, focus visibility and reduced-motion presentation.

## Pass 5 — originality, legal and visual coherence

**Findings resolved:**

- Medic imagery could accidentally use the protected Red Cross emblem; replaced with an original bandage-knot + pulse-bead vocabulary.
- Realistic firearm silhouettes and modern military insignia/camo were explicitly rejected.
- Generic genre/fantasy motifs were replaced with workshop-specific clocks, gates, salvage tools, patched panels and improvised powered modules.
- Grim-Reaper/skull shorthand was avoided where unnecessary; achievements/results use Meowcenary-specific salvage/contract symbols.

**Result:** the packet describes Meowcenary in its own visual vocabulary and preserves the existing originality guardrails.

## Pass 6 — independent implementer / ambiguity review

Questions applied to every family:

- Can an artist identify the dominant silhouette without asking what the object is for?
- Can an implementer tell which existing gameplay ID owns the art?
- Is the intended size/animation/source path class clear?
- Is there at least one explicit “must not become” or collision rule where ambiguity is credible?
- Is the asset reused rather than duplicated when another screen needs the same semantic object?
- Can validation prove that the final export is the reviewed one?

**Final result:** no material unresolved brief ambiguity, coverage gap, semantic collision, originality concern or production-path gap remains. Later changes in shipped content must extend this matrix rather than silently falling outside it.
