# Alpha 3 Mercenary Identity and Unlock Cadence

**Status:** reviewed character-product target for #171/#167.

**Baseline:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

The current roster already has eight stable characters, eight active abilities and three starting weapon families. The goal is **not** to replace that work with a class system or bespoke per-character engine. The goal is to make each Mercenary create a different reason to replay and to stop unlocking several roster entries at once.

The product test is:

> If names and art are hidden, can a player still describe why they would choose this Mercenary for the next Contract?

---

# 1. Architecture boundary

Keep:

- stable character IDs;
- data-defined base stats;
- data-defined starting weapon IDs;
- shared `ProgressionCondition` unlocks;
- registered active ability IDs;
- static passive modifier vocabulary;
- one logical `ability` action across touch/keyboard/controller.

Do not add:

- character-ID branches in `GameScene`;
- a second character skill tree;
- per-character currencies;
- squad composition;
- multiple active ability buttons;
- a generic scripting language merely for character flavor.

A new active/passive primitive is justified only by a concrete future Mercenary fantasy that cannot use the current vocabulary.

---

# 2. Current unlock-cadence defect

The current facts cluster unlocks too tightly.

## First win cluster

A win:

- completes `achievement:first-victory` → Bolt Hound;
- records 100 Scrap Tabby mastery XP;
- tier is `floor(xp / 100)`, so Scrap Tabby immediately reaches mastery tier 1 → Piston Ram.

The same early play may also reach 25 lifetime kills → Volt Lynx.

Result: the starter can receive 2–3 new Mercenaries almost at once.

## Scrap Crusher cluster

Current definitions make all of these true from essentially the same boss clear:

- Brass Boar: `boss-defeated boss-crusher`;
- Ember Cougar: `stage-cleared stage:junkyard-05`;
- Rattle Raptor: `boss-defeated boss-crusher`.

Result: three more Mercenaries arrive as one bookkeeping event instead of three anticipation beats.

This is mechanically valid but poor collection pacing.

---

# 3. Frozen Alpha 3 unlock cadence

Preserve stable character IDs; change only data conditions.

| Mercenary | Target unlock | Why here |
| --- | --- | --- |
| Scrap Tabby | `always` | starter / baseline |
| Bolt Hound | `achievement:first-victory` | immediate first-clear reward |
| Volt Lynx | `achievement:kill-milestone-25` | early combat milestone, independent of stage order |
| Piston Ram | Scrap Tabby mastery **tier 2** | rewards choosing the starter again instead of duplicating First Victory |
| Rattle Raptor | clear `stage:junkyard-04` | pre-boss reward and precision option for Crusher |
| Brass Boar | defeat `boss-crusher` | thematic boss-milestone bruiser |
| Scrap Weasel | `achievement:kill-milestone-100` | medium-term collection/economy unlock |
| Ember Cougar | clear `stage:forge-01` | first Forge clear reveals the elemental/heat specialist |

No new condition kinds are required.

### Expected rhythm

A normal new save should experience approximately:

```text
starter
↓ first clear
Bolt Hound
↓ early kills
Volt Lynx
↓ second Scrap Tabby win if player likes the starter
Piston Ram
↓ Junkyard 4
Rattle Raptor
↓ Crusher
Brass Boar
↓ lifetime combat
Scrap Weasel
↓ first Foundry clear
Ember Cougar
```

Exact timing varies with character choice and kill pace; that variance is desirable.

---

# 4. Mercenary theses

The identity thesis is frozen. Balance values may move with evidence.

## 4.1 Scrap Tabby — adaptable starter / space maker

Current core:

- balanced 100 HP / 175 movement;
- Scrap Pistol;
- `Scrap Burst` knockback;
- modest pickup-radius passive.

**Thesis:** forgiving generalist who creates breathing room and makes early collection comfortable.

**Keep.** The pickup passive overlaps Scrap Weasel numerically, but the full kits do not: Tabby has modest passive collection + emergency knockback; Weasel is an extreme collection specialist whose active directly vacuums drops.

Do not buff Tabby into the best economy character merely because it is the starter.

## 4.2 Bolt Hound — reckless tempo / self-sustain

Current core:

- lowest HP (80);
- highest base movement (205) + Quick Tail;
- Can SMG;
- `Giga Chomp` instant heal.

**Thesis:** move aggressively, take risks, recover the mistake and keep firing.

This is intentionally distinct from Volt Lynx: Bolt's speed supports **tempo and recovery**, not pure avoidance.

Presentation should make the heal feel like a clutch sustain action, not a generic green number.

## 4.3 Volt Lynx — pure reposition / kiting

Current core:

- 85 HP;
- 200 movement + Light Paws;
- Scrap Pistol;
- `Adrenaline` movement burst.

**Thesis:** safest positional specialist; wins by being somewhere else before the danger lands.

Keep the low durability so Adrenaline is a decision, not redundant excess speed.

Do not give Volt a heal or invulnerability; that would collapse the Bolt/Brass distinction.

## 4.4 Piston Ram — overclocked sustained fire

Current core:

- 105 HP / 165 movement;
- Can SMG;
- attack-speed passive;
- `Overclock`: major fire-rate + movement burst.

**Thesis:** turns a steady automatic weapon into a temporary bullet hose.

The later mastery-tier-2 unlock makes this feel like a reward for understanding the base game rather than another First Victory popup.

Keep Overclock visually loud enough that activation is unmistakable.

## 4.5 Rattle Raptor — precision / penetration window

Current core:

- 92 HP / 172 movement;
- range passive;
- `Precision Mark`: damage + pierce burst.

**Change one data row:** starting weapon becomes **Scrap Pistol T1**, not Can SMG T1.

Reason:

- the stated fantasy is precision hunter;
- Pistol already has Deadeye/Needle family cards that reinforce precision/pierce;
- SMG is already the starting family for Bolt Hound, Scrap Weasel and Piston Ram;
- changing the starting weapon uses existing content and makes Rattle's identity legible from second one.

**Thesis:** deliberate long-line shots that become dangerous penetration volleys during Precision Mark.

Do not add manual aiming; automatic targeting remains the product rule.

## 4.6 Brass Boar — tank / panic immunity

Current core:

- 135 HP / 145 movement;
- Bolt Shotgun;
- extra-health passive;
- `Shield Flicker` brief invulnerability.

**Thesis:** slow close-range bruiser who can deliberately cross a dangerous moment instead of dodging it.

This is the strongest accessibility/forgiveness option for players who dislike fragile speed characters.

Keep the mobility downside meaningful.

## 4.7 Scrap Weasel — collection / economy specialist

Current core:

- 90 HP / 185 movement;
- Can SMG;
- +30 pickup radius;
- `Scavenge Pulse` collects nearby XP/Scrap.

**Thesis:** converts dangerous loose resources into faster build/economy momentum.

Unlike Scrap Tabby, Weasel should feel like choosing collection is the whole strategy. The UI should show the large pickup/pulse identity clearly.

Watch interaction with Scavenger Equipment + Extra Scrap during tuning; the combination is allowed to be strong, but should cost enough immediate combat power that it is not universally correct.

## 4.8 Ember Cougar — close elemental burst

Current core:

- 95 HP / 180 movement;
- Scrap Pistol;
- +5% damage;
- `Heat Vent` nearby damage burst.

**Thesis:** plays closer to danger to convert positioning into an area-damage moment.

The universal enemy-death boundary from the Compendium prerequisite must make Heat Vent kills fully authoritative.

Do not silently turn Heat Vent into the same persistent FIRE/burn trait as Pyro/Gunsmith unless playtest specifically justifies it. Its current instant area burst is already a distinct mechanic.

---

# 5. Starting-family distribution after the Rattle change

```text
Pistol
- Scrap Tabby
- Volt Lynx
- Rattle Raptor
- Ember Cougar

SMG
- Bolt Hound
- Scrap Weasel
- Piston Ram

Shotgun
- Brass Boar
```

This is acceptable for Alpha 3 because the **ability/passive identity**, not equal family cardinality, is the goal.

Do not move another character to Shotgun merely to make the table symmetrical. Add future Mercenaries based on fantasies, not spreadsheet balance.

---

# 6. Character-select information requirements

The Mercenary screen from `alpha-3-player-flow-and-ui-spec.md` should make these differences visible before selection.

Each card/detail exposes:

```text
portrait/actor art
identity thesis (one sentence)
health / movement relative to baseline
starting weapon art
passive art + concise effect
active ability art + concise effect + cooldown
unlock/mastery state
```

Do not lead with a paragraph of raw stats.

The user should be able to compare Bolt Hound and Volt Lynx and immediately see:

```text
Bolt = fast SMG + heal/recovery
Volt = fast pistol + even more repositioning
```

Similarly:

```text
Tabby = balanced + knockback breathing room
Weasel = dedicated collection vacuum
```

---

# 7. Ability pacing and visibility

Current cooldowns are 8–18 seconds. That is appropriate for ~2–3 minute Contracts because abilities can matter repeatedly rather than becoming once-per-run ultimates.

Do not globally lengthen cooldowns simply to make abilities feel more “special.” Their role is active movement/combat agency in an auto-fire game.

Pass conditions:

- activation has immediate visual/audio feedback;
- cooldown state is readable in the HUD without text-only dependence;
- reduced motion retains a clear non-motion cue;
- a typical successful 120s stage allows several legal activations;
- no ability continues ticking behind pause/extraction/terminal UI;
- direct-damage ability kills use the universal enemy death boundary.

---

# 8. Balance guardrails

Do not force perfect parity before playtesting.

Watch specifically:

- Bolt Hound heal + speed making low HP irrelevant;
- Volt Lynx total movement trivializing Charger/Boss tells;
- Brass Boar health + Juggernaut Equipment becoming effectively unkillable;
- Scrap Weasel + Scavenger + Extra Scrap becoming the dominant progression choice;
- Piston Ram + SMG Overclock + Commando/Technician creating performance/readability problems;
- Rattle Raptor Precision Mark + pistol Needle/Punch Through creating excessive pierce; dedupe/caps remain authoritative;
- Ember Heat Vent on dense spawns after the shared death boundary is fixed.

These are playtest hypotheses, not reasons to pre-nerf the characters.

---

# 9. Extensibility gate

Character N+1 remains:

```text
one CharacterDefinition
+ existing AbilityDefinition or registered reusable ability kind
+ static/registered passive
+ actor/portrait/ability/passive art
+ ProgressionCondition
```

Generic roster/read-model/scroll tests instantiate Character 20 without controller/scene source edits.

A release-specific roster-count assertion may intentionally change when a release adds a Mercenary; generic systems may not assume eight.

---

# 10. Acceptance

The roster product pass is not complete until real play can answer, for every Mercenary:

1. what is this character trying to do differently?
2. can I feel the active ability without reading logs?
3. does the starting weapon reinforce the fantasy?
4. is there at least one obvious reason to replay a cleared Contract with this character?
5. does choosing it change movement/build priorities rather than only final DPS?

If two characters still receive the same answers after hiding their names/art, revise **data values/starting family first**, then current ability/passive composition, before adding a new mechanic primitive.