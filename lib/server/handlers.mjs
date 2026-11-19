import {randomUUID} from 'node:crypto';
import {handleUpload} from '@vercel/blob/client';
import {decode} from '../db.js';
import {currentUser,createSession,sessionToken,sessionHash,sessionCookie,hashToken,token,equal,hashPassword,verifyPassword,validPassword,sameOrigin} from '../auth.js';
import {isManager,canCreate,hasNetworks,canViewPost,canEditPost,canManageMember,publicUser,networkIDs} from '../permissions.mjs';
import {validate,safeMediaURL,canRetryDelivery} from '../model.mjs';
const json=(body,status=200,cookie)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=id=>{if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))fail(400,'Invalid identifier.');return id;};
const emailValue=value=>{if(typeof value!=='string')fail(400,'Enter a valid email.');const email=value.trim().toLowerCase();if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email.');return email;};
async function body(req){const t=await req.text();if(t.length>250000)fail(413,'Request too large.');try{return JSON.parse(t);}catch{fail(400,'Invalid JSON.');}}
async function limit(sql,key,max=10){const r=await sql`INSERT INTO heart_login_attempts(key,count,resets_at) VALUES(${hashToken(key)},1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN heart_login_attempts.resets_at<NOW() THEN 1 ELSE heart_login_attempts.count+1 END,resets_at=CASE WHEN heart_login_attempts.resets_at<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE heart_login_attempts.resets_at END RETURNING count`;if(r[0].count>max)fail(429,'Too many attempts. Try again in 15 minutes.');}
const ip=req=>req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';
const audit=(sql,user,action,id,details={})=>sql`INSERT INTO heart_audit(actor_id,action,target_id,details) VALUES(${user.id},${action},${id},${JSON.stringify(details)}::jsonb)`;
export function createHandlers({getSQL,cloudReady,connections,dispatch,refreshPost,retryDelivery}){
 const wrap=(fn,{publicRoute=false,origin=true}={})=>async req=>{try{
 if(!cloudReady())fail(503,'Cloud setup is incomplete. Team access needs a configured database.');
 if(origin&&req.method!=='GET'&&!sameOrigin(req))fail(403,'Invalid request origin.');
 const sql=getSQL(),user=await currentUser(sql,req);if(!publicRoute&&!user)fail(401,'Sign in to continue.');
 return await fn(req,sql,user);
 }catch(e){return json({error:e.status?e.message:e.code==='23505'?'That email or record already exists.':'The operation could not be completed. Check database setup and service connections.'},e.status||(e.code==='23505'?409:500));}};
 const getPost=async(sql,id,user)=>{const rows=await sql`SELECT * FROM heart_posts WHERE id=${uuid(id)}`;if(!rows.length)fail(404,'Post not found.');const p=decode(rows[0]);if(!canViewPost(user,p))fail(403,'You do not have access to this post.');return p;};
 const manager=user=>{if(!isManager(user))fail(403,'Owner or Admin access is required.');};
 return {
 config:async req=>{if(!cloudReady())return json({cloud:false,authenticated:false,user:null,uploads:false,scheduler:false});return wrap(async(req,sql,user)=>json({cloud:true,authenticated:!!user,user:publicUser(user),uploads:!!process.env.BLOB_READ_WRITE_TOKEN&&!!process.env.BLOB_HOSTNAME,scheduler:process.env.SCHEDULER_ENABLED==='true'&&!!process.env.CRON_SECRET}),{publicRoute:true})(req);},
 login:wrap(async(req,sql)=>{
 const b=await body(req);await limit(sql,`login-ip:${ip(req)}`,30);const email=emailValue(b.email);await limit(sql,`login-email:${email}`);
 const rows=await sql`SELECT * FROM heart_users WHERE email=${email}`;const u=rows[0];
 // Always do the costly hash even for an unknown account, to reduce account enumeration.
 const dummy='scrypt$00000000000000000000000000000000$'+'0'.repeat(128);
 const correct=await verifyPassword(b.password,u?.password_hash||dummy);
 if(!u?.active||!correct)fail(401,'Email or password is incorrect.');
 const t=await createSession(sql,u.id);await audit(sql,u,'auth.login',u.id);return json({user:publicUser(u)},200,sessionCookie(t));
 },{publicRoute:true}),
 logout:wrap(async(req,sql)=>{await sql`DELETE FROM heart_sessions WHERE token_hash=${sessionHash(sessionToken(req))}`;return json({ok:true},200,sessionCookie('',true));},{publicRoute:true}),
 acceptInvite:wrap(async(req,sql)=>{
 await limit(sql,`invite-ip:${ip(req)}`,20);const b=await body(req);if(!/^[A-Za-z0-9_-]{43}$/.test(b.token||''))fail(400,'Invalid or expired invitation.');if(!validPassword(b.password))fail(400,'Use a password of 12–128 characters.');
 const h=hashToken(b.token),found=await sql`SELECT i.user_id FROM heart_invitations i JOIN heart_users u ON u.id=i.user_id WHERE i.token_hash=${h} AND i.expires_at>NOW() AND u.active=true`;
 if(!found.length)fail(400,'Invalid or expired invitation.');
 const ph=await hashPassword(b.password);
 // Consume once and change the password in the same statement; replay cannot win a race.
 const rows=await sql`WITH claimed AS (DELETE FROM heart_invitations WHERE token_hash=${h} AND expires_at>NOW() RETURNING user_id),changed AS (UPDATE heart_users u SET password_hash=${ph},updated_at=NOW() FROM claimed c WHERE u.id=c.user_id AND u.active=true RETURNING u.*),revoked AS (DELETE FROM heart_sessions s USING changed c WHERE s.user_id=c.id),logged AS (INSERT INTO heart_audit(actor_id,action,target_id) SELECT id,'auth.invitation.accept',id::text FROM changed) SELECT * FROM changed`;
 if(!rows.length)fail(400,'Invalid or expired invitation.');
 const t=await createSession(sql,rows[0].id);return json({user:publicUser(rows[0])},200,sessionCookie(t));
 },{publicRoute:true}),
 password:wrap(async(req,sql,user)=>{
 await limit(sql,`password:${user.id}`);const b=await body(req);if(!await verifyPassword(b.currentPassword,user.password_hash))fail(400,'Current password is incorrect.');if(!validPassword(b.password))fail(400,'Use a password of 12–128 characters.');const ph=await hashPassword(b.password);
 await sql.transaction([sql`UPDATE heart_users SET password_hash=${ph},updated_at=NOW() WHERE id=${user.id}`,sql`DELETE FROM heart_sessions WHERE user_id=${user.id}`,audit(sql,user,'auth.password.change',user.id)]);
 const t=await createSession(sql,user.id);return json({ok:true},200,sessionCookie(t));
 }),
 accounts:wrap(async(req,sql,user)=>{const all=await connections();return json(Object.fromEntries(Object.entries(all).filter(([n])=>hasNetworks(user,[n]))));}),
 teamList:wrap(async(req,sql,user)=>{manager(user);const rows=await sql`SELECT * FROM heart_users ORDER BY created_at`;return json(rows.map(publicUser));}),
 teamCreate:wrap(async(req,sql,user)=>{
 manager(user);const b=await body(req),email=emailValue(b.email);if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100)fail(400,'Enter a name of 1–100 characters.');
 if(!['admin','editor','viewer'].includes(b.role)||!canManageMember(user,null,b.role))fail(403,'You cannot assign that role.');
 if(!Array.isArray(b.networks)||b.networks.some(n=>!networkIDs.includes(n)))fail(400,'Choose valid platforms.');
 const id=randomUUID(),t=token(),networks=JSON.stringify([...new Set(b.networks)]);
 await sql.transaction([sql`INSERT INTO heart_users(id,email,name,role,networks) VALUES(${id},${email},${b.name.trim()},${b.role},${networks}::jsonb)`,sql`INSERT INTO heart_invitations(token_hash,user_id,created_by,expires_at) VALUES(${hashToken(t)},${id},${user.id},NOW()+INTERVAL '7 days')`,audit(sql,user,'team.invite',id,{role:b.role})]);
 return json({inviteUrl:`${new URL(process.env.APP_URL).origin}/#invite=${t}`,expiresIn:'7 days'},201);
 }),
 teamUpdate:wrap(async(req,sql,user)=>{
 manager(user);const b=await body(req),id=uuid(b.id);const rows=await sql`SELECT * FROM heart_users WHERE id=${id}`;const target=rows[0];if(!target)fail(404,'Member not found.');
 if((b.action==='update'&&!['admin','editor','viewer'].includes(b.role))||!canManageMember(user,target,b.action==='update'?b.role:undefined))fail(403,'You cannot manage this member or assign that role.');
 if(b.action==='invite'){
 if(!target.active)fail(400,'Enable the member before generating a sign-in link.');const t=token();
 await sql.transaction([sql`DELETE FROM heart_invitations WHERE user_id=${id}`,sql`INSERT INTO heart_invitations(token_hash,user_id,created_by,expires_at) SELECT ${hashToken(t)},id,${user.id},NOW()+INTERVAL '7 days' FROM heart_users WHERE id=${id} AND active=true AND role<>'owner' AND (${user.role==='owner'} OR role IN ('editor','viewer'))`,audit(sql,user,'team.invite.reissue',id)]);
 return json({inviteUrl:`${new URL(process.env.APP_URL).origin}/#invite=${t}`,expiresIn:'7 days'});
 }
 if(b.action!=='update'||typeof b.active!=='boolean'||!Array.isArray(b.networks)||b.networks.some(n=>!networkIDs.includes(n)))fail(400,'Invalid member update.');
 const changed=await sql`WITH updated AS (UPDATE heart_users SET role=${b.role},active=${b.active},networks=${JSON.stringify([...new Set(b.networks)])}::jsonb,updated_at=NOW() WHERE id=${id} AND role<>'owner' AND (${user.role==='owner'} OR role IN ('editor','viewer')) RETURNING id),revoked AS (DELETE FROM heart_sessions USING updated WHERE user_id=updated.id),invites AS (DELETE FROM heart_invitations USING updated WHERE user_id=updated.id),logged AS (INSERT INTO heart_audit(actor_id,action,target_id,details) SELECT ${user.id},'team.access.update',id::text,${JSON.stringify({role:b.role,active:b.active,networks:b.networks})}::jsonb FROM updated) SELECT * FROM updated`;
 if(!changed.length)fail(409,'Member changed. Refresh the team list.');return json({ok:true});
 }),
 audit:wrap(async(req,sql,user)=>{manager(user);return json(await sql`SELECT a.id,a.action,a.target_id,a.details,a.created_at,u.name AS actor_name FROM heart_audit a LEFT JOIN heart_users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200`);}),
 postsList:wrap(async(req,sql,user)=>{const rows=await sql`SELECT * FROM heart_posts ORDER BY created_at DESC LIMIT 1000`;return json(rows.map(decode).filter(p=>canViewPost(user,p)));}),
 postsSave:wrap(async(req,sql,user)=>{
 if(!canCreate(user))fail(403,'Your role is read-only.');const b=await body(req),mode=b.mode||'draft';if(!['draft','submit','publish','schedule'].includes(mode))fail(400,'Invalid action.');
 if(['publish','schedule'].includes(mode))manager(user);
 const errors=validate(b,mode!=='draft');if(errors.length)fail(400,errors.join(' '));if(!hasNetworks(user,b.networks))fail(403,'You do not have access to every selected platform.');
 if(b.media.some(m=>!safeMediaURL(m.url,process.env.BLOB_HOSTNAME)))fail(400,'Upload media to the configured store first.');
 if(['publish','schedule'].includes(mode)){const a=await connections();if(b.networks.some(n=>!a[n]?.connected))fail(400,'Connect every selected account before publishing.');}
 let scheduled=null;if(mode==='schedule'){if(process.env.SCHEDULER_ENABLED!=='true'||!process.env.CRON_SECRET)fail(400,'Configure the scheduler before scheduling.');if(!b.scheduledAt||!Number.isFinite(new Date(b.scheduledAt).getTime())||new Date(b.scheduledAt)<=new Date())fail(400,'Choose a future date.');scheduled=new Date(b.scheduledAt).toISOString();}
 const id=uuid(b.id||randomUUID()),oldRows=await sql`SELECT * FROM heart_posts WHERE id=${id}`,old=oldRows[0]&&decode(oldRows[0]);
 if(old){if(!canEditPost(user,old))fail(403,'You cannot edit this post.');if(!['draft','pending_review'].includes(old.status)||(!isManager(user)&&old.status!=='draft'))fail(409,'This post is locked. A manager must return it to draft.');if(!Number.isInteger(b.version)||b.version!==old.version)fail(409,'Someone changed this post. Refresh and reopen it before saving.');}
 const overrides=Object.fromEntries(Object.entries(b.overrides||{}).filter(([n])=>b.networks.includes(n)));
 const payload={caption:b.caption,title:String(b.title||'').slice(0,100),boardId:String(b.boardId||'').slice(0,100),networks:b.networks,overrides,media:b.media};
 const status={draft:'draft',submit:'pending_review',publish:'queued',schedule:'scheduled'}[mode],authorizer=['publish','schedule'].includes(mode)?user.id:null;
 const changed=await sql`WITH changed AS (INSERT INTO heart_posts(id,payload,status,scheduled_at,created_by,authorized_by) VALUES(${id},${JSON.stringify(payload)}::jsonb,${status},${scheduled},${user.id},${authorizer}) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,status=EXCLUDED.status,scheduled_at=EXCLUDED.scheduled_at,authorized_by=EXCLUDED.authorized_by,revision=heart_posts.revision+1,updated_at=NOW() WHERE heart_posts.revision=${old?b.version:0} AND (heart_posts.status='draft' OR (${isManager(user)} AND heart_posts.status='pending_review')) AND (${isManager(user)} OR heart_posts.created_by=${user.id}) RETURNING *),logged AS (INSERT INTO heart_audit(actor_id,action,target_id) SELECT ${user.id},${`post.${mode}`},id::text FROM changed) SELECT * FROM changed`;
 if(!changed.length)fail(409,'Post changed or was already submitted. Refresh and reopen it.');
 if(mode==='publish')await dispatch(id);
 return json(decode((await sql`SELECT * FROM heart_posts WHERE id=${id}`)[0]));
 }),
 postsDelete:wrap(async(req,sql,user)=>{const id=uuid(new URL(req.url).searchParams.get('id')),p=await getPost(sql,id,user);if(!canEditPost(user,p))fail(403,'You cannot delete this draft.');const rows=await sql`WITH removed AS (DELETE FROM heart_posts WHERE id=${id} AND status='draft' AND revision=${p.version} RETURNING id),logged AS (INSERT INTO heart_audit(actor_id,action,target_id) SELECT ${user.id},'post.delete',id::text FROM removed) SELECT * FROM removed`;if(!rows.length)fail(409,'Only an unchanged draft can be deleted.');return json({ok:true});}),
 postsAction:wrap(async(req,sql,user)=>{
 const b=await body(req),p=await getPost(sql,uuid(b.id),user);
 if(b.action==='refresh'){await refreshPost(p.id);return json({ok:true});}
 manager(user);
 if(b.action==='retry'){
 if(!Number.isInteger(b.version)||b.version!==p.version||!canRetryDelivery(p,b.network))fail(409,'This delivery changed or cannot be retried. Refresh the post.');
 const available=await connections();
 if(!available[b.network]?.connected)fail(400,'Reconnect this platform before retrying.');
 if(!await retryDelivery(p.id,b.network,b.version,user.id))fail(409,'This delivery changed or was already retried. Refresh the post.');
 return json({ok:true});
 }
 if(!['cancel','return'].includes(b.action))fail(400,'Invalid action.');const from=b.action==='cancel'?'scheduled':'pending_review';
 const rows=await sql`WITH changed AS (UPDATE heart_posts SET status='draft',scheduled_at=NULL,authorized_by=NULL,revision=revision+1,updated_at=NOW() WHERE id=${p.id} AND status=${from} AND revision=${p.version} RETURNING id),logged AS (INSERT INTO heart_audit(actor_id,action,target_id) SELECT ${user.id},${`post.${b.action}`},id::text FROM changed) SELECT * FROM changed`;
 if(!rows.length)fail(409,'This post changed or cannot be returned to draft.');return json({ok:true});
 }),
 mediaList:wrap(async(req,sql)=>json((await sql`SELECT * FROM heart_media ORDER BY created_at DESC LIMIT 1000`).map(r=>({...r.payload,id:r.id})))),
 mediaSave:wrap(async(req,sql,user)=>{if(!canCreate(user))fail(403,'Your role cannot upload media.');const b=await body(req);if(!safeMediaURL(b.url,process.env.BLOB_HOSTNAME)||!['image/jpeg','image/png','image/webp','video/mp4'].includes(b.type)||!Number.isFinite(b.size)||b.size<0||b.size>50*1024*1024)fail(400,'Invalid media.');const id=randomUUID(),m={id,url:b.url,name:String(b.name).slice(0,200),type:b.type,size:b.size,alt:String(b.alt||'').slice(0,1000)};await sql.transaction([sql`INSERT INTO heart_media(id,payload,created_by) VALUES(${id},${JSON.stringify(m)}::jsonb,${user.id})`,audit(sql,user,'media.add',id)]);return json(m,201);}),
 upload:wrap(async(req,sql)=>{const b=await body(req);return json(await handleUpload({request:req,body:b,onBeforeGenerateToken:async()=>{if(!sameOrigin(req))fail(403,'Invalid request origin.');const u=await currentUser(sql,req);if(!canCreate(u))fail(403,'Upload permission is required.');return {allowedContentTypes:['image/jpeg','image/png','image/webp','video/mp4'],maximumSizeInBytes:50*1024*1024,addRandomSuffix:true,validUntil:Date.now()+5*60*1000};},onUploadCompleted:async()=>{}}));},{publicRoute:true,origin:false}),
 cron:async req=>{try{
 if(!cloudReady()||!process.env.CRON_SECRET||!equal(req.headers.get('authorization'),`Bearer ${process.env.CRON_SECRET}`))fail(401,'Unauthorized');const sql=getSQL();
 await sql`UPDATE heart_posts SET status='needs_review',revision=revision+1,updated_at=NOW() WHERE status='publishing' AND updated_at<NOW()-INTERVAL '10 minutes'`;
 const due=await sql`SELECT id FROM heart_posts WHERE status IN ('scheduled','queued') AND (scheduled_at IS NULL OR scheduled_at<=NOW()) ORDER BY scheduled_at NULLS FIRST LIMIT 1`;if(due.length)await dispatch(due[0].id);
 const accepted=await sql`SELECT id FROM heart_posts WHERE status='processing' ORDER BY updated_at LIMIT 2`;for(const p of accepted)await refreshPost(p.id);
 await sql`DELETE FROM heart_sessions WHERE expires_at<NOW()`;await sql`DELETE FROM heart_invitations WHERE expires_at<NOW()`;
 return json({ok:true,processed:due.length});
 }catch(e){return json({error:e.status?e.message:'Scheduler failed.'},e.status||500);}}
 };
}
