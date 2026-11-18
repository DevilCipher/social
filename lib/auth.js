import {scrypt as rawScrypt,randomBytes,timingSafeEqual,createHash,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt);
export const hashToken=token=>createHash('sha256').update(String(token)).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const equal=(a,b)=>timingSafeEqual(Buffer.from(hashToken(a),'hex'),Buffer.from(hashToken(b),'hex'));
export function validPassword(p){return typeof p==='string'&&p.length>=12&&p.length<=128;}
export async function hashPassword(p){if(!validPassword(p))throw new Error('Use a password of 12–128 characters.');const salt=randomBytes(16).toString('hex');const key=await scrypt(p,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024});return `scrypt$${salt}$${key.toString('hex')}`;}
export async function verifyPassword(p,encoded){if(!validPassword(p)||typeof encoded!=='string')return false;const [kind,salt,key]=encoded.split('$');if(kind!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(key))return false;const actual=await scrypt(p,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024});return timingSafeEqual(actual,Buffer.from(key,'hex'));}
export function sessionToken(req){return (req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('heart_session='))?.slice(14)||'';}
export function sessionHash(t){return createHmac('sha256',process.env.SESSION_SECRET||'').update(t).digest('hex');}
export async function currentUser(sql,req){const t=sessionToken(req);if(!/^[A-Za-z0-9_-]{43}$/.test(t))return null;const rows=await sql`SELECT u.* FROM heart_sessions s JOIN heart_users u ON u.id=s.user_id WHERE s.token_hash=${sessionHash(t)} AND s.expires_at>NOW() AND u.active=true`;return rows[0]||null;}
export async function createSession(sql,userId){const t=token();await sql`INSERT INTO heart_sessions(token_hash,user_id,expires_at) SELECT ${sessionHash(t)},id,NOW()+INTERVAL '7 days' FROM heart_users WHERE id=${userId} AND active=true`;return t;}
export const sessionCookie=(t='',clear=false)=>`heart_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:604800}${process.env.NODE_ENV==='production'?'; Secure':''}`;
export function sameOrigin(req){try{return req.headers.get('origin')===new URL(process.env.APP_URL).origin;}catch{return false;}}
