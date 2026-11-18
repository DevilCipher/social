import {db,cloudReady} from '../db.js';
import {connections} from '../providers.js';
import {dispatch,refreshPost} from '../dispatch.js';
import {createHandlers} from './handlers.mjs';
export const handlers=createHandlers({getSQL:db,cloudReady,connections,dispatch,refreshPost});
