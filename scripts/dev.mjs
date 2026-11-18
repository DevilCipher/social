import {spawn} from 'node:child_process';
const args=process.argv.slice(2);const i=args.indexOf('--port');const port=i>=0?args[i+1]:'3000';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next',args.includes('--strictPort')?'start':'dev','--hostname','0.0.0.0','--port',port],{stdio:'inherit'});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));child.on('exit',code=>process.exit(code||0));
