import { z } from 'zod';
const short = z.string().trim().max(200);
const required = short.min(1, 'This field is required.');
const date = z.string().refine(s => s === '' || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s), 'Enter a valid date.');
const base = { id: z.string().max(100).optional() };
const notes = z.string().trim().max(5000).default('');
export const projectSchema = z.object({...base, name: required, location: short, contractor: short, start: date, end: date, areas: z.array(required).max(100), archived:z.boolean().default(false) }).refine(x => !x.start || !x.end || x.start <= x.end, {message:'Finish date must be on or after start date.', path:['end']});
export const activitySchema = z.object({...base, projectId:required, name:required, area:short, responsible:short, start:date, end:date, status:z.enum(['Not started','In progress','Blocked','Complete']), mode:z.enum(['quantity','manual']), unit:short, planned:z.number().finite().min(0), completed:z.number().finite().min(0), percent:z.number().finite().min(0).max(100), notes }).superRefine((x,c) => {
  if(x.start && x.end && x.start>x.end) c.addIssue({code:'custom',path:['end'],message:'Finish date must be on or after start date.'});
  if(x.mode==='quantity' && (x.planned<=0 || !x.unit)) c.addIssue({code:'custom',path:['planned'],message:'Quantity tracking needs a planned quantity above zero and a unit.'});
  if(x.mode==='quantity' && x.completed>x.planned) c.addIssue({code:'custom',path:['completed'],message:'Completed quantity cannot exceed planned quantity.'});
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
export function progress(a: {mode:string; planned:number; completed:number; percent:number}) { return a.mode==='quantity' ? (a.planned>0 ? a.completed/a.planned*100 : 0) : a.percent; }
export function projectProgress(activities:Activity[]) { return activities.length ? activities.reduce((s,a)=>s+progress(a),0)/activities.length : null; }
export function today() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function overdue(a:Activity,day=today()) { return !!a.end && a.end<day && progress(a)<100; }
