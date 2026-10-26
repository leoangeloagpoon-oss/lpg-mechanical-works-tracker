import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { bulkRequestSchema, applyBulkPatch, entryKey } from '../../../activity-tools';
import type { Activity } from '../../../model';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: 'Sign in to save activities.' }, 401);
  if (new URL(request.url).origin !== request.headers.get('origin')) return json({ error: 'Invalid request origin.' }, 403);
  let body;
  try { body = bulkRequestSchema.parse(await request.json()); }
  catch (e: any) { return json({ error: e.issues?.map((i: any) => i.message).join(' ') || 'Invalid bulk request.' }, 400); }
  try {
    const db = env.DB!;
    const project = await db.prepare('SELECT id FROM projects WHERE id=? AND owner=?').bind(body.projectId, user.userId).first();
    if (!project) return json({ error: 'Project not found.' }, 404);
    if (body.operation === 'update') {
      const ids = [...new Set(body.ids)];
      const rows = await db.prepare('SELECT data FROM activities WHERE owner=? AND project_id=? AND id IN (SELECT value FROM json_each(?))').bind(user.userId, body.projectId, JSON.stringify(ids)).all<{ data: string }>();
      if (rows.results.length !== ids.length) return json({ error: 'Some activities are unavailable or belong to another project. Refresh and select again.' }, 404);
      let updated: Activity[];
      try { updated = rows.results.map(r => applyBulkPatch(JSON.parse(r.data), body.patch)); }
      catch (e: any) { return json({ error: e.issues?.map((i: any) => i.message).join(' ') || 'Review the selected progress and dates.' }, 400); }
      await db.batch(updated.map(a => db.prepare('UPDATE activities SET data=? WHERE id=? AND owner=? AND project_id=?').bind(JSON.stringify(a), a.id, user.userId, body.projectId)));
      return json({ saved: updated.length, skipped: 0 });
    }
    const entries = [...new Map(body.entries.map(e => [entryKey(e), e])).values()];
    const statements = entries.map(e => {
      const record = { id: crypto.randomUUID(), projectId: body.projectId, name: e.name, area: e.area, responsible: '', start: '', end: '', status: 'Not started', mode: 'manual', unit: '', planned: 0, completed: 0, percent: 0, notes: '' };
      return db.prepare(`INSERT INTO activities (id,owner,project_id,data) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM activities WHERE owner=? AND project_id=? AND lower(trim(json_extract(data,'$.name')))=lower(trim(?)) AND lower(trim(json_extract(data,'$.area')))=lower(trim(?)))`).bind(record.id, user.userId, body.projectId, JSON.stringify(record), user.userId, body.projectId, e.name, e.area);
    });
    const results = await db.batch(statements);
    const saved = results.reduce((s, r) => s + (r.meta.changes || 0), 0);
    return json({ saved, skipped: body.entries.length - saved });
  } catch { return json({ error: 'This batch could not be saved. Your remaining entries are kept here; retry to continue safely.' }, 503); }
}
