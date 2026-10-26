import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
assert.equal((await fetch(base+'/api/records')).status,401,'Anonymous reads blocked');
for(const method of ['POST','DELETE']) assert.equal((await fetch(base+'/api/records',{method,headers:{'Content-Type':'application/json'},body:'{}'})).status,401,'Anonymous writes blocked');
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=auth.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
assert.ok(cookie,'Local development sign-in available');
async function request(method,body,expected=200){const res=await fetch(base+'/api/records',{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});const d=await res.json();assert.equal(res.status,expected,JSON.stringify(d));return d;}
const created=[];
try {
 const p1=(await request('POST',{kind:'projects',record:{name:'QA Alpha',location:'Site A',contractor:'QA',start:'',end:'',areas:['Tank yard']},templates:['Piping','Supports']})).record;created.push(p1.id);
 const p2=(await request('POST',{kind:'projects',record:{name:'QA Beta',location:'Site B',contractor:'QA',start:'',end:'',areas:[]}})).record;created.push(p2.id);
 let d=await request('GET');
 assert.equal(d.activities.filter(a=>a.projectId===p1.id).length,2);
 assert.equal(d.activities.filter(a=>a.projectId===p2.id).length,0);
 let a=d.activities.find(a=>a.projectId===p1.id);
 a=(await request('POST',{kind:'activities',record:{...a,mode:'quantity',unit:'m',planned:100,completed:25,status:'In progress'}})).record;
 await request('POST',{kind:'activities',record:{...a,completed:101}},400);
 await request('POST',{kind:'activities',record:{...a,projectId:p2.id}},400);
 const failed={projectId:p1.id,activityId:a.id,reference:'QA-WIR-1',requested:'2026-10-20',inspected:'2026-10-21',inspector:'QA inspector',result:'Failed',comments:'Correct and reinspect'};
 await request('POST',{kind:'inspections',record:{...failed,projectId:p2.id}},400);
 const i=(await request('POST',{kind:'inspections',record:failed})).record;
 const c=(await request('POST',{kind:'actions',record:{projectId:p1.id,inspectionId:i.id,title:'Correct issue',responsible:'QA',due:'2026-10-28',status:'Open',notes:''}})).record;
 await request('POST',{kind:'inspections',record:{...failed,reference:'QA-WIR-1-R',requested:'2026-10-22',inspected:'2026-10-23',result:'Passed',comments:'Accepted'}});
 await request('POST',{kind:'actions',record:{...c,status:'Closed'}});
 await request('POST',{kind:'projects',record:{...p2,archived:true}});
 d=await request('GET');
 assert.equal(d.activities.find(x=>x.id===a.id).completed,25,'Saved quantity survives fresh read');
 assert.deepEqual(d.inspections.filter(x=>x.projectId===p1.id).map(x=>x.result).sort(),['Failed','Passed'],'Reinspection preserves original');
 assert.equal(d.actions.find(x=>x.id===c.id).status,'Closed');
 assert.equal(d.projects.find(x=>x.id===p2.id).archived,true);
 const csrf=await fetch(base+'/api/records',{method:'POST',headers:{Cookie:cookie,Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({kind:'projects',record:p1})});assert.equal(csrf.status,403);
 await request('POST',{kind:'projects',record:{...p1,id:'not-owned'}},404);
 console.log('PASS: anonymous read/write rejection, origin validation, two-project separation, templates, quantity validation, persistent saves, failed/pass history, corrective closure, archiving, unknown-owner update.');
} finally {
 for(const id of created) await request('DELETE',{kind:'projects',id});
 const d=await request('GET');
 assert.ok(!d.activities.some(x=>created.includes(x.projectId)));
 assert.ok(!d.inspections.some(x=>created.includes(x.projectId)));
 assert.ok(!d.actions.some(x=>created.includes(x.projectId)));
 console.log('PASS: cascading deletion; all disposable local QA records removed.');
}
