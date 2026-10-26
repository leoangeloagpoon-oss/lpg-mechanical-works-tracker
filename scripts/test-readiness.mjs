import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { levelLabel } from '../app/model.ts';

const dir = path.resolve('.sites-runtime/readiness-tests'); mkdirSync(dir, { recursive: true });
const code = ts.transpileModule(readFileSync('app/prerequisites.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace("from './model'", "from '../../app/model.ts'");
writeFileSync(path.join(dir, 'prerequisites.mjs'), code);
const p = await import(pathToFileURL(path.join(dir, 'prerequisites.mjs')));

const base = { id: 'a', projectId: 'p', name: 'Work A', area: 'Floor 01', responsible: '', start: '', end: '', status: 'Not started', mode: 'manual', unit: '', planned: 0, completed: 0, percent: 0, notes: '' };
const act = (id, overrides = {}) => ({ ...base, id, ...overrides });
const whole = id => ({ type: 'activity', activityId: id });
const section = (id, n = 1) => ({ type: 'riserSection', activityId: id, sectionStartLevel: n });

// Completion counts either full progress or Complete status.
assert.equal(p.finished(act('a', { status: 'Complete' })), true);
assert.equal(p.finished(act('a', { mode: 'manual', percent: 100, status: 'In progress' })), true);
assert.equal(p.finished(act('a')), false);

// Readiness: no prerequisites means ready.
assert.equal(p.createReadinessResolver([act('a')])(act('a')).state, 'ready');
// Incomplete whole-activity prerequisite means waiting.
const waiting = [act('a'), act('b', { prerequisites: [whole('a')] })];
assert.equal(p.createReadinessResolver(waiting)(waiting[1]).state, 'waiting');
// Complete prerequisite with no unresolved prerequisites of its own means ready.
const ready = [act('a', { status: 'Complete', percent: 100 }), act('b', { prerequisites: [whole('a')] })];
assert.equal(p.createReadinessResolver(ready)(ready[1]).state, 'ready');
// A finished activity whose prerequisite is no longer met needs review.
const reviewB = act('b', { status: 'Complete', percent: 100, prerequisites: [whole('a')] });
assert.equal(p.createReadinessResolver([act('a'), reviewB])(reviewB).state, 'review');
// A specific installed riser section satisfies a section prerequisite while the riser is unfinished.
const riser = act('r', { name: 'Riser R01', mode: 'floor', status: 'In progress', riser: { startLevel: 1, endLevel: 4, installedSections: [1] } });
const dep = act('d', { prerequisites: [section('r', 1)] });
assert.equal(p.createReadinessResolver([riser, dep])(dep).state, 'ready');
// An uninstalled in-route section still waits.
const dep2 = act('d', { prerequisites: [section('r', 3)] });
assert.equal(p.createReadinessResolver([riser, dep2])(dep2).state, 'waiting');
// Mutual requirements on completed activities resolve to review, not an infinite loop.
const cycA = act('a', { status: 'Complete', percent: 100, prerequisites: [whole('b')] });
const cycB = act('b', { status: 'Complete', percent: 100, prerequisites: [whole('a')] });
const cyc = p.createReadinessResolver([cycA, cycB])(cycA);
assert.equal(cyc.state, 'review');
assert.match(cyc.missing[0], /has unresolved prerequisites/);

// Graph validation rejects invalid links and cycles.
assert.throws(() => p.validateActivityChanges([], [act('a', { prerequisites: [whole('a')] })]), /cannot require itself/);
assert.throws(() => p.validateActivityChanges([], [act('b', { prerequisites: [whole('zz')] })]), /same project/);
assert.throws(() => p.validateActivityChanges([], [act('a', { prerequisites: [whole('b')] }), act('b', { prerequisites: [whole('a')] })]), /Circular prerequisites/);
assert.throws(() => p.validateActivityChanges([], [act('b', { status: 'Complete', percent: 100, prerequisites: [whole('a')] }), act('a')]), /cannot be completed/);
// Completing an activity without prerequisites stays valid.
p.validateActivityChanges([], [act('a', { status: 'Complete', percent: 100 })]);

// Dependency lookup and topological ordering.
const deps = p.linkedDependents('a', [act('a'), act('b', { prerequisites: [whole('a')] })]);
assert.equal(deps.length, 1);
assert.equal(deps[0].id, 'b');
const ordered = p.orderActivityChanges([act('b', { prerequisites: [whole('a')] }), act('a')]);
assert.deepEqual(ordered.map(x => x.id), ['a', 'b']);

// Prerequisite labels include riser sections and fall back for unavailable records.
assert.equal(p.prerequisiteLabel(section('r', 2), new Map([['r', act('r', { name: 'Riser R01' })]])), `Riser R01 — ${levelLabel(2)} → ${levelLabel(3)}`);
assert.equal(p.prerequisiteLabel(whole('missing'), new Map()), 'Unavailable activity');

console.log('PASS: readiness states, riser sections, cycles, graph validation, dependents, ordering, labels.');
