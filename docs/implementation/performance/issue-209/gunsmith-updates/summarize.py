#!/usr/bin/env python3
"""Reproduce the descriptive comparison; no wall-clock acceptance thresholds."""
import argparse
import gzip
import json
import statistics
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--candidate', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--candidate-sha', required=True)
args = parser.parse_args()
def load(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)
baseline, candidate = load(args.baseline), load(args.candidate)
assert baseline['exit'] == candidate['exit'] == 0
assert baseline['measurementSHA'] == 'f61d1231c72e8dc69cf543b3a673c4e16400915a'
assert candidate['measurementSHA'] == args.candidate_sha
assert baseline['sourceHEAD'] == baseline['measurementSHA']
assert candidate['sourceHEAD'] == candidate['measurementSHA']
assert baseline['method']['repeats'] == 3 and baseline['method']['windowMs'] == 3000
assert baseline['environment'] == candidate['environment']
assert baseline['method'] == candidate['method']
assert len(baseline['cohorts']) == len(candidate['cohorts']) == 9
for left, right in zip(baseline['cohorts'], candidate['cohorts']):
    assert left['profile'] == right['profile'] and left['repeat'] == right['repeat']
    assert left['fixture'] == right['fixture']
    assert not left['errors'] and not right['errors']
    assert len(left['actions']) == len(right['actions']) == 27
    assert [a['name'] for a in left['actions']] == [a['name'] for a in right['actions']]

def cohorts(run, profile):
    return [c for c in run['cohorts'] if c['profile']['name'] == profile]
def actions(run, profile, name):
    return [next(a for a in c['actions'] if a['name'] == name) for c in cohorts(run, profile)]
def spread(values):
    return f'{statistics.median(values):.1f} [{min(values):.1f}–{max(values):.1f}]'
def numeric(values):
    return '/'.join(str(v) for v in values)
def event(action):
    matches = [e for e in action['state']['events'] if e['owner'] in ('menu.render', 'menu.update')]
    assert len(matches) == 1 and matches[0]['facts']['committed'] is True
    return matches[0]
profiles = list(dict.fromkeys(c['profile']['name'] for c in baseline['cohorts']))
lines = ['# Repeated comparison', '',
    f"Immediate baseline runtime: `{baseline['measurementSHA']}`.",
    f"Measured candidate runtime: `{candidate['measurementSHA']}`.", '',
    'All times are milliseconds. Cells show median [minimum–maximum] of three repeats.',
    'These are descriptive results, not performance acceptance thresholds.', '',
    '## Action latency to the actually presented frame', '',
    '| Profile | Action | Baseline | Candidate |', '|---|---|---:|---:|']
for profile in profiles:
    for name in ['cold-usable-home','equipment-entry','equipment-select','equipment-equip',
                 'equipment-blueprint-select','equipment-fabricate','gunsmith-entry','gunsmith-build-switch','gunsmith-build-select',
                 'gunsmith-part-replace','menu-prepared-game','warm-equipment-entry','warm-gunsmith-entry']:
        values = [spread([a['durationMs'] for a in actions(run, profile, name)]) for run in (baseline,candidate)]
        lines.append(f'| {profile} | {name} | {values[0]} | {values[1]} |')
lines += ['', '## Gunsmith body ownership', '',
    '| Profile | Runtime | Presentation owner | Created | Destroyed | Stable objects | Textures | Owner span |',
    '|---|---|---|---|---|---|---|---:|']
for profile in profiles:
    for name in ['gunsmith-build-switch','gunsmith-build-select','gunsmith-part-replace']:
        lines.append(f'| {profile} | {name} | | | | | | | |')
        for label, run in [('baseline',baseline),('candidate',candidate)]:
            es = [event(a) for a in actions(run,profile,name)]
            assert len(set(e['owner'] for e in es)) == 1
            facts = [e['facts'] for e in es]
            cells = [numeric([f[k] for f in facts]) for k in ['created','destroyed','stableObjects','textures']]
            lines.append(f"| {profile} | {label} | {es[0]['owner']} | {' | '.join(cells)} | {spread([e['durationMs'] for e in es])} |")
lines += ['', '## Cadence', '',
    'p50/p95/p99 below are medians of each repeat’s nearest-rank percentile; they are not pooled percentiles.',
    'Count, worst-frame and over-budget ratio retain all three repeats. The budget is 16.67ms.', '',
    '| Profile | Window | Runtime | Samples | p50 | p95 | p99 | Worst per repeat | Over budget per repeat |',
    '|---|---|---|---|---:|---:|---:|---|---|']
for profile in profiles:
    for name in ['warm-home','light-combat','heavy-combat']:
        for label, run in [('baseline',baseline),('candidate',candidate)]:
            rows = [a['state']['frame'] for a in actions(run,profile,name)]
            for a in actions(run,profile,name):
                if name != 'warm-home':
                    assert a['state']['run']['status'] == 'active'
                if name == 'heavy-combat':
                    assert a['state']['run']['fixture']['spawned'] == 48
            percentiles = [f"{statistics.median(f[k] for f in rows):.1f}" for k in ['p50Ms','p95Ms','p99Ms']]
            worst = '/'.join(f"{f['worstMs']:.1f}" for f in rows)
            over = '/'.join(f"{f['overBudgetSamples']}/{f['sampleCount']} ({100*f['overBudgetRatio']:.1f}%)" for f in rows)
            lines.append(f"| {profile} | {name} | {label} | {numeric([f['sampleCount'] for f in rows])} | {' | '.join(percentiles)} | {worst} | {over} |")
lines += ['', '## Environment and limitations', '',
    '```json', json.dumps(baseline['environment'],indent=2), '```', '',
    '- Three fresh contexts per profile; identical catalog/save/seed fixtures and runner, sequential baseline then candidate.',
    '- Local Vite preview and unthrottled transfer; CPU4x is emulation, not a calibrated physical phone.',
    '- Three-second combat windows are bounded comparisons, not long-run playtests. Sparse foldable samples limit percentile precision.',
    '- Background host load and baseline-first ordering are uncontrolled; timing differences outside the changed action are not attributed to this implementation.',
    '- Both runtimes use the same strengthened runner: actual Pistol → SMG → Pistol durable switches, then receiver replacement. Earlier reports measured reselection; timings are not compared across that changed method.',
    '- Probe object walks/polling can perturb scheduling. Local owner timing excludes its eligibility guard; whole-action latency includes it.',
    '- Raw frame cadence includes rendering/compositor scheduling. It is distinct from smoothed gameplay delta and does not by itself establish a simulation CPU bottleneck.',
    '- The raw historical baselineSHA field names Phase A; the immediate control is the measurementSHA pinned above.',
    '- No Figma, physical-device, fun, economy or native-packaging acceptance is inferred from these measurements.', '']
args.out.write_text('\n'.join(lines))
print(f'Wrote {args.out}; matched 18 cohorts / 486 checkpoints')
