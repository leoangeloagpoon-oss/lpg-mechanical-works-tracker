import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { progress, progressText, levelLabel, plannedRoute, installedRange, today, daysFromToday } from '../app/model.ts';

const dir = path.resolve('.sites-runtime/tools-tests'); mkdirSync(dir, { recursive: true });
const code = ts.transpileModule(readFileSync('app/activity-tools.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace("from './model'", "from '../../app/model.ts'");
writeFileSync(path.join(dir, 'tools.mjs'), code);
const tools = await import(pathToFileURL(path.join(dir, 'tools.mjs')));

// Grouping derives task, flat label, and area from flat names.
const parts = tools.activityParts({ name: 'Floor 01 — Flat 02 — Inlet piping', area: 'Floor 01' });
assert.equal(parts.group, 'Inlet piping');
assert.equal(parts.item, 'Flat 02');
assert.equal(parts.area, 'Floor 01');
const riserParts = tools.activityParts({ name: 'Riser R01 — Ground floor', area: 'Tower A', riser: { startLevel: 1, endLevel: 18, installedSections: null } });
assert.equal(riserParts.group, 'Riser installation');
assert.equal(riserParts.item, 'Riser R01');
assert.equal(riserParts.area, 'Tower A');

// Known work names sort before ad-hoc groups.
const groups = tools.activityGroups([
  { id: '1', projectId: 'p', name: 'Floor 01 — Flat 01 — Inlet piping', area: 'Floor 01' },
  { id: '2', projectId: 'p', name: 'Floor 02 — Flat 05 — Inlet piping', area: 'Floor 02' },
  { id: '3', projectId: 'p', name: 'Floor 01 — Flat 02 — Gas meter assembly', area: 'Floor 01' },
]);
assert.deepEqual(groups.map(g => g.name), ['Inlet piping', 'Gas meter assembly']);
assert.equal(groups[0].records.length, 2);

// Duplicate protection normalizes area and name.
assert.equal(tools.entryKey({ area: ' Floor 01 ', name: 'INLET PIPING' }), tools.entryKey({ area: 'floor 01', name: 'Inlet Piping' }));

// Generation expands flat ranges and deduplicates repeated names.
const entries = tools.generateEntries(['Inlet piping', 'Inlet piping'], [{ area: 'Floor 01', from: '1', to: '2', enabled: true }]);
assert.equal(entries.length, 2);
assert.equal(entries[0].name, 'Floor 01 — Flat 01 — Inlet piping');
assert.equal(entries[1].name, 'Floor 01 — Flat 02 — Inlet piping');
assert.throws(() => tools.generateEntries(['Inlet piping'], [{ area: 'Floor 01', from: '1', to: '9', enabled: false }]), /Select at least one floor/);

// Bulk patches: manual percentages derive status.
const base = { id: 'a1', projectId: 'p', name: 'Piping', area: 'Floor 01', responsible: '', start: '', end: '', status: 'Not started', mode: 'manual', unit: '', planned: 0, completed: 0, percent: 0, notes: '' };
const at50 = tools.applyBulkPatch(base, { percent: 50 });
assert.equal(at50.percent, 50);
assert.equal(at50.status, 'In progress');
assert.equal(tools.applyBulkPatch(base, { percent: 100 }).status, 'Complete');
assert.equal(tools.applyBulkPatch(base, { percent: 0 }).status, 'Not started');
assert.equal(tools.applyBulkPatch(base, { status: 'Complete' }).percent, 100);

// Prerequisite edits: replace, append, and remove.
assert.deepEqual(tools.applyBulkPatch(base, { prerequisiteEdit: { action: 'replace', links: [{ type: 'activity', activityId: 'x1' }] } }).prerequisites, [{ type: 'activity', activityId: 'x1' }]);
assert.deepEqual(tools.applyBulkPatch({ ...base, prerequisites: [{ type: 'activity', activityId: 'x1' }] }, { prerequisiteEdit: { action: 'append', links: [{ type: 'activity', activityId: 'x2' }] } }).prerequisites, [{ type: 'activity', activityId: 'x1' }, { type: 'activity', activityId: 'x2' }]);
assert.deepEqual(tools.applyBulkPatch({ ...base, prerequisites: [{ type: 'activity', activityId: 'x1' }, { type: 'activity', activityId: 'x2' }] }, { prerequisiteEdit: { action: 'remove', links: [{ type: 'activity', activityId: 'x2' }] } }).prerequisites, [{ type: 'activity', activityId: 'x1' }]);

// Floor entry installs and uninstalls exact ranges; route edits preserve in-range sections.
const riserBase = { ...base, name: 'Riser R01 — Tower', mode: 'floor', riser: { startLevel: 1, endLevel: 4, installedSections: [] } };
const installed = tools.applyBulkPatch(riserBase, { floorRange: { from: 1, to: 3, installed: true } });
assert.deepEqual(installed.riser.installedSections, [1, 2]);
assert.equal(installed.status, 'In progress');
assert.deepEqual(tools.applyBulkPatch(installed, { floorRange: { from: 1, to: 2, installed: false } }).riser.installedSections, [2]);
assert.deepEqual(tools.applyBulkPatch({ ...riserBase, riser: { startLevel: 1, endLevel: 10, installedSections: [2, 3] } }, { riserRoute: { startLevel: 2, endLevel: 10 } }).riser, { startLevel: 2, endLevel: 10, installedSections: [2, 3] });
assert.throws(() => tools.applyBulkPatch({ ...riserBase, mode: 'quantity', unit: 'm', planned: 10, completed: 0, riser: { startLevel: 1, endLevel: 4, installedSections: null } }, { floorRange: { from: 1, to: 2, installed: true } }), /quantity-tracked riser/);

// Shared progress helpers.
assert.equal(levelLabel(1), '1st floor');
assert.equal(levelLabel(2), '2nd floor');
assert.equal(levelLabel(3), '3rd floor');
assert.equal(levelLabel(11), '11th floor');
assert.equal(levelLabel(13), '13th floor');
assert.equal(levelLabel(14), '14th floor');
assert.equal(levelLabel(18), 'Roof');
assert.equal(progress({ mode: 'floor', planned: 0, completed: 0, percent: 0, riser: { startLevel: 1, endLevel: 4, installedSections: [1, 2, 3] } }), 100);
assert.equal(progressText({ mode: 'floor', planned: 0, completed: 0, percent: 0, riser: { startLevel: 1, endLevel: 3, installedSections: [1] } }), '50.0%');
assert.equal(plannedRoute({ riser: { startLevel: 2, endLevel: 5 } }), '2nd floor – 5th floor');
assert.equal(plannedRoute({ riser: undefined }), 'Planned route not configured');
assert.equal(installedRange({ riser: { startLevel: 1, endLevel: 5, installedSections: [1, 2, 4] } }), '1st floor – 3rd floor, 4th floor – 5th floor');

// Local calendar helpers stay consistent with each other.
assert.match(daysFromToday(7), /^\d{4}-\d{2}-\d{2}$/);
assert.ok(daysFromToday(7) >= today());

console.log('PASS: grouping, deduplication, generation, bulk patches, riser ranges, progress helpers, local dates.');
