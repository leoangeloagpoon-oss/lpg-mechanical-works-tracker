'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { overdue, isRiser, levelLabel, plannedRoute, installedRange, progressText, type Activity, type Project } from './model';
import { ReadinessStatus } from './prerequisite-fields';
import { createReadinessResolver } from './prerequisites';
import { activityGroups, activityParts, activitySummary } from './activity-tools';
import BulkDialog from './bulk-dialog';

function Selection({ records, selected, onToggle, label }: { records: Activity[]; selected: Set<string>; onToggle: (records: Activity[]) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const count = records.filter(a => selected.has(a.id)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < records.length; }, [count, records.length]);
  return <input ref={ref} className="activity-check" type="checkbox" aria-label={label} checked={!!records.length && count === records.length} onChange={() => onToggle(records)} />;
}
function Summary({ records, resolve }: { records: Activity[];resolve:ReturnType<typeof createReadinessResolver> }) {
  const s = activitySummary(records);
  return <span className="group-metrics"><span>{s.count} {s.count === 1 ? 'activity' : 'activities'}</span><span>{s.complete} complete</span><strong>{records.some(isRiser)?s.percent.toFixed(1):Math.round(s.percent)}%</strong><span>{s.blocked} blocked</span><span>{s.overdue} overdue</span><span>{records.filter(a=>resolve(a).state==="waiting").length} waiting</span><span>{records.filter(a=>resolve(a).state==="review").length} review</span></span>;
}
const dateLabel = (s: string) => s || '—';
export default function ActivityWorkspace({ activities, projects, allActivities, projectId, scopeKey, onEdit, onDelete, onRefresh }: { activities: Activity[]; projects: Project[]; allActivities:Activity[]; projectId: string; scopeKey: string; onEdit: (a: Activity) => void; onDelete: (a: Activity) => void; onRefresh: () => Promise<void> }) {
  const [layout, setLayout] = useState('grouped');
  const resolveReadiness=useMemo(()=>createReadinessResolver(allActivities),[allActivities]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'update' | 'create' | null>(null);
  // Reset selections when the filter scope changes using the render-time state
  // adjustment pattern instead of a synchronous effect.
  const [lastScopeKey, setLastScopeKey] = useState(scopeKey);
  if (lastScopeKey !== scopeKey) { setLastScopeKey(scopeKey); setSelected(new Set()); setExpanded(new Set()); }
  const selectedRecords = activities.filter(a => selected.has(a.id));
  const selectedProjects = new Set(selectedRecords.map(a => a.projectId));
  const projectName = (id: string) => projects.find(p => p.id === id)?.name || 'Project';
  function toggle(records: Activity[]) { setSelected(old => { const next = new Set(old); const all = records.every(a => next.has(a.id)); records.forEach(a => all ? next.delete(a.id) : next.add(a.id)); return next; }); }
  function expand(key: string) { setExpanded(old => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  function rows(records: Activity[], short = false) {
    return <div className="table-wrap"><table className="activity-table"><thead><tr><th><Selection records={records} selected={selected} onToggle={toggle} label="Select all activities in this table" /></th><th>{short ? 'Flat / work' : 'Activity / project'}</th><th>Area / planned route</th><th>Responsible</th><th>Progress</th><th>Finish</th><th>Status</th><th>Readiness</th><th>Actions</th></tr></thead><tbody>{[...records].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(a => <tr key={a.id}><td><Selection records={[a]} selected={selected} onToggle={toggle} label={`Select ${a.name}`} /></td><td><button className="cell-link" onClick={() => onEdit(a)}>{short ? activityParts(a).item : a.name}</button><small>{projectName(a.projectId)}</small>{isRiser(a)&&<small className="installed-range">{installedRange(a)}</small>}</td><td>{(isRiser(a)?plannedRoute(a):a.area) || '—'}</td><td>{a.responsible || 'Unassigned'}</td><td><strong>{progressText(a)}</strong><small>{a.mode === 'floor' ? `${a.riser?.installedSections?.length||0} / ${(a.riser?.endLevel||1)-(a.riser?.startLevel||1)} sections` : a.mode === 'manual' ? 'Manual percentage' : `${a.completed} / ${a.planned} ${a.unit}`}</small></td><td className={overdue(a) ? 'red-text' : ''}>{dateLabel(a.end)}{overdue(a) && <small>Overdue</small>}</td><td><span className={`badge ${a.status === 'Complete' ? 'good' : a.status === 'Blocked' ? 'bad' : ''}`}><i />{a.status}</span></td><td><ReadinessStatus value={resolveReadiness(a)} compact/></td><td><div className="row-buttons"><button className="text-button" aria-label={`Edit ${a.name}`} onClick={() => onEdit(a)}>Edit</button><button className="text-button danger" aria-label={`Delete ${a.name}`} onClick={() => onDelete(a)}>Delete</button></div></td></tr>)}</tbody></table></div>;
  }
  return <>
    <div className="activity-toolbar"><div className="segmented" aria-label="Activity display"><button aria-pressed={layout === 'grouped'} className={layout === 'grouped' ? 'active' : ''} onClick={() => setLayout('grouped')}>Grouped view</button><button aria-pressed={layout === 'register'} className={layout === 'register' ? 'active' : ''} onClick={() => setLayout('register')}>Full register</button></div><button className="secondary" disabled={!projects.some(p => !p.archived)} onClick={() => setDialog('create')}><Plus size={15} />Bulk add</button></div>
    <div className="selection-bar"><label className="checkbox"><Selection records={activities} selected={selected} onToggle={toggle} label="Select all matching activities" /><span>Select all matching</span></label><strong aria-live="polite">{selectedRecords.length} selected</strong><button className="text-button" onClick={() => setSelected(new Set())} disabled={!selectedRecords.length}>Clear selection</button><button className="primary" onClick={() => setDialog('update')} disabled={!selectedRecords.length || selectedProjects.size !== 1}>Bulk update</button>{selectedProjects.size > 1 && <p>Choose records from one project to update together.</p>}</div>
    {!activities.length ? <div className="empty"><h3>No matching activities</h3><p>Adjust your filters, add an activity, or use Bulk add for repeated work.</p></div> : layout === 'register' ? <section className="panel table-panel"><div className="table-caption"><h2>Activity register <span className="number-tag">{activities.length}</span></h2><span>Select records to update together.</span></div>{rows(activities)}</section> : <div className="activity-groups">{activityGroups(activities).map(g => {
      const key = `group:${g.name.toLowerCase()}`;
      const floors = new Map<string, { area: string; projectId: string; records: Activity[] }>();
      for (const a of g.records) { const area = isRiser(a)?(a.riser?'To '+levelLabel(a.riser.endLevel):'Route not configured'):(activityParts(a).area || 'No area'); const fk = `${a.projectId}:${area}`; if (!floors.has(fk)) floors.set(fk, { area, projectId: a.projectId, records: [] }); floors.get(fk)!.records.push(a); }
      return <section className="activity-group panel" key={key}><div className="group-header"><Selection records={g.records} selected={selected} onToggle={toggle} label={`Select all ${g.name} activities`} /><button className="group-toggle" aria-expanded={expanded.has(key)} aria-controls={`body-${encodeURIComponent(key)}`} onClick={() => expand(key)}>{expanded.has(key) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<span><strong>{g.name}</strong><Summary records={g.records} resolve={resolveReadiness}/></span></button></div>{expanded.has(key) && <div id={`body-${encodeURIComponent(key)}`} className="group-body">{[...floors.entries()].sort((a, b) => a[1].area.localeCompare(b[1].area, undefined, { numeric: true }) || a[1].projectId.localeCompare(b[1].projectId)).map(([fk, floor]) => {
        const floorKey = `${key}:${fk}`;
        return <div className="activity-floor" key={fk}><div className="floor-header"><Selection records={floor.records} selected={selected} onToggle={toggle} label={`Select ${g.name} on ${floor.area} in ${projectName(floor.projectId)}`} /><button className="group-toggle" aria-expanded={expanded.has(floorKey)} aria-controls={`body-${encodeURIComponent(floorKey)}`} onClick={() => expand(floorKey)}>{expanded.has(floorKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span><strong>{floor.area}</strong><small>{projectName(floor.projectId)}</small><Summary records={floor.records} resolve={resolveReadiness}/></span></button></div>{expanded.has(floorKey) && <div id={`body-${encodeURIComponent(floorKey)}`}>{rows(floor.records, true)}</div>}</div>;
      })}</div>}</section>;
    })}</div>}
    {dialog && <BulkDialog mode={dialog} selected={selectedRecords} allActivities={allActivities} projects={projects} initialProject={projectId === 'all' ? projects.find(p => !p.archived)?.id || '' : projectId} onClose={async changed => { setDialog(null); if (changed) { setSelected(new Set()); await onRefresh(); } }} />}
  </>;
}
