import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('v1 migration preserves content, removes legacy scheduling authorization and is rerunnable',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE TABLE heart_posts(id UUID PRIMARY KEY,payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'draft',scheduled_at TIMESTAMPTZ,results JSONB NOT NULL DEFAULT '{}',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE heart_media(id UUID PRIMARY KEY,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());INSERT INTO heart_posts(id,payload,status,scheduled_at) VALUES('00000000-0000-4000-8000-000000000001','{"caption":"Keep my words","networks":["threads"],"media":[]}','scheduled',NOW());`);
 const migration=await readFile(new URL('../migrations/002-team-access.sql',import.meta.url),'utf8');await pg.exec(migration);await pg.exec(migration);
 const {rows}=await pg.query('SELECT * FROM heart_posts');assert.equal(rows.length,1);assert.equal(rows[0].payload.caption,'Keep my words');assert.equal(rows[0].status,'pending_review');assert.equal(rows[0].scheduled_at,null);assert.equal(rows[0].revision,2);
 }finally{await pg.close();}
});
