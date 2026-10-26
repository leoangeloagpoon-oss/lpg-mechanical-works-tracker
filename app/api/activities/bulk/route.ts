import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { bulkRequestSchema, applyBulkPatch, entryKey } from '../../../activity-tools';
import { activityContext, saveActivityChanges } from '../../../activity-store';
import { ActivityRuleError } from '../../../prerequisites';
import type { Activity } from '../../../model';

export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Sign in to save activities.'},401);
 if(new URL(request.url).origin!==request.headers.get('origin'))return json({error:'Invalid request origin.'},403);
 let body;
 try{body=bulkRequestSchema.parse(await request.json());}catch(e:any){return json({error:e.issues?.map((i:any)=>i.message).join(' ')||'Invalid bulk request.'},400);}
 try{
  const context=await activityContext(env.DB!,user.userId,body.projectId);
  if(body.operation==='update'){
   const ids=new Set(body.ids);const selected=context.activities.filter(a=>ids.has(a.id));
   if(selected.length!==ids.size)return json({error:'Some activities are unavailable or belong to another project. Refresh and select again.'},404);
   let updated:Activity[];
   try{updated=selected.map(a=>applyBulkPatch(a,body.patch));}catch(e:any){return json({error:e.issues?.map((i:any)=>i.message).join(' ')||e.message||'Review the selected progress and dates.'},400);}
   await saveActivityChanges(context,updated);return json({saved:updated.length,skipped:0});
  }
  const existing=new Set(context.activities.map(entryKey));const entries=[...new Map(body.entries.map(e=>[entryKey(e),e])).values()].filter(e=>!existing.has(entryKey(e)));
  const created:Activity[]=entries.map(e=>({id:crypto.randomUUID(),projectId:body.projectId,name:e.name,area:e.area,responsible:'',start:'',end:'',status:'Not started',mode:'manual',unit:'',planned:0,completed:0,percent:0,notes:''}));
  await saveActivityChanges(context,created);return json({saved:created.length,skipped:body.entries.length-created.length});
 }catch(e){if(e instanceof ActivityRuleError)return json({error:e.message},e.status);return json({error:'This batch could not be saved. Your remaining entries are kept here; retry to continue safely.'},503);}
}