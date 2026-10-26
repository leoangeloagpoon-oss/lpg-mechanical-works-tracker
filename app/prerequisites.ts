import { levelLabel, progress, prerequisiteKey, type Activity, type Prerequisite } from './model';

export class ActivityRuleError extends Error { constructor(message:string,public status=400){super(message);} }
export type Readiness={state:'ready'|'waiting'|'review';label:string;missing:string[]};
export const finished=(a:Activity)=>progress(a)>=100||a.status==='Complete';
export function prerequisiteLabel(p:Prerequisite,records:Map<string,Activity>){const source=records.get(p.activityId);return `${source?.name||'Unavailable activity'}${p.type==='riserSection'?` — ${levelLabel(p.sectionStartLevel)} → ${levelLabel(p.sectionStartLevel+1)}`:''}`;}
export function createReadinessResolver(activities:Activity[]){
  const records=new Map(activities.map(a=>[a.id,a]));const cache=new Map<string,Readiness>();const visiting=new Set<string>();
  function resolve(a:Activity):Readiness{
    const cached=cache.get(a.id);if(cached)return cached;
    if(visiting.has(a.id))return {state:finished(a)?'review':'waiting',label:'Circular prerequisite — review needed',missing:['Circular prerequisite']};
    visiting.add(a.id);const missing:string[]=[];
    for(const p of a.prerequisites||[]){
      const source=records.get(p.activityId);const label=prerequisiteLabel(p,records);
      if(!source||source.projectId!==a.projectId){missing.push(`${label}: unavailable in this project`);continue;}
      if(p.type==='riserSection'){
        if(!source.riser||p.sectionStartLevel<source.riser.startLevel||p.sectionStartLevel>=source.riser.endLevel)missing.push(`${label}: section is outside the current route`);
        else if(source.mode!=='floor'||!source.riser.installedSections?.includes(p.sectionStartLevel))missing.push(`${label}: not recorded installed`);
      }else if(progress(source)<100||source.status!=='Complete')missing.push(`${label}: not complete`);
      else if(resolve(source).state!=='ready')missing.push(`${label}: has unresolved prerequisites`);
    }
    visiting.delete(a.id);const state=missing.length?(finished(a)?'review':'waiting'):'ready';
    const result:Readiness={state,label:state==='ready'?'Ready':state==='review'?'Prerequisite changed — review needed':'Waiting for prerequisite',missing};cache.set(a.id,result);return result;
  }
  return resolve;
}
const linkKeys=(a?:Activity)=>(a?.prerequisites||[]).map(prerequisiteKey).sort().join('|');
function completionSignature(a:Activity){return JSON.stringify([a.mode,a.planned,a.completed,a.percent,a.riser||null,a.status]);}
export function validateActivityChanges(current:Activity[],changes:Activity[]){
  const before=new Map(current.map(a=>[a.id,a]));const proposed=new Map(before);for(const a of changes)proposed.set(a.id,a);
  for(const a of changes){
    const oldKeys=new Set((before.get(a.id)?.prerequisites||[]).map(prerequisiteKey));
    for(const p of a.prerequisites||[]){
      if(p.activityId===a.id)throw new ActivityRuleError(`${a.name}: an activity cannot require itself.`);
      const source=proposed.get(p.activityId);
      // A correction may invalidate an existing section; retain the link so its
      // review flag stays visible, while rejecting newly introduced bad links.
      if(!oldKeys.has(prerequisiteKey(p))){
        if(!source||source.projectId!==a.projectId)throw new ActivityRuleError(`${a.name}: choose an available prerequisite from the same project.`,404);
        if(p.type==='riserSection'&&(!source.riser||p.sectionStartLevel<source.riser.startLevel||p.sectionStartLevel>=source.riser.endLevel))throw new ActivityRuleError(`${a.name}: choose a section within the prerequisite riser's planned route.`);
      }
    }
  }
  const done=new Set<string>(),visiting=new Set<string>();
  function visit(id:string){if(done.has(id))return;if(visiting.has(id))throw new ActivityRuleError('Circular prerequisites are not allowed.');visiting.add(id);for(const p of proposed.get(id)?.prerequisites||[])if(proposed.has(p.activityId))visit(p.activityId);visiting.delete(id);done.add(id);}
  for(const a of changes)visit(a.id);
  const resolve=createReadinessResolver([...proposed.values()]);
  for(const a of changes){const old=before.get(a.id),readiness=resolve(a);if(finished(a)&&readiness.state!=='ready'&&(!old||!finished(old)||linkKeys(a)!==linkKeys(old)||completionSignature(a)!==completionSignature(old)))throw new ActivityRuleError(`${a.name} cannot be completed. ${readiness.missing.join('; ')}. Reopen an already completed activity before adding an unmet prerequisite.`,409);}
  return resolve;
}
export function linkedDependents(id:string,activities:Activity[]){return activities.filter(a=>a.id!==id&&a.prerequisites?.some(p=>p.activityId===id));}
export function orderActivityChanges(changes:Activity[]){const records=new Map(changes.map(a=>[a.id,a])),done=new Set<string>(),ordered:Activity[]=[];function visit(a:Activity){if(done.has(a.id))return;done.add(a.id);for(const p of a.prerequisites||[]){const source=records.get(p.activityId);if(source)visit(source);}ordered.push(a);}for(const a of changes)visit(a);return ordered;}
