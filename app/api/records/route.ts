import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { projectSchema,activitySchema,inspectionSchema,actionSchema, type Kind } from '../../model';
import { activityContext, saveActivityChanges } from '../../activity-store';
import { ActivityRuleError } from '../../prerequisites';
export const dynamic='force-dynamic';
const kinds = ['projects','activities','inspections','actions'] as const;
const schemas = {projects:projectSchema,activities:activitySchema,inspections:inspectionSchema,actions:actionSchema};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message:string,status=400)=>json({error:message},status);
async function owned(kind:Kind,id:string,owner:string) { return env.DB!.prepare(`SELECT * FROM ${kind} WHERE id=? AND owner=?`).bind(id,owner).first<{id:string;data:string;project_id?:string;activity_id?:string;inspection_id?:string}>(); }
export async function GET() {
  const user=await getChatGPTUser(); if(!user) return fail('Sign in to view your records.',401);
  try {
    const rows=await env.DB!.batch(kinds.map(kind=>env.DB!.prepare(`SELECT data FROM ${kind} WHERE owner=? ORDER BY rowid DESC`).bind(user.userId)));
    return json(Object.fromEntries(kinds.map((kind,i)=>[kind,rows[i].results.map((r:any)=>JSON.parse(r.data))])));
  } catch { return fail('Your records could not be loaded. Please try again.',503); }
}
export async function POST(request:Request) {
  const user=await getChatGPTUser(); if(!user) return fail('Sign in to save records.',401);
  if(new URL(request.url).origin!==request.headers.get('origin')) return fail('Invalid request origin.',403);
  try {
    const body:any=await request.json(); const kind=body.kind as Kind;
    if(!kinds.includes(kind)) return fail('Unknown record type.');
    const parsed=schemas[kind].safeParse(body.record);
    if(!parsed.success) return fail(parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(' '));
    const data:any={...parsed.data,id:parsed.data.id||crypto.randomUUID()};
    const existing=parsed.data.id?await owned(kind,data.id,user.userId):null;
    if(parsed.data.id&&!existing) return fail('Record not found.',404);
    if(kind!=='projects') {
      const project=await owned('projects',data.projectId,user.userId); if(!project) return fail('Project not found.',404);
      if(existing && existing.project_id!==data.projectId) return fail('An existing record cannot be moved between projects.');
      if(kind==='inspections') { const activity=await owned('activities',data.activityId,user.userId); if(!activity || activity.project_id!==data.projectId) return fail('Choose an activity from this project.'); if(existing && existing.activity_id!==data.activityId) return fail('Create a new inspection to change its linked activity.'); }
      if(kind==='actions') { const inspection=await owned('inspections',data.inspectionId,user.userId); if(!inspection || inspection.project_id!==data.projectId) return fail('Choose an inspection from this project.'); if(existing && existing.inspection_id!==data.inspectionId) return fail('The linked inspection cannot be changed.'); }
    }
    const db=env.DB!;
    if(kind==='activities'){
      const context=await activityContext(db,user.userId,data.projectId);
      if(parsed.data.id&&!context.activities.some(a=>a.id===data.id))return fail('Record not found.',404);
      await saveActivityChanges(context,[data]);return json({record:data});
    }
    const values:Record<string,unknown>={id:data.id,owner:user.userId};
    if(kind!=='projects') values.project_id=data.projectId;
    if(kind==='inspections') values.activity_id=data.activityId;
    if(kind==='actions') values.inspection_id=data.inspectionId;
    values.data=JSON.stringify(data);
    const cols=Object.keys(values);
    const statement=existing?(kind==='projects'?db.prepare("UPDATE projects SET data=CASE WHEN json_type(data,'$.__activityGuard') IS NULL THEN ? ELSE json_set(?,'$.__activityGuard',json_extract(data,'$.__activityGuard')) END WHERE id=? AND owner=?").bind(values.data,values.data,data.id,user.userId):db.prepare(`UPDATE ${kind} SET data=? WHERE id=? AND owner=?`).bind(values.data,data.id,user.userId)):db.prepare(`INSERT INTO ${kind} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...Object.values(values));
    const batch=[statement];
    if(kind==='projects' && !existing && body.templates) {
      if(!Array.isArray(body.templates) || body.templates.length>30 || body.templates.some((s:any)=>typeof s!=='string'||!s.trim()||s.length>200)) return fail('Activity template names must contain 1–200 characters.');
      for(const name of body.templates) {
        const a={id:crypto.randomUUID(),projectId:data.id,name:name.trim(),area:'',responsible:'',start:'',end:'',status:'Not started',mode:'manual',unit:'',planned:0,completed:0,percent:0,notes:''};
        batch.push(db.prepare('INSERT INTO activities (id,owner,project_id,data) VALUES (?,?,?,?)').bind(a.id,user.userId,data.id,JSON.stringify(a)));
      }
    }
    await db.batch(batch); return json({record:data});
  } catch(e) { if(e instanceof ActivityRuleError)return fail(e.message,e.status);return fail('This record could not be saved. Your changes are still in the form; please try again.',503); }
}
export async function DELETE(request:Request) {
  const user=await getChatGPTUser(); if(!user) return fail('Sign in to delete records.',401);
  if(new URL(request.url).origin!==request.headers.get('origin')) return fail('Invalid request origin.',403);
  try { const body:any=await request.json(); const kind=body.kind as Kind;
    if(!kinds.includes(kind)||typeof body.id!=='string') return fail('Invalid record.');
    const existing=await owned(kind,body.id,user.userId);if(!existing) return fail('Record not found.',404);
    if(kind==='activities'){const context=await activityContext(env.DB!,user.userId,existing.project_id!);await saveActivityChanges(context,[],[body.id]);return json({deleted:true});}
    await env.DB!.prepare(`DELETE FROM ${kind} WHERE id=? AND owner=?`).bind(body.id,user.userId).run();
    return json({deleted:true});
  } catch(e) {if(e instanceof ActivityRuleError)return fail(e.message,e.status);return fail('This record could not be deleted. Please try again.',503);}
}

