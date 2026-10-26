import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { activitySchema, progress, progressText, installedRange, plannedRoute, projectProgress } from '../app/model.ts';
const dir=path.resolve('.sites-runtime/riser-tests');mkdirSync(dir,{recursive:true});
const code=ts.transpileModule(readFileSync('app/activity-tools.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("from './model'","from '../../app/model.ts'");
writeFileSync(path.join(dir,'tools.mjs'),code);
const {applyBulkPatch,bulkPatchSchema}=await import(pathToFileURL(path.join(dir,'tools.mjs')));
const base={id:'r',projectId:'p',name:'Riser R01 — 1st floor to roof',area:'Risers',responsible:'Engineer',start:'',end:'',status:'Not started',mode:'manual',unit:'',planned:0,completed:0,percent:0,notes:'Retain these notes'};
const route={startLevel:1,endLevel:10};
const range={from:1,to:3,installed:true};
const configured=applyBulkPatch(base,{riserRoute:route});
assert.equal(configured.mode,'manual');assert.equal(configured.percent,0);assert.equal(configured.riser.installedSections,null);assert.equal(installedRange(configured),'Installed range not recorded');
let a=applyBulkPatch(configured,{floorRange:range});
assert.equal(progressText(a),'22.2%');assert.equal(a.status,'In progress');assert.equal(a.id,base.id);assert.equal(a.notes,base.notes);
assert.deepEqual(applyBulkPatch(a,{floorRange:range}),a,'Repeated floor entry is idempotent');
assert.equal(progressText(applyBulkPatch(base,{riserRoute:{startLevel:1,endLevel:16},floorRange:range})),'13.3%');
assert.equal(progressText(applyBulkPatch(base,{riserRoute:{startLevel:1,endLevel:18},floorRange:range})),'11.8%');
a=applyBulkPatch(a,{floorRange:{from:5,to:7,installed:true}});assert.deepEqual(a.riser.installedSections,[1,2,5,6]);assert.equal(installedRange(a),'1st floor – 3rd floor, 5th floor – 7th floor');
a=applyBulkPatch(a,{floorRange:{from:1,to:2,installed:false}});assert.deepEqual(a.riser.installedSections,[2,5,6]);
assert.throws(()=>applyBulkPatch(a,{riserRoute:{startLevel:1,endLevel:6}}));
assert.throws(()=>applyBulkPatch(a,{floorRange:{from:9,to:12,installed:true}}));
assert.throws(()=>applyBulkPatch(a,{status:'Complete'}));
a=applyBulkPatch(a,{floorRange:{from:1,to:10,installed:true}});assert.equal(progress(a),100);assert.equal(a.status,'Complete');
a=applyBulkPatch(a,{floorRange:{from:2,to:3,installed:false}});assert.equal(a.status,'In progress');assert.equal(progressText(a),'88.9%');
assert.equal(applyBulkPatch({...configured,status:'Blocked'},{floorRange:range}).status,'Blocked');
assert.throws(()=>applyBulkPatch({...base,percent:40,status:'In progress'},{riserRoute:route,floorRange:range}),'Unmapped existing progress is protected');
assert.equal(applyBulkPatch({...base,percent:40,status:'In progress'},{riserRoute:route}).percent,40);
assert.equal(bulkPatchSchema.safeParse({floorRange:{from:3,to:1,installed:true}}).success,false);
assert.equal(activitySchema.safeParse({...a,riser:{...a.riser,installedSections:[1,1]}}).success,false);
assert.equal(activitySchema.safeParse({...a,riser:undefined}).success,false);
assert.equal(projectProgress([a,{...base,percent:10}]),(progress(a)+10)/2);
assert.equal(plannedRoute(configured),'1st floor – 10th floor');
console.log('PASS: per-route percentages, unknown range preservation, repeat entry, discontinuous ranges, correction, completion, Blocked preservation, invalid route/range validation, averages.');

const url='http://127.0.0.1:5173';
assert.equal((await fetch(url+'/api/activities/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
const login=await fetch(url+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function api(route,body,expected=200,origin=url){const response=await fetch(url+route,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();let data;try{data=JSON.parse(text)}catch{data={error:text}}assert.equal(response.status,expected,JSON.stringify(data));return data;}
async function remove(id){const res=await fetch(url+'/api/records',{method:'DELETE',headers:{Cookie:cookie,Origin:url,'Content-Type':'application/json'},body:JSON.stringify({kind:'projects',id})});assert.equal(res.status,200);}
for(const p of (await api('/api/records')).projects.filter(p=>p.location==='Disposable riser QA'))await remove(p.id);
const projects=[];let success=false;
try{
 const p=(await api('/api/records',{kind:'projects',record:{name:'Riser floor QA',location:'Disposable riser QA',contractor:'QA',start:'',end:'',areas:['Risers']}})).record;projects.push(p.id);
 const other=(await api('/api/records',{kind:'projects',record:{name:'Other riser QA',location:'Disposable riser QA',contractor:'',start:'',end:'',areas:[]}})).record;projects.push(other.id);
 const entries=Array.from({length:22},(_,i)=>({name:`Riser R${String(i+1).padStart(2,'0')} — 1st floor to roof`,area:'Risers'}));
 await api('/api/activities/bulk',{operation:'create',projectId:p.id,entries});
 const records=(await api('/api/records')).activities.filter(a=>a.projectId===p.id);const originalIds=records.map(a=>a.id).sort();
 const number=a=>Number(a.name.match(/Riser R(\d+)/)[1]);
 const endpoint=a=>number(a)<=16||number(a)===20?10:[19,21].includes(number(a))?16:18;
 const update=(ids,patch,expected=200,projectId=p.id)=>api('/api/activities/bulk',{operation:'update',projectId,ids,patch},expected);
 for(const endLevel of [10,16,18])await update(records.filter(a=>endpoint(a)===endLevel).map(a=>a.id),{riserRoute:{startLevel:1,endLevel}});
 const installed=records.filter(a=>number(a)!==20);
 const first=records.find(a=>number(a)===1),r20=records.find(a=>number(a)===20);
 const inspection=(await api('/api/records',{kind:'inspections',record:{projectId:p.id,activityId:first.id,reference:'R-QA',requested:'2026-10-26',inspected:'',inspector:'',result:'Pending',comments:''}})).record;
 await update(installed.map(a=>a.id),{floorRange:range});await update(installed.map(a=>a.id),{floorRange:range});
 const read=await api('/api/records');let now=read.activities.filter(a=>a.projectId===p.id);
 assert.deepEqual(now.map(a=>a.id).sort(),originalIds);assert.equal(now.length,22);
 for(const record of now){if(number(record)===20){assert.equal(record.mode,'manual');assert.equal(record.percent,0);assert.equal(record.status,'Not started');assert.equal(record.riser.installedSections,null);}else{assert.deepEqual(record.riser.installedSections,[1,2]);assert.equal(record.status,'In progress');assert.equal(progressText(record),endpoint(record)===10?'22.2%':endpoint(record)===16?'13.3%':'11.8%');}}
 assert.equal(read.inspections.find(i=>i.id===inspection.id).activityId,first.id);
 await update(installed.map(a=>a.id),{floorRange:{from:9,to:12,installed:true}},400);
 assert.deepEqual((await api('/api/records')).activities.find(a=>a.id===first.id).riser.installedSections,[1,2],'Invalid mixed-endpoint batch is atomic');
 await update([first.id],{floorRange:range},404,other.id);
 await update(['not-owned'],{floorRange:range},404);
 await update([first.id],{floorRange:{from:0,to:3,installed:true}},400);
 await api('/api/activities/bulk',{operation:'update',projectId:p.id,ids:[first.id],patch:{floorRange:range}},403,'https://untrusted.example');
 const one=now.find(a=>a.id===first.id);
 await api('/api/records',{kind:'activities',record:{...one,riser:{...one.riser,installedSections:[1,2,7]},responsible:'QA engineer',notes:'Preserved QA notes'}});
 await update([first.id],{floorRange:{from:1,to:3,installed:true}});
 assert.deepEqual((await api('/api/records')).activities.find(a=>a.id===first.id).riser.installedSections,[1,2,7]);
 await update([first.id],{floorRange:{from:7,to:8,installed:false}});
 await api('/api/records',{kind:'activities',record:{...one,riser:{...one.riser,installedSections:[1,10]}}},400);
 const r20Before=(await api('/api/records')).activities.find(a=>a.id===r20.id);assert.equal(installedRange(r20Before),'Installed range not recorded');
 success=true;
 if(process.argv.includes('--keep')){writeFileSync('.sites-runtime/riser-qa.json',JSON.stringify({projects,projectId:p.id}));console.log('Retained disposable local riser project for browser checks.');}
 console.log('PASS: authenticated individual/bulk floor saves, 22 stable IDs, R20 unchanged, preserved inspection link and extra installed section, atomic mixed-route rejection, ownership/origin checks, refresh persistence.');
}finally{if(!success||!process.argv.includes('--keep'))for(const id of projects)await remove(id);}
