import type { Activity } from './model';
import { ActivityRuleError, linkedDependents, validateActivityChanges } from './prerequisites';

export async function activityContext(db:D1Database,owner:string,projectId:string){
  const project=await db.prepare('SELECT data FROM projects WHERE id=? AND owner=?').bind(projectId,owner).first<{data:string}>();
  if(!project)throw new ActivityRuleError('Project not found.',404);
  const rows=await db.prepare('SELECT data FROM activities WHERE project_id=? AND owner=?').bind(projectId,owner).all<{data:string}>();
  return {db,owner,projectId,revision:JSON.parse(project.data).__activityGuard?.revision||0,activities:rows.results.map(r=>JSON.parse(r.data) as Activity)};
}
export async function saveActivityChanges(context:Awaited<ReturnType<typeof activityContext>>,changes:Activity[],removeIds:string[]=[]){
  const {db,owner,projectId,revision,activities}=context;
  validateActivityChanges(activities,changes);
  for(const id of removeIds){const dependents=linkedDependents(id,activities);if(dependents.length)throw new ActivityRuleError(`This activity is a prerequisite for ${dependents.map(a=>a.name).slice(0,5).join(', ')}${dependents.length>5?` and ${dependents.length-5} more`:''}. Remove those prerequisite links before deleting it.`,409);}
  if(!changes.length&&!removeIds.length)return;
  // A project-scoped compare-and-set serializes activity graph changes. Each
  // statement is gated by a fresh token, so a failed lease cannot partially save.
  const token=crypto.randomUUID();const guard=JSON.stringify({revision:revision+1,token});
  const statements=[db.prepare("UPDATE projects SET data=json_set(data,'$.__activityGuard',json(?)) WHERE id=? AND owner=? AND COALESCE(json_extract(data,'$.__activityGuard.revision'),0)=?").bind(guard,projectId,owner,revision)];
  const gate="EXISTS (SELECT 1 FROM projects WHERE id=? AND owner=? AND json_extract(data,'$.__activityGuard.token')=?)";
  const existing=new Set(activities.map(a=>a.id));
  for(const a of changes){
    if(a.projectId!==projectId)throw new ActivityRuleError('Activities must belong to the selected project.');
    statements.push(existing.has(a.id)?db.prepare(`UPDATE activities SET data=? WHERE id=? AND owner=? AND project_id=? AND ${gate}`).bind(JSON.stringify(a),a.id,owner,projectId,projectId,owner,token):db.prepare(`INSERT INTO activities (id,owner,project_id,data) SELECT ?,?,?,? WHERE ${gate}`).bind(a.id,owner,projectId,JSON.stringify(a),projectId,owner,token));
  }
  for(const id of removeIds)statements.push(db.prepare(`DELETE FROM activities WHERE id=? AND owner=? AND project_id=? AND ${gate}`).bind(id,owner,projectId,projectId,owner,token));
  const results=await db.batch(statements);
  if(results[0].meta.changes!==1)throw new ActivityRuleError('Project activities changed during this save. Refresh records and retry your remaining changes.',409);
}
