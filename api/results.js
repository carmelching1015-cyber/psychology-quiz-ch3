import { neon } from '@neondatabase/serverless';
import { createHash, timingSafeEqual } from 'node:crypto';

const PASSCODE_HASH = '8cb174721dd8f8b3457d3845169fa426204e9489ad95c1ca9c922adf7ddd1b93';
const url = () => process.env.QUIZ_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const allowed = request => {
  const value = createHash('sha256').update(String(request.headers['x-ta-passcode'] || '')).digest('hex');
  return timingSafeEqual(Buffer.from(value), Buffer.from(PASSCODE_HASH));
};
async function setup(sql) {
  await sql`CREATE TABLE IF NOT EXISTS chapter3_quiz_results (
    session_id TEXT PRIMARY KEY, student_name TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0,
    answered INTEGER NOT NULL DEFAULT 0, current_level INTEGER NOT NULL DEFAULT 2,
    highest_level INTEGER NOT NULL DEFAULT 2, completed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}
export default async function handler(request, response) {
  if (!url()) return response.status(503).json({error:'Quiz database is not configured.'});
  try {
    const sql = neon(url()); await setup(sql);
    if (request.method === 'POST') {
      const b = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
      const id = String(b.id || '').slice(0,100); if (!id) return response.status(400).json({error:'Missing session id.'});
      const student = String(b.student || 'Anonymous student').trim().slice(0,80) || 'Anonymous student';
      const score = Math.max(0,Math.min(10,Number(b.score)||0)), answered = Math.max(0,Math.min(10,Number(b.answered)||0));
      const level = Math.max(1,Math.min(3,Number(b.level)||2)), highest = Math.max(1,Math.min(3,Number(b.highestLevel)||2));
      await sql`INSERT INTO chapter3_quiz_results (session_id,student_name,score,answered,current_level,highest_level,completed,updated_at)
        VALUES (${id},${student},${score},${answered},${level},${highest},${Boolean(b.completed)},NOW())
        ON CONFLICT (session_id) DO UPDATE SET student_name=${student},score=${score},answered=${answered},current_level=${level},highest_level=${highest},completed=${Boolean(b.completed)},updated_at=NOW()`;
      return response.status(200).json({ok:true});
    }
    if (!allowed(request)) return response.status(401).json({error:'Incorrect TA passcode.'});
    if (request.method === 'GET') {
      const rows=await sql`SELECT session_id,student_name,score,answered,current_level,highest_level,completed,updated_at FROM chapter3_quiz_results ORDER BY updated_at DESC LIMIT 1000`;
      return response.status(200).json(rows.map(x=>({id:x.session_id,student:x.student_name,score:x.score,answered:x.answered,level:x.current_level,highestLevel:x.highest_level,completed:x.completed,updatedAt:new Date(x.updated_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})})));
    }
    if (request.method === 'DELETE') { await sql`DELETE FROM chapter3_quiz_results`; return response.status(200).json({ok:true}); }
    response.setHeader('Allow','GET, POST, DELETE'); return response.status(405).json({error:'Method not allowed.'});
  } catch { return response.status(500).json({error:'Unable to access quiz results.'}); }
}
