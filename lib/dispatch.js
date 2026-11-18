import {db,decode} from './db.js';
import {publishOne,checkResult} from './providers.js';
import {summarize} from './model.mjs';
export function createDispatcher({getSQL=db,publish=publishOne,check=checkResult}={}){
 async function dispatch(id){
 const sql=getSQL();
 // Recheck the approving member at dispatch time; deactivation or demotion stops queued sends.
 await sql`UPDATE heart_posts p SET status='pending_review',authorized_by=NULL,revision=revision+1,updated_at=NOW() WHERE p.id=${id} AND p.status IN ('queued','scheduled') AND NOT EXISTS (SELECT 1 FROM heart_users u WHERE u.id=p.authorized_by AND u.active=true AND u.role IN ('owner','admin'))`;
 const rows=await sql`UPDATE heart_posts p SET status='publishing',revision=revision+1,updated_at=NOW() WHERE p.id=${id} AND p.status IN ('queued','scheduled') AND (p.scheduled_at IS NULL OR p.scheduled_at<=NOW()) AND EXISTS (SELECT 1 FROM heart_users u WHERE u.id=p.authorized_by AND u.active=true AND u.role IN ('owner','admin')) RETURNING p.*`;
 if(!rows.length)return;
 const post=decode(rows[0]);
 // Save each result separately. Never blindly repeat a request after a crash.
 await Promise.all(post.networks.map(async network=>{
 if(post.results[network]?.status==='published')return;
 let r;try{r=await publish(post,network);}catch(e){r={status:e.uncertain?'uncertain':'failed',detail:e.message};}
 await sql`UPDATE heart_posts SET results=results || ${JSON.stringify({[network]:r})}::jsonb, updated_at=NOW() WHERE id=${id}`;
 }));
 const latest=await sql`SELECT results FROM heart_posts WHERE id=${id}`;
 await sql`UPDATE heart_posts SET status=${summarize(latest[0].results)}, updated_at=NOW() WHERE id=${id}`;
 await sql`INSERT INTO heart_audit(actor_id,action,target_id,details) VALUES(${post.authorizedBy},'post.dispatch.complete',${id},${JSON.stringify({status:summarize(latest[0].results)})}::jsonb)`;
}
async function refreshPost(id){
 const sql=getSQL(),rows=await sql`SELECT * FROM heart_posts WHERE id=${id}`;if(!rows.length)return;
 const p=decode(rows[0]);if(!['processing','partial','failed','needs_review'].includes(p.status))return;
 const results={...p.results};
 for(const network of p.networks)if(!results[network])results[network]={status:'uncertain',detail:'No final result was saved. Check this destination before retrying.'};
 for(const [network,r] of Object.entries(results))if(r.status==='accepted'){try{results[network]=await check(r,network);}catch{/* Keep last known state; never convert a network error to success. */}}
 const status=Object.values(results).some(r=>r.status==='needs_review')?'needs_review':summarize(results);
 await sql`UPDATE heart_posts SET results=${JSON.stringify(results)}::jsonb,status=${status},updated_at=NOW() WHERE id=${id}`;
}

 return {dispatch,refreshPost};
}
const dispatcher=createDispatcher();
export const dispatch=dispatcher.dispatch;
export const refreshPost=dispatcher.refreshPost;
