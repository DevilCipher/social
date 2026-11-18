import {neon} from '@neondatabase/serverless';
export function db(){if(!process.env.DATABASE_URL)throw new Error('Database is not configured.');return neon(process.env.DATABASE_URL);}
export const cloudReady=()=>Boolean(process.env.DATABASE_URL&&process.env.SESSION_SECRET?.length>=32&&process.env.APP_URL);
export const decode=r=>({...r.payload,id:r.id,status:r.status,scheduledAt:r.scheduled_at,results:r.results,updatedAt:r.updated_at,createdBy:r.created_by,authorizedBy:r.authorized_by,version:r.revision});
