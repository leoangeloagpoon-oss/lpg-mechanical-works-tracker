import { z } from 'zod';
import { activitySchema, progress, overdue, riserRouteSchema, isRiser, floorStatus, prerequisitesSchema, prerequisiteKey, type Activity } from './model';

export const workNames = ['Inlet piping', 'Gas meter assembly', 'Outlet piping'];
export function activityParts(a: Pick<Activity, 'name' | 'area'> & {riser?:Activity['riser']}) {
  const flat = a.name.match(/^(.*?)\s+—\s+(Flat\s+\d+)\s+—\s+(.+)$/i);
  if (flat) return { group: flat[3].trim(), item: flat[2], area: a.area || flat[1] };
  if (isRiser(a)) return { group: 'Riser installation', item: a.name.split(' — ')[0], area: a.area };
  return { group: a.name, item: a.name, area: a.area };
}
export function activityGroups(activities: Activity[]) {
  const groups = new Map<string, { name: string; records: Activity[] }>();
  for (const a of activities) {
    const name = activityParts(a).group;
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, records: [] });
    groups.get(key)!.records.push(a);
  }
  return [...groups.values()].sort((a, b) => {
    const ai = [...workNames, 'Riser installation'].indexOf(a.name), bi = [...workNames, 'Riser installation'].indexOf(b.name);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}
export function activitySummary(records: Activity[]) {
  return { count: records.length, complete: records.filter(a => a.status === 'Complete').length,
    percent: records.length ? records.reduce((s, a) => s + progress(a), 0) / records.length : 0,
    blocked: records.filter(a => a.status === 'Blocked').length, overdue: records.filter(a => overdue(a)).length };
}
const text = z.string().trim().max(200);
const date = z.string().refine(s => s === '' || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s), 'Enter a valid date.');
export const floorRangeSchema=z.object({from:z.number().int().min(1).max(17),to:z.number().int().min(2).max(18),installed:z.boolean()}).strict().refine(r=>r.to>r.from,'The To floor must be above the From floor.');
export const bulkPatchSchema = z.object({ percent: z.number().finite().min(0).max(100).optional(),
  riserRoute:riserRouteSchema.optional(),floorRange:floorRangeSchema.optional(),
  prerequisiteEdit:z.object({action:z.enum(['append','replace','remove','clear']),links:prerequisitesSchema}).strict().refine(p=>p.action==='clear'||p.links.length>0,'Choose at least one prerequisite.').optional(),
  status: z.enum(['Not started', 'In progress', 'Blocked', 'Complete']).optional(), responsible: text.optional(), start: date.optional(), end: date.optional()
}).strict().refine(p => Object.keys(p).length > 0, 'Choose at least one field to update.');
export type BulkPatch = z.infer<typeof bulkPatchSchema>;
export function applyBulkPatch(record: Activity, patch: BulkPatch): Activity {
  const { percent, riserRoute, floorRange, prerequisiteEdit, ...fields } = patch;
  const next = { ...record, ...fields };
  if(prerequisiteEdit){
    const {action,links}=prerequisiteEdit;const keys=new Set(links.map(prerequisiteKey));
    next.prerequisites=action==='clear'?[]:action==='replace'?links:action==='remove'?(record.prerequisites||[]).filter(p=>!keys.has(prerequisiteKey(p))):[...new Map([...(record.prerequisites||[]),...links].map(p=>[prerequisiteKey(p),p])).values()];
  }
  if(riserRoute || floorRange){
    if(!isRiser(record))throw Error('Floor entry can only be applied to risers.');
    if(riserRoute)next.riser={...riserRoute,installedSections:record.riser?.installedSections??null};
    if(floorRange){
      if(!next.riser)throw Error(`${record.name}: configure the planned route first.`);
      if(floorRange.from<next.riser.startLevel||floorRange.to>next.riser.endLevel)throw Error(`${record.name}: the selected range is outside its planned route.`);
      if(record.mode!=='floor' && progress(record)>0 && record.riser?.installedSections==null)throw Error(`${record.name}: existing progress needs floor details. Edit this riser to confirm its installed sections first.`);
      if(record.mode==='quantity')throw Error(`${record.name}: edit this quantity-tracked riser individually before using floor entry.`);
      const sections=new Set(next.riser.installedSections||[]);
      for(let i=floorRange.from;i<floorRange.to;i++){if(floorRange.installed)sections.add(i);else sections.delete(i);}
      next.riser={...next.riser,installedSections:[...sections].sort((a,b)=>a-b)};next.mode='floor';
    }
    if(next.mode==='floor'&&!patch.status)next.status=floorStatus(next,record.status) as Activity['status'];
  }
  if (next.mode === 'manual') {
    if (percent !== undefined) {
      next.percent = percent;
      if (!patch.status && record.status !== 'Blocked') next.status = percent === 100 ? 'Complete' : percent === 0 ? 'Not started' : 'In progress';
    }
    if (patch.status === 'Complete') next.percent = 100;
  }
  activitySchema.parse(next);
  return next;
}
export const bulkEntrySchema = z.object({ name: text.min(1), area: text.min(1) }).strict();
export type BulkEntry = z.infer<typeof bulkEntrySchema>;
export const bulkRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('update'), projectId: text.min(1), ids: z.array(z.string().min(1).max(100)).min(1).max(100), patch: bulkPatchSchema }).strict(),
  z.object({ operation: z.literal('create'), projectId: text.min(1), entries: z.array(bulkEntrySchema).min(1).max(100) }).strict()
]);
export function entryKey(entry: BulkEntry) { return JSON.stringify([entry.area.trim().toLowerCase(), entry.name.trim().toLowerCase()]); }
export type FloorRange = { area: string; from: string; to: string; enabled: boolean };
export function defaultRanges(projectName: string, areas: string[]): FloorRange[] {
  if (projectName.trim().toLowerCase() === 'g+16+roof') return Array.from({ length: 17 }, (_, i) => ({
    area: `Floor ${String(i + 1).padStart(2, '0')}`, from: '1', to: String(i === 0 ? 19 : i < 10 ? 22 : i < 16 ? 7 : 4), enabled: true
  }));
  return (areas.length ? areas : ['Floor 01']).map(area => ({ area, from: '1', to: '1', enabled: true }));
}
export function generateEntries(names: string[], ranges: FloorRange[]): BulkEntry[] {
  const clean = [...new Set(names.map(n => n.trim()).filter(Boolean))];
  if (!clean.length || clean.some(n => n.length > 100)) throw Error('Enter activity names of 1–100 characters, one per line.');
  if (!ranges.some(r => r.enabled)) throw Error('Select at least one floor.');
  const entries: BulkEntry[] = [];
  for (const r of ranges.filter(r => r.enabled)) {
    const from = Number(r.from), to = Number(r.to);
    if (!r.area.trim() || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > 999) throw Error('Each floor needs a name and a valid flat range between 1 and 999.');
    if (entries.length + (to - from + 1) * clean.length > 5000) throw Error('Add up to 5,000 activities at a time. Narrow the flat ranges.');
    for (let f = from; f <= to; f++) for (const name of clean) entries.push(bulkEntrySchema.parse({ area: r.area, name: `${r.area.trim()} — Flat ${String(f).padStart(2, '0')} — ${name}` }));
  }
  return [...new Map(entries.map(e => [entryKey(e), e])).values()];
}

// A failed request leaves the current batch pending. Retrying is safe: updates
// set absolute values, and creation checks duplicates inside its transaction.
export async function runBulkQueue<T>(queue: T[], send: (batch: T[]) => Promise<{ saved: number; skipped: number }>, acknowledged: (batch: T[], result: { saved: number; skipped: number }) => void) {
  while (queue.length) {
    const batch = queue.slice(0, 100);
    const result = await send(batch);
    queue.splice(0, batch.length);
    acknowledged(batch, result);
  }
}
