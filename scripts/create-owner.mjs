import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db.js';
import {hashPassword} from '../lib/auth.js';
const sql=db();
if((await sql`SELECT id FROM heart_users WHERE role='owner'`).length)throw new Error('An owner already exists. This script never replaces that owner.');
const rl=createInterface({input:stdin,output:stdout});
const email=(await rl.question('Owner email: ')).trim().toLowerCase();
const name=(await rl.question('Owner display name: ')).trim();
rl.close();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>100)throw new Error('Provide a valid email and name.');
// Passwords are entered with terminal echo disabled, never as shell arguments or env values.
async function hidden(prompt){
 if(!stdin.isTTY)throw new Error('Run interactively in a terminal.');
 stdout.write(prompt);stdin.setRawMode(true);stdin.resume();let value='';
 return new Promise((resolve,reject)=>{const onData=chunk=>{for(const c of chunk.toString()){
 if(c==='\u0003'){cleanup();reject(new Error('Cancelled'));return;}
 if(c==='\r'||c==='\n'){cleanup();resolve(value);return;}
 if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c;
 }};function cleanup(){stdin.off('data',onData);stdin.setRawMode(false);stdin.pause();stdout.write('\n');}stdin.on('data',onData);});
}
const password=await hidden('Owner password (12–128 characters, hidden): ');
if(password!==await hidden('Confirm password: '))throw new Error('Passwords do not match.');
const hash=await hashPassword(password),id=randomUUID();
await sql.transaction([
 sql`INSERT INTO heart_users(id,email,name,password_hash,role) VALUES(${id},${email},${name},${hash},'owner')`,
 sql`UPDATE heart_posts SET created_by=${id} WHERE created_by IS NULL`,
 sql`UPDATE heart_media SET created_by=${id} WHERE created_by IS NULL`,
 sql`INSERT INTO heart_audit(actor_id,action,target_id) VALUES(${id},'owner.bootstrap',${id})`
]);
console.log('Owner created. Sign in with your email and password.');
