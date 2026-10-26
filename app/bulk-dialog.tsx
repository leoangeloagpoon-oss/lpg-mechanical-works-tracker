'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronRight, Plus, X, Check, RefreshCw } from 'lucide-react';
import { isRiser, plannedRoute, installedRange, progressText, type Activity, type Project, type Prerequisite } from './model';
import { LevelSelect } from './riser-fields';
import { PrerequisitePicker, ReadinessStatus } from './prerequisite-fields';
import { createReadinessResolver, validateActivityChanges, orderActivityChanges, prerequisiteLabel } from './prerequisites';
import { applyBulkPatch, bulkPatchSchema, defaultRanges, entryKey, generateEntries, runBulkQueue, workNames, type BulkPatch, type BulkEntry, type FloorRange } from './activity-tools';

const dateLabel = (s: string) => s || '—';
type FieldControl = { action: 'keep' | 'set' | 'clear'; value: string };
type Controls = Record<'percent' | 'status' | 'responsible' | 'start' | 'end', FieldControl>;
const initialControls = (): Controls => ({ percent: { action: 'keep', value: '0' }, status: { action: 'keep', value: 'Not started' }, responsible: { action: 'keep', value: '' }, start: { action: 'keep', value: '' }, end: { action: 'keep', value: '' } });

export default function BulkDialog({ mode, selected, allActivities, projects, initialProject, onClose }: { mode: 'update' | 'create'; selected: Activity[]; allActivities: Activity[]; projects: Project[]; initialProject: string; onClose: (changed: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [projectId, setProjectId] = useState(mode === 'update' ? selected[0]?.projectId || '' : initialProject);
  const [controls, setControls] = useState(initialControls);
  const [prerequisiteAction,setPrerequisiteAction]=useState('keep');
  const [prerequisiteLinks,setPrerequisiteLinks]=useState<Prerequisite[]>([]);
  const [routeEnabled,setRouteEnabled]=useState(false),[routeStart,setRouteStart]=useState(1),[routeEnd,setRouteEnd]=useState(18);
  const [rangeAction,setRangeAction]=useState('keep'),[rangeFrom,setRangeFrom]=useState(1),[rangeTo,setRangeTo]=useState(3);
  const [names, setNames] = useState(workNames.join('\n'));
  const project = projects.find(p => p.id === projectId);
  const [ranges, setRanges] = useState<FloorRange[]>(() => defaultRanges(project?.name || '', project?.areas || []));
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [saved, setSaved] = useState(0), [skipped, setSkipped] = useState(0), [remaining, setRemaining] = useState(0), [finished, setFinished] = useState(false);
  const [patch, setPatch] = useState<BulkPatch>({});
  const [entries, setEntries] = useState<BulkEntry[]>([]), [updated, setUpdated] = useState<Activity[]>([]);
  const queue = useRef<(string | BulkEntry)[]>([]);
  const [attempted, setAttempted] = useState(false);
  const previewResolver=useMemo(()=>createReadinessResolver([...allActivities.filter(a=>!updated.some(u=>u.id===a.id)),...updated]),[allActivities,updated]);
  const prerequisiteSources=useMemo(()=>new Map(allActivities.map(a=>[a.id,a])),[allActivities]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function close() { if (!busy) onClose(attempted); }
  function changeControl(key: keyof Controls, value: Partial<FieldControl>) { setControls(old => ({ ...old, [key]: { ...old[key], ...value } })); }
  function previewUpdate() {
    const p: Record<string, unknown> = {};
    for (const [key, c] of Object.entries(controls)) if (c.action !== 'keep') p[key] = c.action === 'clear' ? '' : key === 'percent' ? (c.value.trim() === '' ? NaN : Number(c.value)) : c.value;
    if(routeEnabled)p.riserRoute={startLevel:routeStart,endLevel:routeEnd};
    if(rangeAction!=='keep')p.floorRange={from:rangeFrom,to:rangeTo,installed:rangeAction==='install'};
    if(prerequisiteAction!=='keep')p.prerequisiteEdit={action:prerequisiteAction,links:prerequisiteAction==='clear'?[]:prerequisiteLinks};
    const valid = bulkPatchSchema.parse(p);
    const records = selected.map(a => applyBulkPatch(a, valid));
    validateActivityChanges(allActivities,records);setPatch(valid); setUpdated(records); queue.current = orderActivityChanges(records).map(a=>a.id); setRemaining(queue.current.length); setPreview(true);
  }
  async function previewCreate() {
    if (!project) throw Error('Choose a project.');
    const generated = generateEntries(names.split('\n'), ranges);
    const response = await fetch('/api/records', { cache: 'no-store' });
    if (!response.ok) throw Error('Could not check existing activities. Please try again.');
    const data = await response.json() as { activities: Activity[] };
    const existing = new Set((data.activities as Activity[]).filter(a => a.projectId === projectId).map(entryKey));
    const pending = generated.filter(e => !existing.has(entryKey(e)));
    setEntries(generated); setSkipped(generated.length - pending.length); queue.current = pending; setRemaining(pending.length); setPreview(true);
  }
  async function makePreview() { setError(''); setBusy(true); try { if (mode === 'update') previewUpdate(); else await previewCreate(); } catch (e: any) { setError(e.issues?.map((i: any) => i.message).join(' ') || e.message || 'Review the form.'); } finally { setBusy(false); } }
  async function save() {
    setBusy(true); setError(''); setAttempted(true);
    try {
      await runBulkQueue(queue.current, async batch => {
        const body = mode === 'update' ? { operation: 'update', projectId, ids: batch, patch } : { operation: 'create', projectId, entries: batch };
        const response = await fetch('/api/activities/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result: any = await response.json();
        if (!response.ok) throw Error(result.error || 'Could not save this batch.');
        if (!Number.isInteger(result.saved) || !Number.isInteger(result.skipped) || result.saved + result.skipped !== batch.length) throw Error('Save confirmation was interrupted. Retry to check this batch safely.');
        return result;
      }, (_batch, result) => { setSaved(n => n + result.saved); setSkipped(n => n + result.skipped); setRemaining(queue.current.length); });
      setFinished(true);
    } catch (e: any) { setRemaining(queue.current.length); setError(`${e.message || 'Connection interrupted.'} Retry remaining to continue. Already confirmed batches will not be repeated.`); }
    finally { setBusy(false); }
  }
  function control(key: keyof Controls, title: string, type = 'text') {
    const c = controls[key];
    return <div className="bulk-field" key={key}><label className="field"><span>{title}</span><select aria-label={`${title} action`} value={c.action} onChange={e => changeControl(key, { action: e.target.value as FieldControl['action'] })}><option value="keep">Keep current values</option><option value="set">Set value</option>{['responsible', 'start', 'end'].includes(key) && <option value="clear">Clear value</option>}</select></label>{c.action === 'set' && <label className="field"><span>{title} value</span>{key === 'status' ? <select value={c.value} onChange={e => changeControl(key, { value: e.target.value })}>{['Not started', 'In progress', 'Blocked', 'Complete'].map(s => <option key={s}>{s}</option>)}</select> : <input type={type} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 100 : undefined} step={type === 'number' ? 'any' : undefined} maxLength={type === 'text' ? 200 : undefined} value={c.value} onChange={e => changeControl(key, { value: e.target.value })} />}</label>}</div>;
  }
  function prerequisiteControls(){return <section className="form-section"><h3>Prerequisites</h3><label className="field"><span>Bulk prerequisite action</span><select value={prerequisiteAction} onChange={e=>setPrerequisiteAction(e.target.value)}><option value="keep">Keep existing links</option><option value="append">Append prerequisites</option><option value="replace">Replace all prerequisites</option><option value="remove">Remove selected links</option><option value="clear">Clear all prerequisite links</option></select></label>{!['keep','clear'].includes(prerequisiteAction)&&<PrerequisitePicker activities={allActivities} projectId={projectId} value={prerequisiteLinks} onChange={setPrerequisiteLinks} excludeIds={prerequisiteAction==='remove'?[]:selected.map(a=>a.id)}/>}<p className="field-hint">{prerequisiteAction==='clear'?'This removes prerequisite links only; activities and progress are retained.':prerequisiteAction==='remove'?'Choose the links to remove; all other prerequisite links remain.':'The same prerequisite links apply to every selected activity. Preview the changes before saving.'}</p></section>;}
  function floorControls(){return selected.length>0&&selected.every(isRiser)?<div className="form-section"><h3>Riser floor entry</h3><label className="checkbox"><input type="checkbox" checked={routeEnabled} onChange={e=>setRouteEnabled(e.target.checked)}/><span>Set planned riser route</span></label>{routeEnabled&&<><div className="form-grid"><LevelSelect label="Bulk planned start floor" value={routeStart} onChange={setRouteStart} start/><LevelSelect label="Bulk planned end floor" value={routeEnd} onChange={setRouteEnd}/></div><p className="field-hint">Setting only the route preserves current progress and status. Roof means above the 17th floor. A shorter route cannot exclude recorded installed sections.</p></>}<label className="field"><span>Floor installation action</span><select value={rangeAction} onChange={e=>setRangeAction(e.target.value)}><option value="keep">Keep installed sections</option><option value="install">Mark range installed</option><option value="uninstall">Mark range uninstalled (correction)</option></select></label>{rangeAction!=='keep'&&<><div className="form-grid"><LevelSelect label="Installed from floor" value={rangeFrom} onChange={setRangeFrom} start/><LevelSelect label="Installed to floor" value={rangeTo} onChange={setRangeTo}/></div><p className="field-hint">Only this range changes; other sections are preserved. The range must fit every selected riser’s route. Percentages and work status are calculated; Blocked is preserved unless explicitly changed.</p></>}</div>:null;}
  return <dialog ref={dialog} className="editor bulk-editor" onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="bulk-title"><div className="editor-heading"><div><span className="eyebrow">LPG FIELDWORK</span><h2 id="bulk-title">{mode === 'update' ? 'Bulk update activities' : 'Bulk add activities'}</h2></div><button className="icon-button" aria-label="Close bulk form" disabled={busy} onClick={close}><X size={21} /></button></div><div className="editor-body">
    {!preview ? mode === 'update' ? <><p className="form-intro">Update {selected.length} selected activities in {project?.name}. Choose the fields you want to change. All other values stay as they are.</p>{floorControls()}{control('percent', 'Completion (%)', 'number')}<p className="field-hint">Percentages apply to manual records only. Floor tracking uses installed sections. Status follows the percentage unless you choose a status below; Blocked stays Blocked. Complete sets manual progress to 100%.</p>{control('status', 'Work status')}{control('responsible', 'Responsible person')}{control('start', 'Planned start', 'date')}{control('end', 'Planned finish', 'date')}{prerequisiteControls()}</> : <>
      <p className="form-intro">Create repeated activities for several flats and floors. New work starts at 0%, Not started, with manual progress.</p><label className="field"><span>Project</span><select value={projectId} onChange={e => { setProjectId(e.target.value); const p = projects.find(p => p.id === e.target.value); setRanges(defaultRanges(p?.name || '', p?.areas || [])); }}><option value="">Choose a project</option>{projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field"><span>Activity names — one per line</span><textarea rows={3} value={names} onChange={e => setNames(e.target.value)} /></label><div className="range-caption"><h3>Floors and flat ranges</h3><button className="text-button" onClick={() => setRanges(old => old.map(r => ({ ...r, enabled: !old.every(x => x.enabled) })))}>{ranges.every(r => r.enabled) ? 'Deselect all floors' : 'Select all floors'}</button></div><div className="floor-ranges">{ranges.map((r, i) => <div className="floor-range" key={i}><input className="activity-check" type="checkbox" aria-label={`Include floor row ${i + 1}`} checked={r.enabled} onChange={e => setRanges(old => old.map((v, j) => j === i ? { ...v, enabled: e.target.checked } : v))} /><label className="field"><span>Floor / area</span><input aria-label={`Floor row ${i + 1} area`} maxLength={100} value={r.area} onChange={e => setRanges(old => old.map((v, j) => j === i ? { ...v, area: e.target.value } : v))} /></label><label className="field"><span>First flat</span><input aria-label={`Floor row ${i + 1} first flat`} type="number" min="1" max="999" value={r.from} onChange={e => setRanges(old => old.map((v, j) => j === i ? { ...v, from: e.target.value } : v))} /></label><label className="field"><span>Last flat</span><input aria-label={`Floor row ${i + 1} last flat`} type="number" min="1" max="999" value={r.to} onChange={e => setRanges(old => old.map((v, j) => j === i ? { ...v, to: e.target.value } : v))} /></label><button className="icon-button" aria-label={`Remove floor row ${i + 1}`} onClick={() => setRanges(old => old.filter((_, j) => j !== i))}><X size={16} /></button></div>)}</div><button className="secondary" onClick={() => setRanges(old => [...old, { area: '', from: '1', to: '1', enabled: true }])}><Plus size={15} />Add floor row</button>
    </> : <>
      <div className="bulk-progress" role="status" aria-live="polite"><strong>{finished ? 'Save complete' : 'Review before saving'}</strong><p>{mode === 'update' ? `${selected.length} selected activities` : `${entries.length} planned activities`} · {saved} saved · {skipped} duplicates skipped · {remaining} remaining</p>{busy && <p>Saving in batches of up to 100. Keep this form open.</p>}</div>
      {mode === 'update' ? <><p className="field-hint">Changed fields: {Object.keys(patch).map(k => ({ prerequisiteEdit:'prerequisites',riserRoute:'planned route',floorRange:'installed floor range',percent: 'completion', status: 'status', responsible: 'responsible person', start: 'planned start', end: 'planned finish' }[k])).join(', ')}. Each row below shows the resulting values.</p><div className="bulk-preview table-wrap"><table><thead><tr><th>Activity</th><th>Progress before → after</th><th>Status before → after</th><th>Responsible</th><th>Start / finish</th><th>Prerequisites</th></tr></thead><tbody>{updated.map(a => { const before = selected.find(x => x.id === a.id)!; return <tr key={a.id}><td>{a.name}{isRiser(a)&&<><small>{plannedRoute(a)}</small><small>{installedRange(a)}</small></>}</td><td>{progressText(before)} → {progressText(a)}<small>{a.mode==='floor'?'Calculated floor sections':a.mode === 'quantity' ? 'Quantity tracking retained' : 'Manual percentage'}</small></td><td>{before.status} → {a.status}</td><td>{a.responsible || 'Unassigned'}</td><td>{dateLabel(a.start)} / {dateLabel(a.end)}</td><td><small>{before.prerequisites?.length||0} → {a.prerequisites?.length||0} links</small><ul>{(a.prerequisites||[]).map((p,i)=><li key={i}>{prerequisiteLabel(p,prerequisiteSources)}</li>)}</ul><ReadinessStatus value={previewResolver(a)}/></td></tr>; })}</tbody></table></div></> : <><p className="field-hint">Existing matches are skipped. New records use manual tracking, 0%, Not started; dates and responsible person are blank.</p><div className="bulk-preview"><ul>{entries.map(e => <li key={entryKey(e)}>{e.name}</li>)}</ul></div></>}
    </>}
    {error && <div className="form-error" role="alert">{error}</div>}
    </div><div className="editor-footer"><button className="secondary" disabled={busy} onClick={close}>{finished ? 'Done' : 'Close'}</button>{preview && !attempted && <button className="secondary" disabled={busy} onClick={() => { setPreview(false); setError(''); setSkipped(0); }}>Back to edit</button>}{!preview ? <button className="primary" disabled={busy} onClick={makePreview}>{busy ? <RefreshCw size={16} className="spinning" /> : <ChevronRight size={16} />}Preview changes</button> : !finished && <button className="primary" disabled={busy || !remaining} onClick={save}>{busy ? <RefreshCw size={16} className="spinning" /> : <Check size={16} />}{busy ? 'Saving…' : error ? 'Retry remaining' : `Save ${remaining} activities`}</button>}</div></dialog>;
}
