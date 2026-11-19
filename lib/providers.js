import { captionFor, NETWORKS, safeMediaURL } from './model.mjs';
const ayrHeaders=()=>({'Authorization':`Bearer ${process.env.AYRSHARE_API_KEY}`,'Content-Type':'application/json'});
export async function remote(url,options={}){
 let res;try{res=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(25000),cache:'no-store'});}catch{throw Object.assign(new Error('Request interrupted. Check the destination before retrying.'),{uncertain:true});}
 let data;try{data=await res.json();}catch{throw Object.assign(new Error('Provider returned an unreadable response. Check the destination.'),{uncertain:true});}
 if(!res.ok){
 const retryable=[400,401,403,404,413,415,422,429].includes(res.status);
 throw Object.assign(new Error(`Provider rejected the request (HTTP ${res.status}). Check permissions and media requirements.`),{uncertain:!retryable,retryable});
 }
 return data;
}
function mastodonURL(){const u=new URL(process.env.MASTODON_URL||'https://mastodon.social');if(u.protocol!=='https:'||u.username||u.password||u.port)throw new Error('Invalid Mastodon server URL.');return u.origin;}
export async function connections(){
 const states=Object.fromEntries(NETWORKS.map(n=>[n.id,{connected:false,detail:'Not connected'}]));
 await Promise.all([
 (async()=>{if(!process.env.AYRSHARE_API_KEY)return;try{const d=await remote('https://api.ayrshare.com/api/user',{headers:ayrHeaders()});for(const id of d.activeSocialAccounts||[]){if(states[id])states[id]={connected:true,detail:'Linked through Ayrshare'};}}catch{for(const n of NETWORKS.filter(n=>!['mastodon','tumblr'].includes(n.id)))states[n.id].detail='Could not verify Ayrshare connection';}})(),
 (async()=>{if(!process.env.MASTODON_ACCESS_TOKEN)return;try{const d=await remote(`${mastodonURL()}/api/v1/accounts/verify_credentials`,{headers:{Authorization:`Bearer ${process.env.MASTODON_ACCESS_TOKEN}`}});states.mastodon={connected:!!d.id,detail:d.acct||'Verified'};}catch{states.mastodon.detail='Reconnect Mastodon';}})(),
 (async()=>{if(!process.env.TUMBLR_ACCESS_TOKEN||!process.env.TUMBLR_BLOG)return;try{const d=await remote('https://api.tumblr.com/v2/user/info',{headers:{Authorization:`Bearer ${process.env.TUMBLR_ACCESS_TOKEN}`}});const blogs=d.response?.user?.blogs||[];states.tumblr={connected:blogs.some(b=>b.name===process.env.TUMBLR_BLOG),detail:'Tumblr credentials checked'};}catch{states.tumblr.detail='Reconnect Tumblr';}})()
 ]);return states;
}
export async function publishOne(post,id){
 const text=captionFor(post,id);
 if(id==='mastodon'){
 const base=mastodonURL(),headers={Authorization:`Bearer ${process.env.MASTODON_ACCESS_TOKEN}`}, mediaIds=[];
 for(const m of post.media){
 if(!safeMediaURL(m.url,process.env.BLOB_HOSTNAME))throw new Error('Untrusted media location.');
 const res=await fetch(m.url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error('Media download failed.');
 const file=await res.blob();if(file.size>10*1024*1024)throw new Error('Mastodon images must be under 10 MB in this version.');
 const form=new FormData();form.append('file',file,m.name);form.append('description',m.alt||'');
 const media=await remote(`${base}/api/v1/media`,{method:'POST',headers,body:form});if(!media.id||!media.url)throw new Error('Media is not ready. Try again later.');mediaIds.push(media.id);
 }
 const d=await remote(`${base}/api/v1/statuses`,{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':`${post.id}-mastodon`},body:JSON.stringify({status:text,media_ids:mediaIds,visibility:'public'})});
 if(!d.id)throw Object.assign(new Error('No post ID returned. Check Mastodon.'),{uncertain:true});return {status:'published',id:d.id,url:d.url};
 }
 if(id==='tumblr'){
 const content=[];if(text)content.push({type:'text',text});for(const m of post.media)content.push({type:'image',media:[{type:m.type,url:m.url}],alt_text:m.alt||''});
 const d=await remote(`https://api.tumblr.com/v2/blog/${encodeURIComponent(process.env.TUMBLR_BLOG)}/posts`,{method:'POST',headers:{Authorization:`Bearer ${process.env.TUMBLR_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({content,state:'published'})});
 const pid=d.response?.id;if(!pid)throw Object.assign(new Error('No post ID returned. Check Tumblr.'),{uncertain:true});return {status:'published',id:String(pid),url:`https://${process.env.TUMBLR_BLOG}.tumblr.com/post/${pid}`};
 }
 const payload={post:text,platforms:[id],...(post.media.length?{mediaUrls:post.media.map(m=>m.url)}:{})};
 if(id==='pinterest')payload.pinterestOptions={boardId:post.boardId,title:post.title||undefined};
 if(id==='youtube')payload.youTubeOptions={title:post.title,visibility:'public'};
 const d=await remote('https://api.ayrshare.com/api/post',{method:'POST',headers:ayrHeaders(),body:JSON.stringify(payload)});
 const native=d.postIds?.find(p=>p.platform===id);
 if(native?.postUrl)return {status:'published',id:d.id,url:native.postUrl,provider:'ayrshare'};
 if(d.id&&!d.errors?.length)return {status:'accepted',id:d.id,provider:'ayrshare',detail:'Accepted by provider; publication is being verified.'};
 throw Object.assign(new Error('Publishing was not confirmed. Review the Ayrshare dashboard before retrying.'),{uncertain:true});
}
export async function checkResult(result,id){
 if(result.provider!=='ayrshare'||!result.id)return result;
 const d=await remote(`https://api.ayrshare.com/api/post/${encodeURIComponent(result.id)}`,{headers:ayrHeaders()});
 const native=d.postIds?.find(p=>p.platform===id);
 if(native?.postUrl)return {...result,status:'published',url:native.postUrl,detail:undefined};
 if(d.status==='error'||d.errors?.length)return {...result,status:'needs_review',detail:'Provider reports an error. Review its dashboard.'};
 return result;
}
