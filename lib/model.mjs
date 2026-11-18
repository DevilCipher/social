export const NETWORKS = [
 ['instagram','Instagram','◎','#c6558e',2200],['facebook','Facebook Pages','f','#1877f2',63206],['threads','Threads','@','#242424',500],['twitter','X','𝕏','#242424',280],['linkedin','LinkedIn','in','#0a66c2',3000],['pinterest','Pinterest','P','#bd081c',500],['youtube','YouTube Shorts','▶','#e62117',5000],['bluesky','Bluesky','🦋','#0085ff',300],['mastodon','Mastodon','m','#6364ff',500],['tumblr','Tumblr','t','#35465c',10000],['telegram','Telegram','➤','#229ed9',4096]
].map(([id,name,icon,color,limit])=>({id,name,icon,color,limit}));
export const captionFor=(post,id)=>post.overrides?.[id] ?? post.caption ?? '';
export function validate(post, publishing=false) {
 const errors=[];
 if(typeof post.caption!=='string'||post.caption.length>65000) errors.push('Caption must be text, up to 65,000 characters.');
 if(!Array.isArray(post.networks)||post.networks.some(id=>!NETWORKS.some(n=>n.id===id))||new Set(post.networks).size!==post.networks.length) errors.push('Choose valid, unique platforms.');
 if(!Array.isArray(post.media)||post.media.length>10) errors.push('Use up to 10 media files.');
 if(errors.length) return errors;
 if(post.media.some(m=>typeof m.id!=='string'||typeof m.url!=='string'||!['image/jpeg','image/png','image/webp','video/mp4'].includes(m.type))) errors.push('Unsupported media file.');
 if(post.overrides && (typeof post.overrides!=='object'||Object.values(post.overrides).some(v=>typeof v!=='string'||v.length>65000))) errors.push('Invalid caption override.');
 if(!publishing) return errors;
 if(!post.networks.length) errors.push('Select at least one platform.');
 if(!post.caption.trim()&&!post.media.length) errors.push('Add a caption or media.');
 for(const id of post.networks){
 const n=NETWORKS.find(n=>n.id===id), text=captionFor(post,id);
 if([...new Intl.Segmenter().segment(text)].length>n.limit) errors.push(`${n.name}: caption exceeds ${n.limit} characters.`);
 if(['instagram','pinterest','youtube'].includes(id)&&!post.media.length) errors.push(`${n.name} needs media.`);
 if(id==='youtube' && (post.media.length!==1||post.media[0]?.type!=='video/mp4')) errors.push('YouTube needs one MP4 video.');
 if(id==='youtube'&&(!post.title?.trim()||post.title.length>100)) errors.push('YouTube needs a title of 1–100 characters.');
 if(id==='pinterest'&&!post.boardId?.trim()) errors.push('Choose a Pinterest board ID.');
 if(['bluesky','mastodon'].includes(id)&&post.media.length>4) errors.push(`${n.name}: maximum 4 images in this version.`);
 if(['bluesky','mastodon','tumblr'].includes(id)&&post.media.some(m=>m.type.startsWith('video'))) errors.push(`${n.name}: this version supports text and images; deselect it for video.`);
 if(post.media.some(m=>m.type.startsWith('video'))&&post.media.length>1) errors.push(`${n.name}: upload one video, without other media.`);
 if(id==='telegram'&&post.media.length&&text.length>1024) errors.push('Telegram media captions must be 1,024 characters or fewer.');
 }
 return [...new Set(errors)];
}
export function istToISO(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid date and time.');
 const d=new Date(`${value}:00+05:30`); if(!Number.isFinite(d.getTime())) throw new Error('Invalid time.'); return d.toISOString();
}
export const istDate=(value)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value));
export function safeMediaURL(value, hostname){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===hostname&&!u.username&&!u.password&&!u.port;}catch{return false;}}
export function summarize(results){const v=Object.values(results);return v.length&&v.every(r=>r.status==='published')?'published':v.some(r=>r.status==='uncertain')?'needs_review':v.some(r=>r.status==='accepted')?'processing':v.some(r=>r.status==='published')?'partial':'failed';}
