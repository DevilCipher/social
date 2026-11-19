import {db,decode} from './db.js';
import {publishOne,checkResult} from './providers.js';
import {refreshableStatuses,summarize} from './model.mjs';
export function createDispatcher({getSQL=db,publish=publishOne,check=checkResult}={}){
 async function dispatch(id){
 const sql=getSQL();
 // Recheck the approving member at dispatch time; deactivation or demotion stops queued sends.
 await sql`UPDATE heart_posts p SET status='pending_review',authorized_by=NULL,revision=revision+1,updated_at=NOW() WHERE p.id=${id} AND p.status IN ('queued','scheduled') AND NOT EXISTS (SELECT 1 FROM heart_users u WHERE u.id=p.authorized_by AND u.active=true AND u.role IN ('owner','admin'))`;
 const rows=await sql`UPDATE heart_posts p SET status='publishing',revision=revision+1,updated_at=NOW() WHERE p.id=${id} AND p.status IN ('queued','scheduled') AND (p.scheduled_at IS NULL OR p.scheduled_at<=NOW()) AND EXISTS (SELECT 1 FROM heart_users u WHERE u.id=p.authorized_by AND u.active=true AND u.role IN ('owner','admin')) RETURNING p.*`;
 if(!rows.length)return;
 const post=decode(rows[0]);
 await send(post,post.networks.filter(network=>post.results[network]?.status!=='published'));
 }

 async function send(post, networks){
 const sql=getSQL();
 await Promise.all(networks.map(async network=>{
 let result;
 try{result=await publish(post,network);}catch(error){
 const retryable=error?.retryable===true && error?.uncertain!==true;
 result={status:retryable?'failed':'uncertain',retryable,
 detail:retryable?error.message:'Delivery could not be confirmed. Check the provider and destination before sending again.'};
 }
 const saved={...result,attempts:(post.results[network]?.attempts ?? 0)+1,attemptedAt:new Date().toISOString()};
 await sql`UPDATE heart_posts SET results=results || ${JSON.stringify({[network]:saved})}::jsonb,updated_at=NOW()
 WHERE id=${post.id} AND status='publishing' AND revision=${post.version}`;
 }));
 const [latest]=await sql`SELECT results FROM heart_posts WHERE id=${post.id} AND status='publishing' AND revision=${post.version}`;
 if(!latest)return;
 const status=summarize(latest.results);
 await sql`WITH changed AS (
 UPDATE heart_posts SET status=${status},revision=revision+1,updated_at=NOW()
 WHERE id=${post.id} AND status='publishing' AND revision=${post.version} RETURNING id
 ) INSERT INTO heart_audit(actor_id,action,target_id,details)
 SELECT ${post.authorizedBy},'post.dispatch.complete',id::text,${JSON.stringify({status})}::jsonb FROM changed`;
 }

 async function retryDelivery(id,network,version,actorId){
 const sql=getSQL();
 // Claim the entire post before contacting the provider. Concurrent requests cannot claim the same revision.
 const rows=await sql`WITH changed AS (
 UPDATE heart_posts p SET status='publishing',authorized_by=${actorId},revision=revision+1,updated_at=NOW(),
 results=jsonb_set(p.results,ARRAY[${network}]::text[],(p.results -> ${network}::text) || '{"status":"publishing","retryable":false,"detail":null}'::jsonb)
 WHERE p.id=${id} AND p.revision=${version} AND p.status IN ('partial','failed','needs_review','processing')
 AND (p.payload->'networks') ? ${network} AND p.results->${network}::text @> '{"status":"failed","retryable":true}'::jsonb
 AND EXISTS (SELECT 1 FROM heart_users u WHERE u.id=${actorId} AND u.active AND u.role IN ('owner','admin'))
 RETURNING p.*
 ), logged AS (
 INSERT INTO heart_audit(actor_id,action,target_id,details)
 SELECT ${actorId},'post.delivery.retry',id::text,${JSON.stringify({network})}::jsonb FROM changed
 ) SELECT * FROM changed`;
 if(!rows.length)return false;
 await send(decode(rows[0]),[network]);
 return true;
 }

 async function refreshPost(id){
 const sql=getSQL(),rows=await sql`SELECT *,updated_at::text AS delivery_updated_at FROM heart_posts WHERE id=${id}`;
 if(!rows.length)return;
 const post=decode(rows[0]);
 if(!refreshableStatuses.includes(post.status))return;
 // Publish and cron routes have a 60-second function limit. Give interrupted sends time to finish.
 if(post.status==='publishing'&&Date.now()-new Date(post.updatedAt).getTime()<300000)return;
 const results={...post.results};
 await Promise.all(post.networks.map(async network=>{
 const result=results[network];
 if(!result || result.status==='publishing'){
 results[network]={...result,status:'uncertain',retryable:false,detail:'No final result was saved. Check this destination before sending again.'};
 }else if(result.status==='accepted'){
 try{results[network]=await check(result,network);}catch{/* Keep the last confirmed state. */}
 }
 }));
 const status=summarize(results);
 await sql`UPDATE heart_posts SET results=${JSON.stringify(results)}::jsonb,status=${status},revision=revision+1,updated_at=NOW()
 WHERE id=${id} AND status=${post.status} AND revision=${post.version} AND updated_at=${rows[0].delivery_updated_at}::timestamptz`;
 }

 return {dispatch,refreshPost,retryDelivery};
}

const dispatcher=createDispatcher();
export const dispatch=dispatcher.dispatch;
export const refreshPost=dispatcher.refreshPost;

export const retryDelivery=dispatcher.retryDelivery;
