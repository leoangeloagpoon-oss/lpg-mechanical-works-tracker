'use client';
import { installedRange, levelLabel, plannedRoute, type RiserTracking } from './model';

export function LevelSelect({label,value,onChange,start=false}:{label:string;value:number;onChange:(n:number)=>void;start?:boolean}){
  return <label className="field"><span>{label}</span><select value={value} onChange={e=>onChange(Number(e.target.value))}>{Array.from({length:start?17:18},(_,i)=>i+1).map(n=><option value={n} key={n}>{levelLabel(n)}</option>)}</select></label>;
}
export function RiserFields({value,onChange}:{value?:RiserTracking;onChange:(value:RiserTracking)=>void}){
  const r=value||{startLevel:1,endLevel:18,installedSections:null};
  const sections=Array.from({length:Math.max(0,r.endLevel-r.startLevel)},(_,i)=>r.startLevel+i);
  const invalid=(r.installedSections||[]).filter(s=>s<r.startLevel||s>=r.endLevel);
  function toggle(section:number,checked:boolean){const next=new Set(r.installedSections||[]);checked?next.add(section):next.delete(section);onChange({...r,installedSections:[...next].sort((a,b)=>a-b)});}
  return <div className="riser-fields"><h3>Riser route and installed sections</h3><div className="form-grid"><LevelSelect label="Planned start floor" value={r.startLevel} start onChange={startLevel=>onChange({...r,startLevel})}/><LevelSelect label="Planned end floor" value={r.endLevel} onChange={endLevel=>onChange({...r,endLevel})}/></div><p className="field-hint">Roof means the roof above the 17th floor. Each floor-to-floor section has equal weight.</p><div className="riser-route-note"><strong>{plannedRoute({riser:r})}</strong><span>{installedRange({riser:r})}</span></div>{invalid.length>0&&<div className="form-error" role="alert">The new route excludes installed sections. Clear those sections below or restore the route before saving.<button className="text-button" type="button" onClick={()=>onChange({...r,installedSections:(r.installedSections||[]).filter(s=>s>=r.startLevel&&s<r.endLevel)})}>Clear {invalid.length} outside-route sections</button></div>}<fieldset className="section-checklist"><legend>Installed floor sections</legend>{sections.map(s=><label className="checkbox" key={s}><input type="checkbox" checked={r.installedSections?.includes(s)||false} onChange={e=>toggle(s,e.target.checked)}/><span>{levelLabel(s)} → {levelLabel(s+1)}</span></label>)}</fieldset><p className="field-hint">Select every installed section, including separate ranges. Selecting a section switches this riser to calculated floor progress. Clearing all recorded sections means 0% installed.</p></div>;
}
