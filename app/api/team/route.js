import {handlers} from '../../../lib/server/index.js';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export const GET=handlers.teamList;
export const POST=handlers.teamCreate;
export const PATCH=handlers.teamUpdate;
