# Alpha 3 Achievement badge concept board

## Generation brief

Use case: stylized-concept. Asset type: production exploration board for eleven
32px Meowcenary Achievement badges. Create a cohesive 4x3 sheet of industrial
junkyard medal/patch designs covering hidden, first defeat, 25 defeats, 100
defeats, first weapon merge, Crusher Down, Junkyard Champion, First Victory,
Scrap Tabby mastery, Scrap Tycoon, and Warden Down. Use dark gunmetal,
workshop steel, cream, restrained cyan and copper/orange accents. Give every
badge one bold central silhouette that survives grayscale. Avoid text,
numbers, skulls, crowns, copied warning logos, military insignia, watermarks,
and tiny decorative noise. Keep the Forge Warden badge vertically fractured
and distinct from the Crusher compactor jaw and intact chapter imagery.

## Preserved candidates

- `direction-b-selected.png` — SHA-256
  `cfad6ea94cc2e0085255c7fd8831355b085bc111691120e6f9be6b505d7b700f`.
- `direction-a-rejected.png` — SHA-256
  `866c3e3773e9012bbcc27c519309f3564a752aea4870c53245e96017dd13cd70`.

Direction B was selected for its disciplined dark workshop frame, stronger
cyan/orange role separation, broad silhouettes and clearer Crusher/Warden
contrast at thumbnail scale. Direction A was rejected because its painterly
gold trim and incidental debris become noisy at 32px and drift from the
established runtime material language.

The untouched boards preserve provenance. The selected board is also the
production master for the large Career badges:
`build-achievement-concept-atlas.py` deterministically crops the eleven
approved tiles into the editable PXO and runtime atlas without repainting or
regenerating them.
