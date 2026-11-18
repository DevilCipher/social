import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createHandlers} from '../lib/server/handlers.mjs';
import {hashPassword,verifyPassword,createSession,hashToken,token} from '../lib/auth.js';
import {canManageMember,canViewPost,hasNetworks} from '../lib/permissions.mjs';
let pg,sql,handlers,users={},cookies={},publishCalls=0;
const origin='https://heart.example';
// Real PostgreSQL engine for permission and state-transition tests; no social API calls.
function adapter(client){
 function tag(parts,...values){const text=parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,'');return {text,values,then(resolve,reject){return client.query(text,values).then(r=>r.rows).then(resolve,reject);}};}
 tag.transaction=queries=>client.transaction(async tx=>{const results=[];for(const q of queries)results.push((await tx.query(q.text,q.values)).rows);return results;});return tag;
}
function req(path,{method='GET',role,cookie,data,originHeader=origin}={}){return new Request(origin+'/api/'+path,{method,headers:{...(originHeader?{Origin:originHeader}:{}),...(cookie||cookies[role]?{Cookie:cookie||cookies[role]}:{}),'Content-Type':'application/json'},...(data!==undefined?{body:JSON.stringify(data)}:{})});}
async function call(name,path,opts){const r=await handlers[name](req(path,opts));return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};}
const draft=(id=randomUUID())=>({id,caption:'A shared thought',networks:['threads'],media:[],overrides:{},mode:'draft'});
before(async()=>{
 process.env.APP_URL=origin;process.env.SESSION_SECRET='test-only-session-pepper-with-more-than-32-characters';process.env.BLOB_HOSTNAME='store.public.blob.vercel-storage.com';process.env.SCHEDULER_ENABLED='true';process.env.CRON_SECRET='test-only-cron-secret';
 pg=new PGlite();await pg.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));sql=adapter(pg);
 const ph=await hashPassword('a-test-only-password-123');
 for(const role of ['owner','admin','editor','viewer']){const id=randomUUID();await sql`INSERT INTO heart_users(id,email,name,password_hash,role,networks) VALUES(${id},${role+'@example.com'},${role},${ph},${role},' ["threads"] '::jsonb)`;users[role]={id,role,active:true,networks:['threads']};cookies[role]='heart_session='+await createSession(sql,id);}
 handlers=createHandlers({getSQL:()=>sql,cloudReady:()=>true,connections:async()=>Object.fromEntries(['threads','instagram'].map(n=>[n,{connected:true}])),dispatch:async()=>{publishCalls++;},refreshPost:async()=>{}});
});
after(async()=>{await pg.close();});
test('passwords are salted, verified, and never stored in plaintext',async()=>{const p='this-is-a-long-password';const a=await hashPassword(p),b=await hashPassword(p);assert.notEqual(a,b);assert.ok(!a.includes(p));assert.equal(await verifyPassword(p,a),true);assert.equal(await verifyPassword('incorrect-password',a),false);});
test('unauthenticated users cannot list posts, media, users, or accounts',async()=>{for(const [fn,path] of [['postsList','posts'],['mediaList','media'],['teamList','team'],['accounts','accounts']])assert.equal((await call(fn,path)).status,401);});
test('cross-origin mutations are denied even with a valid Owner cookie',async()=>{assert.equal((await call('postsSave','posts',{role:'owner',method:'POST',data:draft(),originHeader:'https://evil.example'})).status,403);});
test('Viewer cannot create drafts, upload, publish, or manage the team',async()=>{for(const mode of ['draft','submit','publish','schedule'])assert.equal((await call('postsSave','posts',{role:'viewer',method:'POST',data:{...draft(),mode}})).status,403);assert.equal((await call('mediaSave','media',{role:'viewer',method:'POST',data:{}})).status,403);assert.equal((await call('teamList','team',{role:'viewer'})).status,403);});
test('Editor can save and submit own drafts but cannot publish or schedule',async()=>{
 const p=draft(),saved=await call('postsSave','posts',{role:'editor',method:'POST',data:p});assert.equal(saved.status,200);assert.equal(saved.body.createdBy,users.editor.id);
 for(const mode of ['publish','schedule'])assert.equal((await call('postsSave','posts',{role:'editor',method:'POST',data:{...saved.body,mode}})).status,403);
 const submitted=await call('postsSave','posts',{role:'editor',method:'POST',data:{...saved.body,mode:'submit'}});assert.equal(submitted.body.status,'pending_review');
 assert.equal((await call('postsSave','posts',{role:'editor',method:'POST',data:{...submitted.body,mode:'draft'}})).status,409);
 const approved=await call('postsSave','posts',{role:'admin',method:'POST',data:{...submitted.body,mode:'publish'}});assert.equal(approved.status,200);assert.equal(approved.body.authorizedBy,users.admin.id);assert.equal(publishCalls,1);
});
test('Editor cannot edit another member’s drafts or access unassigned accounts',async()=>{
 const own=await call('postsSave','posts',{role:'owner',method:'POST',data:draft()});assert.equal((await call('postsSave','posts',{role:'editor',method:'POST',data:{...own.body,mode:'draft'}})).status,403);
 const restricted=await call('postsSave','posts',{role:'owner',method:'POST',data:{...draft(),networks:['instagram']}});assert.equal(restricted.status,200);
 assert.equal((await call('postsSave','posts',{role:'editor',method:'POST',data:{...draft(),networks:['instagram']}})).status,403);
 const listed=await call('postsList','posts',{role:'viewer'});assert.ok(!listed.body.some(p=>p.id===restricted.body.id));assert.equal((await call('postsAction','posts/action',{role:'editor',method:'POST',data:{id:restricted.body.id,action:'refresh'}})).status,403);
 const accounts=await call('accounts','accounts',{role:'editor'});assert.deepEqual(Object.keys(accounts.body),['threads']);
});
test('optimistic revision prevents one editor overwriting another save',async()=>{const p=(await call('postsSave','posts',{role:'editor',method:'POST',data:draft()})).body;assert.equal((await call('postsSave','posts',{role:'editor',method:'POST',data:{...p,mode:'draft',caption:'Updated'}})).status,200);assert.equal((await call('postsSave','posts',{role:'editor',method:'POST',data:{...p,mode:'draft',caption:'Stale'}})).status,409);});
test('Admin cannot create or modify Owners/Admins or promote themselves',async()=>{
 assert.equal((await call('teamCreate','team',{role:'admin',method:'POST',data:{email:'admin2@example.com',name:'Admin2',role:'admin',networks:[]}})).status,403);
 for(const role of ['owner','admin'])assert.equal((await call('teamUpdate','team',{role:'admin',method:'PATCH',data:{id:users[role].id,action:'update',role:'viewer',active:true,networks:[]}})).status,403);
 assert.equal(canManageMember(users.owner,users.owner,'admin'),false);
});
test('invitation is single-use, member chooses password, API never returns password hash',async()=>{
 const invited=await call('teamCreate','team',{role:'admin',method:'POST',data:{email:'member@example.com',name:'Member',role:'editor',networks:['threads']}});assert.equal(invited.status,201);const t=invited.body.inviteUrl.split('#invite=')[1];
 const accepted=await call('acceptInvite','invitations/accept',{method:'POST',data:{token:t,password:'new-member-password'}});assert.equal(accepted.status,200);assert.equal(accepted.body.user.role,'editor');assert.ok(!('password_hash' in accepted.body.user));assert.ok(accepted.cookie.includes('HttpOnly'));assert.ok(accepted.cookie.includes('SameSite=Strict'));
 assert.equal((await call('acceptInvite','invitations/accept',{method:'POST',data:{token:t,password:'another-password'}})).status,400);
 const team=await call('teamList','team',{role:'owner'});assert.ok(team.body.every(u=>!('password_hash' in u)));
});
test('expired invitation cannot activate an account',async()=>{const t=token();await sql`INSERT INTO heart_invitations(token_hash,user_id,created_by,expires_at) VALUES(${hashToken(t)},${users.viewer.id},${users.owner.id},NOW()-INTERVAL '1 day')`;assert.equal((await call('acceptInvite','invitations/accept',{method:'POST',data:{token:t,password:'expired-token-password'}})).status,400);});
test('role and account-scope updates revoke existing sessions immediately',async()=>{
 const result=await call('teamUpdate','team',{role:'owner',method:'PATCH',data:{action:'update',id:users.editor.id,role:'viewer',active:true,networks:['threads']}});assert.equal(result.status,200);assert.equal((await call('postsList','posts',{role:'editor'})).status,401);
 const t=await createSession(sql,users.editor.id);assert.equal((await call('postsSave','posts',{cookie:'heart_session='+t,method:'POST',data:draft()})).status,403);
});
test('disabling a member blocks their existing login session',async()=>{const result=await call('teamUpdate','team',{role:'admin',method:'PATCH',data:{action:'update',id:users.viewer.id,role:'viewer',active:false,networks:['threads']}});assert.equal(result.status,200);assert.equal((await call('postsList','posts',{role:'viewer'})).status,401);});
test('audit log records responsible user and mutations without invite secrets',async()=>{const r=await call('audit','audit',{role:'owner'});assert.equal(r.status,200);assert.ok(r.body.some(e=>e.action==='post.publish'&&e.actor_name==='admin'));assert.ok(r.body.some(e=>e.action==='team.access.update'));assert.ok(!JSON.stringify(r.body).includes('#invite='));});
test('login and logout use individual database sessions',async()=>{const logged=await call('login','login',{method:'POST',data:{email:'owner@example.com',password:'a-test-only-password-123'}});assert.equal(logged.status,200);const cookie=logged.cookie.split(';')[0];assert.equal((await call('postsList','posts',{cookie})).status,200);assert.equal((await call('logout','logout',{cookie,method:'POST',data:{}})).status,200);assert.equal((await call('postsList','posts',{cookie})).status,401);});
test('expired sessions are rejected',async()=>{const t=await createSession(sql,users.owner.id);const {sessionHash}=await import('../lib/auth.js');await sql`UPDATE heart_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=${sessionHash(t)}`;assert.equal((await call('postsList','posts',{cookie:'heart_session='+t})).status,401);});
test('Viewer cannot get a Blob upload token through the raw upload endpoint',async()=>{const r=await call('upload','upload',{role:'viewer',method:'POST',data:{type:'blob.generate-client-token',payload:{pathname:'private.jpg',clientPayload:null,multipart:false}}});assert.ok(r.status>=400);});
test('cron requires its separate secret even for an Owner',async()=>{assert.equal((await handlers.cron(req('cron',{role:'owner'}))).status,401);});
test('dispatch stops scheduled posts after approving Admin is disabled',async()=>{const {createDispatcher}=await import('../lib/dispatch.js');let sends=0;const d=createDispatcher({getSQL:()=>sql,publish:async()=>{sends++;return {status:'published'};}});const id=randomUUID();await sql`INSERT INTO heart_posts(id,payload,status,authorized_by,created_by) VALUES(${id},${JSON.stringify(draft(id))}::jsonb,'scheduled',${users.admin.id},${users.admin.id})`;await sql`UPDATE heart_users SET active=false WHERE id=${users.admin.id}`;await d.dispatch(id);assert.equal(sends,0);const rows=await sql`SELECT status FROM heart_posts WHERE id=${id}`;assert.equal(rows[0].status,'pending_review');await sql`UPDATE heart_users SET active=true WHERE id=${users.admin.id}`;});
test('dispatch claims once and records the authorizing member',async()=>{const {createDispatcher}=await import('../lib/dispatch.js');let sends=0;const d=createDispatcher({getSQL:()=>sql,publish:async()=>{sends++;return {status:'published',url:'https://example.com/post/1'};}});const id=randomUUID();await sql`INSERT INTO heart_posts(id,payload,status,authorized_by,created_by) VALUES(${id},${JSON.stringify(draft(id))}::jsonb,'queued',${users.owner.id},${users.owner.id})`;await d.dispatch(id);await d.dispatch(id);assert.equal(sends,1);const rows=await sql`SELECT status FROM heart_posts WHERE id=${id}`;assert.equal(rows[0].status,'published');});
