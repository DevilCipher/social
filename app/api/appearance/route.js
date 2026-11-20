import { handlers } from '../../../lib/server/index.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handlers.appearance;
export const POST = handlers.saveAppearance;
