import { z } from 'zod';
const short = z.string().trim().max(200);
const required = short.min(1, 'This field is required.');
const date = z.string().refine(s => s === '' || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s), 'Enter a valid date.');
const base = { id: z.string().max(100).optional() };
const notes = z.string().trim().max(5000).default('');
export const projectSchema = z.object({...base, name: required, location: short, contractor: short, start: date, end: date, areas: z.array(required).max(100), archived:z.boolean().default(false) }).refine(x => !x.start || !x.end || x.start <= x.end, {message:'Finish date must be on or after start date.', path:['end']});
export const riserRouteSchema = z.object({startLevel:z.number().int().min(1).max(17),endLevel:z.number().int().min(2).max(18)}).strict().refine(r=>r.endLevel>r.startLevel,'The end floor must be above the start floor.');
export const riserSchema = z.object({startLevel:z.number().int().min(1).max(17),endLevel:z.number().int().min(2).max(18),installedSections:z.array(z.number().int().min(1).max(17)).max(17).nullable()}).strict().superRefine((r,c)=>{
  if(r.endLevel<=r.startLevel)c.addIssue({code:'custom',message:'The end floor must be above the start floor.'});
  if(r.installedSections && (new Set(r.installedSections).size!==r.installedSections.length || r.installedSections.some(s=>s<r.startLevel||s>=r.endLevel)))c.addIssue({code:'custom',message:'Installed sections must be unique and within the planned route.'});
});
export type RiserTracking = z.infer<typeof riserSchema>;
export const activitySchema = z.object({...base, projectId:required, name:required, area:short, responsible:short, start:date, end:date, status:z.enum(['Not started','In progress','Blocked','Complete']), mode:z.enum(['quantity','manual','floor']), riser:riserSchema.optional(), unit:short, planned:z.number().finite().min(0), completed:z.number().finite().min(0), percent:z.number().finite().min(0).max(100), notes }).superRefine((x,c) => {
  if(x.start && x.end && x.start>x.end) c.addIssue({code:'custom',path:['end'],message:'Finish date must be on or after start date.'});
  if(x.mode==='quantity' && (x.planned<=0 || !x.unit)) c.addIssue({code:'custom',path:['planned'],message:'Quantity tracking needs a planned quantity above zero and a unit.'});
  if(x.mode==='quantity' && x.completed>x.planned) c.addIssue({code:'custom',path:['completed'],message:'Completed quantity cannot exceed planned quantity.'});
  if(x.mode==='floor' && (!x.riser || x.riser.installedSections===null))c.addIssue({code:'custom',path:['riser'],message:'Floor tracking needs a planned route and recorded installed sections.'});
  if(x.status==='Complete' && progress(x)<100) c.addIssue({code:'custom',path:['status'],message:'A complete activity must have 100% progress.'});
});
export const inspectionSchema = z.object({...base, projectId:required, activityId:required, reference:required, requested:date.refine(Boolean,'Request date is required.'), inspected:date, inspector:short, result:z.enum(['Pending','Passed','Failed','Reinspection required']), comments:notes }).superRefine((x,c) => {
  if(x.inspected && x.requested>x.inspected) c.addIssue({code:'custom',path:['inspected'],message:'Inspection cannot precede the request date.'});
  if(x.result!=='Pending' && (!x.inspected || !x.inspector)) c.addIssue({code:'custom',path:['inspected'],message:'A recorded result needs an inspection date and inspector.'});
});
export const actionSchema = z.object({...base, projectId:required, inspectionId:required, title:required, responsible:short, due:date, status:z.enum(['Open','Closed']), notes });
export type Project = z.infer<typeof projectSchema> & {id:string};
export type Activity = z.infer<typeof activitySchema> & {id:string};
export type Inspection = z.infer<typeof inspectionSchema> & {id:string};
export type Action = z.infer<typeof actionSchema> & {id:string};
export type Kind = 'projects'|'activities'|'inspections'|'actions';
export type Records = {projects:Project[]; activities:Activity[]; inspections:Inspection[]; actions:Action[]};
export const emptyRecords:Records = {projects:[],activities:[],inspections:[],actions:[]};
export const templates = ['Tanks / manifolds','Piping','Supports','Valves / regulators','Equipment connections','Testing','Handover'];
export function progress(a: {mode:string; planned:number; completed:number; percent:number;riser?:RiserTracking}) { return a.mode==='floor' ? (a.riser && a.riser.endLevel>a.riser.startLevel ? new Set(a.riser.installedSections||[]).size/(a.riser.endLevel-a.riser.startLevel)*100 : 0) : a.mode==='quantity' ? (a.planned>0 ? a.completed/a.planned*100 : 0) : a.percent; }
export function levelLabel(level:number) {if(level===18)return 'Roof';const suffix=level>=11&&level<=13?'th':level%10===1?'st':level%10===2?'nd':level%10===3?'rd':'th';return `${level}${suffix} floor`;}
export function isRiser(a:Pick<Activity,'name'|'riser'>){return !!a.riser || /^Riser\s+R\d+\s+—/i.test(a.name);}
export function plannedRoute(a:Pick<Activity,'riser'>){return a.riser?`${levelLabel(a.riser.startLevel)} – ${levelLabel(a.riser.endLevel)}`:'Planned route not configured';}
export function installedRange(a:Pick<Activity,'riser'>){
  if(!a.riser || a.riser.installedSections===null)return 'Installed range not recorded';
  const sections=[...a.riser.installedSections].sort((a,b)=>a-b);if(!sections.length)return 'No sections installed';
  const ranges:string[]=[];let start=sections[0],end=start+1;
  for(const section of sections.slice(1)){if(section===end)end++;else{ranges.push(`${levelLabel(start)} – ${levelLabel(end)}`);start=section;end=section+1;}}
  ranges.push(`${levelLabel(start)} – ${levelLabel(end)}`);return ranges.join(', ');
}
export function progressText(a:Parameters<typeof progress>[0]){return a.mode==='floor'||a.riser?`${progress(a).toFixed(1)}%`:`${Math.round(progress(a))}%`;}
export function floorStatus(a:Parameters<typeof progress>[0],oldStatus:string){return oldStatus==='Blocked'?'Blocked':progress(a)===100?'Complete':progress(a)>0?'In progress':'Not started';}
export function projectProgress(activities:Activity[]) { return activities.length ? activities.reduce((s,a)=>s+progress(a),0)/activities.length : null; }
export function today() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function overdue(a:Activity,day=today()) { return !!a.end && a.end<day && progress(a)<100; }
