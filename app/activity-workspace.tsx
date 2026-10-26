'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X, Check, RefreshCw } from 'lucide-react';
import { progress, overdue, isRiser, levelLabel, plannedRoute, installedRange, progressText, type Activity, type Project } from './model';
import { LevelSelect } from './riser-fields';
import { activityGroups, activityParts, activitySummary, applyBulkPatch, bulkPatchSchema, defaultRanges, entryKey, generateEntries, runBulkQueue, workNames, type BulkPatch, type BulkEntry, type FloorRange } from './activity-tools';

function Selection({ records, selected, onToggle, label }: { records: Activity[]; selected: Set<string>; onToggle: (records: Activity[]) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const count = records.filter(a => selected.has(a.id)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < records.length; }, [count, records.length]);
  return <input ref={ref} className="activity-check" type="checkbox" aria-label={label} checked={!!records.length && count === records.length} onChange={() => onToggle(records)} />;
}
function Summary({ records }: { records: Activity[] }) {
  const s = activitySummary(records);
  return <span className="group-metrics"><span>{s.count} {s.count === 1 ? 'activity' : 'activities'}</span><span>{s.complete} complete</span><strong>{records.some(isRiser)?s.percent.toFixed(1):Math.round(s.percent)}%</strong><span>{s.blocked} blocked</span><span>{s.overdue} overdue</span></span>;
}
const dateLabel = (s: string) => s || '—';
export default function ActivityWorkspace({ activities, projects, projectId, scopeKey, onEdit, onDelete, onRefresh }: { activities: Activity[]; projects: Project[]; projectId: string; scopeKey: string; onEdit: (a: Activity) => void; onDelete: (a: Activity) => void; onRefresh: () => Promise<void> }) {
  const [layout, setLayout] = useState('grouped');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'update' | 'create' | null>(null);
  useEffect(() => { setSelected(new Set()); setExpanded(new Set()); }, [scopeKey]);
  const selectedRecords = activities.filter(a => selected.has(a.id));
  const selectedProjects = new Set(selectedRecords.map(a => a.projectId));
  const projectName = (id: string) => projects.find(p => p.id === id)?.name || 'Project';
  function toggle(records: Activity[]) { setSelected(old => { const next = new Set(old); const all = records.every(a => next.has(a.id)); records.forEach(a => all ? next.delete(a.id) : next.add(a.id)); return next; }); }
  function expand(key: string) { setExpanded(old => { const next = new Set(old); next.has(key) ? next.delete(key) : next.add(key); return next; }); }
  function rows(records: Activity[], short = false) {
    return <div className="table-wrap"><table className="activity-table"><thead><tr><th><Selection records={records} selected={selected} onToggle={toggle} label="Select all activities in this table" /></th><th>{short ? 'Flat / work' : 'Activity / project'}</th><th>Area / planned route</th><th>Responsible</th><th>Progress</th><th>Finish</th><th>Status</th><th>Actions</th></tr></thead><tbody>{[...records].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(a => <tr key={a.id}><td><Selection records={[a]} selected={selected} onToggle={toggle} label={`Select ${a.name}`} /></td><td><button className="cell-link" onClick={() => onEdit(a)}>{short ? activityParts(a).item : a.name}</button><small>{projectName(a.projectId)}</small>{isRiser(a)&&<small className="installed-range">{installedRange(a)}</small>}</td><td>{(isRiser(a)?plannedRoute(a):a.area) || '—'}</td><td>{a.responsible || 'Unassigned'}</td><td><strong>{progressText(a)}</strong><small>{a.mode === 'floor' ? `${a.riser?.installedSections?.length||0} / ${(a.riser?.endLevel||1)-(a.riser?.startLevel||1)} sections` : a.mode === 'manual' ? 'Manual percentage' : `${a.completed} / ${a.planned} ${a.unit}`}</small></td><td className={overdue(a) ? 'red-text' : ''}>{dateLabel(a.end)}{overdue(a) && <small>Overdue</small>}</td><td><span className={`badge ${a.status === 'Complete' ? 'good' : a.status === 'Blocked' ? 'bad' : ''}`}><i />{a.status}</span></td><td><div className="row-buttons"><button className="text-button" aria-label={`Edit ${a.name}`} onClick={() => onEdit(a)}>Edit</button><button className="text-button danger" aria-label={`Delete ${a.name}`} onClick={() => onDelete(a)}>Delete</button></div></td></tr>)}</tbody></table></div>;
  }
  return <>
    <div className="activity-toolbar"><div className="segmented" aria-label="Activity display"><button aria-pressed={layout === 'grouped'} className={layout === 'grouped' ? 'active' : ''} onClick={() => setLayout('grouped')}>Grouped view</button><button aria-pressed={layout === 'register'} className={layout === 'register' ? 'active' : ''} onClick={() => setLayout('register')}>Full register</button></div><button className="secondary" disabled={!projects.some(p => !p.archived)} onClick={() => setDialog('create')}><Plus size={15} />Bulk add</button></div>
    <div className="selection-bar"><label className="checkbox"><Selection records={activities} selected={selected} onToggle={toggle} label="Select all matching activities" /><span>Select all matching</span></label><strong aria-live="polite">{selectedRecords.length} selected</strong><button className="text-button" onClick={() => setSelected(new Set())} disabled={!selectedRecords.length}>Clear selection</button><button className="primary" onClick={() => setDialog('update')} disabled={!selectedRecords.length || selectedProjects.size !== 1}>Bulk update</button>{selectedProjects.size > 1 && <p>Choose records from one project to update together.</p>}</div>
    {!activities.length ? <div className="empty"><h3>No matching activities</h3><p>Adjust your filters, add an activity, or use Bulk add for repeated work.</p></div> : layout === 'register' ? <section className="panel table-panel"><div className="table-caption"><h2>Activity register <span className="number-tag">{activities.length}</span></h2><span>Select records to update together.</span></div>{rows(activities)}</section> : <div className="activity-groups">{activityGroups(activities).map(g => {
      const key = `group:${g.name.toLowerCase()}`;
      const floors = new Map<string, { area: string; projectId: string; records: Activity[] }>();
      for (const a of g.records) { const area = isRiser(a)?(a.riser?'To '+levelLabel(a.riser.endLevel):'Route not configured'):(activityParts(a).area || 'No area'); const fk = `${a.projectId}:${area}`; if (!floors.has(fk)) floors.set(fk, { area, projectId: a.projectId, records: [] }); floors.get(fk)!.records.push(a); }
      return <section className="activity-group panel" key={key}><div className="group-header"><Selection records={g.records} selected={selected} onToggle={toggle} label={`Select all ${g.name} activities`} /><button className="group-toggle" aria-expanded={expanded.has(key)} aria-controls={`body-${encodeURIComponent(key)}`} onClick={() => expand(key)}>{expanded.has(key) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<span><strong>{g.name}</strong><Summary records={g.records} /></span></button></div>{expanded.has(key) && <div id={`body-${encodeURIComponent(key)}`} className="group-body">{[...floors.entries()].sort((a, b) => a[1].area.localeCompare(b[1].area, undefined, { numeric: true }) || a[1].projectId.localeCompare(b[1].projectId)).map(([fk, floor]) => {
        const floorKey = `${key}:${fk}`;
        return <div className="activity-floor" key={fk}><div className="floor-header"><Selection records={floor.records} selected={selected} onToggle={toggle} label={`Select ${g.name} on ${floor.area} in ${projectName(floor.projectId)}`} /><button className="group-toggle" aria-expanded={expanded.has(floorKey)} aria-controls={`body-${encodeURIComponent(floorKey)}`} onClick={() => expand(floorKey)}>{expanded.has(floorKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span><strong>{floor.area}</strong><small>{projectName(floor.projectId)}</small><Summary records={floor.records} /></span></button></div>{expanded.has(floorKey) && <div id={`body-${encodeURIComponent(floorKey)}`}>{rows(floor.records, true)}</div>}</div>;
      })}</div>}</section>;
    })}</div>}
    {dialog && <BulkDialog mode={dialog} selected={selectedRecords} projects={projects} initialProject={projectId === 'all' ? projects.find(p => !p.archived)?.id || '' : projectId} onClose={async changed => { setDialog(null); if (changed) { setSelected(new Set()); await onRefresh(); } }} />}
  </>;
}

type FieldControl = { action: 'keep' | 'set' | 'clear'; value: string };
type Controls = Record<'percent' | 'status' | 'responsible' | 'start' | 'end', FieldControl>;
const initialControls = (): Controls => ({ percent: { action: 'keep', value: '0' }, status: { action: 'keep', value: 'Not started' }, responsible: { action: 'keep', value: '' }, start: { action: 'keep', value: '' }, end: { action: 'keep', value: '' } });
function BulkDialog({ mode, selected, projects, initialProject, onClose }: { mode: 'update' | 'create'; selected: Activity[]; projects: Project[]; initialProject: string; onClose: (changed: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [projectId, setProjectId] = useState(mode === 'update' ? selected[0]?.projectId || '' : initialProject);
  const [controls, setControls] = useState(initialControls);
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
  const attempted = useRef(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function close() { if (!busy) onClose(attempted.current); }
  function changeControl(key: keyof Controls, value: Partial<FieldControl>) { setControls(old => ({ ...old, [key]: { ...old[key], ...value } })); }
  function previewUpdate() {
    const p: Record<string, unknown> = {};
    for (const [key, c] of Object.entries(controls)) if (c.action !== 'keep') p[key] = c.action === 'clear' ? '' : key === 'percent' ? (c.value.trim() === '' ? NaN : Number(c.value)) : c.value;
    if(routeEnabled)p.riserRoute={startLevel:routeStart,endLevel:routeEnd};
    if(rangeAction!=='keep')p.floorRange={from:rangeFrom,to:rangeTo,installed:rangeAction==='install'};
    const valid = bulkPatchSchema.parse(p);
    const records = selected.map(a => applyBulkPatch(a, valid));
    setPatch(valid); setUpdated(records); queue.current = selected.map(a => a.id); setRemaining(queue.current.length); setPreview(true);
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
    setBusy(true); setError(''); attempted.current = true;
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
  function floorControls(){return selected.length>0&&selected.every(isRiser)?<div className="form-section"><h3>Riser floor entry</h3><label className="checkbox"><input type="checkbox" checked={routeEnabled} onChange={e=>setRouteEnabled(e.target.checked)}/><span>Set planned riser route</span></label>{routeEnabled&&<><div className="form-grid"><LevelSelect label="Bulk planned start floor" value={routeStart} onChange={setRouteStart} start/><LevelSelect label="Bulk planned end floor" value={routeEnd} onChange={setRouteEnd}/></div><p className="field-hint">Setting only the route preserves current progress and status. Roof means above the 17th floor. A shorter route cannot exclude recorded installed sections.</p></>}<label className="field"><span>Floor installation action</span><select value={rangeAction} onChange={e=>setRangeAction(e.target.value)}><option value="keep">Keep installed sections</option><option value="install">Mark range installed</option><option value="uninstall">Mark range uninstalled (correction)</option></select></label>{rangeAction!=='keep'&&<><div className="form-grid"><LevelSelect label="Installed from floor" value={rangeFrom} onChange={setRangeFrom} start/><LevelSelect label="Installed to floor" value={rangeTo} onChange={setRangeTo}/></div><p className="field-hint">Only this range changes; other sections are preserved. The range must fit every selected riser’s route. Percentages and work status are calculated; Blocked is preserved unless explicitly changed.</p></>}</div>:null;}
  return <dialog ref={dialog} className="editor bulk-editor" onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="bulk-title"><div className="editor-heading"><div><span className="eyebrow">LPG FIELDWORK</span><h2 id="bulk-title">{mode === 'update' ? 'Bulk update activities' : 'Bulk add activities'}</h2></div><button className="icon-button" aria-label="Close bulk form" disabled={busy} onClick={close}><X size={21} /></button></div><div className="editor-body">
    {!preview ? mode === 'update' ? <><p className="form-intro">Update {selected.length} selected activities in {project?.name}. Choose the fields you want to change. All other values stay as they are.</p>{floorControls()}{control('percent', 'Completion (%)', 'number')}<p className="field-hint">Percentages apply to manual records only. Floor tracking uses installed sections. Status follows the percentage unless you choose a status below; Blocked stays Blocked. Complete sets manual progress to 100%.</p>{control('status', 'Work status')}{control('responsible', 'Responsible person')}{control('start', 'Planned start', 'date')}{control('end', 'Planned finish', 'date')}</> : <>
      <p className="form-intro">Create repeated activities for several flats and floors. New work starts at 0%, Not started, with manual progress.</p><label className="field"><span>Project</span><select value={projectId} onChange={e => { setProjectId(e.target.value); const p = projects.find(p => p.id === e.target.value); setRanges(defaultRanges(p?.name || '', p?.areas || [])); }}><option value="">Choose a project</option>{projects.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field"><span>Activity names — one per line</span><textarea rows={3} value={names} onChange={e => setNames(e.target.value)} /></label><div className="range-caption"><h3>Floors and flat ranges</h3><button className="text-button" onClick={() => setRanges(old => old.map(r => ({ ...r, enabled: !old.every(x => x.enabled) })))}>{ranges.every(r => r.enabled) ? 'Deselect all floors' : 'Select all floors'}</button></div><div className="floor-ranges">{ranges.map((r, i) => <div className="floor-range" key={i}><input className="activity-check" type="checkbox" aria-label={`Include floor row ${i + 1}`} checked={r.enabled} onChange={e => setRanges(old => old.map((v, j) => j === i ? { ...v, enabled: e.target.checked } : v))} /><label className="field"><span>Floor / area</span><input aria-label={`Floor row ${i + 1} area`} maxLength={100} value={r.area} onChange={e => setRanges(old => old.map((v, j) => j === i ? { ...v, area: e.target.value } : v))} /></label><label className="field"><span>First flat</span><input aria-label={`Floor row ${i + 1} first flat`} type="number" min="1" max="999" value={r.from} onChange={e => setRanges(old => old.map((v, j) => j === i ? { ...v, from: e.target.value } : v))} /></label><label className="field"><span>Last flat</span><input aria-label={`Floor row ${i + 1} last flat`} type="number" min="1" max="999" value={r.to} onChange={e => setRanges(old => old.map((v, j) => j === i ? { ...v, to: e.target.value } : v))} /></label><button className="icon-button" aria-label={`Remove floor row ${i + 1}`} onClick={() => setRanges(old => old.filter((_, j) => j !== i))}><X size={16} /></button></div>)}</div><button className="secondary" onClick={() => setRanges(old => [...old, { area: '', from: '1', to: '1', enabled: true }])}><Plus size={15} />Add floor row</button>
    </> : <>
      <div className="bulk-progress" role="status" aria-live="polite"><strong>{finished ? 'Save complete' : 'Review before saving'}</strong><p>{mode === 'update' ? `${selected.length} selected activities` : `${entries.length} planned activities`} · {saved} saved · {skipped} duplicates skipped · {remaining} remaining</p>{busy && <p>Saving in batches of up to 100. Keep this form open.</p>}</div>
      {mode === 'update' ? <><p className="field-hint">Changed fields: {Object.keys(patch).map(k => ({ riserRoute:'planned route',floorRange:'installed floor range',percent: 'completion', status: 'status', responsible: 'responsible person', start: 'planned start', end: 'planned finish' }[k])).join(', ')}. Each row below shows the resulting values.</p><div className="bulk-preview table-wrap"><table><thead><tr><th>Activity</th><th>Progress before → after</th><th>Status before → after</th><th>Responsible</th><th>Start / finish</th></tr></thead><tbody>{updated.map(a => { const before = selected.find(x => x.id === a.id)!; return <tr key={a.id}><td>{a.name}{isRiser(a)&&<><small>{plannedRoute(a)}</small><small>{installedRange(a)}</small></>}</td><td>{progressText(before)} → {progressText(a)}<small>{a.mode==='floor'?'Calculated floor sections':a.mode === 'quantity' ? 'Quantity tracking retained' : 'Manual percentage'}</small></td><td>{before.status} → {a.status}</td><td>{a.responsible || 'Unassigned'}</td><td>{dateLabel(a.start)} / {dateLabel(a.end)}</td></tr>; })}</tbody></table></div></> : <><p className="field-hint">Existing matches are skipped. New records use manual tracking, 0%, Not started; dates and responsible person are blank.</p><div className="bulk-preview"><ul>{entries.map(e => <li key={entryKey(e)}>{e.name}</li>)}</ul></div></>}
    </>}
    {error && <div className="form-error" role="alert">{error}</div>}
    </div><div className="editor-footer"><button className="secondary" disabled={busy} onClick={close}>{finished ? 'Done' : 'Close'}</button>{preview && !attempted.current && <button className="secondary" disabled={busy} onClick={() => { setPreview(false); setError(''); setSkipped(0); }}>Back to edit</button>}{!preview ? <button className="primary" disabled={busy} onClick={makePreview}>{busy ? <RefreshCw size={16} className="spinning" /> : <ChevronRight size={16} />}Preview changes</button> : !finished && <button className="primary" disabled={busy || !remaining} onClick={save}>{busy ? <RefreshCw size={16} className="spinning" /> : <Check size={16} />}{busy ? 'Saving…' : error ? 'Retry remaining' : `Save ${remaining} activities`}</button>}</div></dialog>;
}
