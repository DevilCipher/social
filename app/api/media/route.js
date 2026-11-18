import {handlers} from '../../../lib/server/index.js';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export const GET=handlers.mediaList;
export const POST=handlers.mediaSave;
