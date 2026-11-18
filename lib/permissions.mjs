import {NETWORKS} from './model.mjs';
export const ROLES=['owner','admin','editor','viewer'];
export const networkIDs=NETWORKS.map(n=>n.id);
export const isManager=user=>!!user?.active&&['owner','admin'].includes(user.role);
export const canCreate=user=>!!user?.active&&['owner','admin','editor'].includes(user.role);
export const hasNetworks=(user,networks)=>!!user?.active&&Array.isArray(networks)&&networks.every(n=>networkIDs.includes(n)&&(isManager(user)||(user.networks||[]).includes(n)));
export const canViewPost=(user,post)=>!!user?.active&&(isManager(user)||(post.networks.length>0&&hasNetworks(user,post.networks))||(post.networks.length===0&&post.createdBy===user.id));
export const canEditPost=(user,post)=>canCreate(user)&&canViewPost(user,post)&&(isManager(user)||post.createdBy===user.id);
export function canManageMember(actor,target,nextRole){
 if(!isManager(actor)||target?.role==='owner'||target?.id===actor.id)return false;
 if(nextRole&&!['admin','editor','viewer'].includes(nextRole))return false;
 return actor.role==='owner'||((!target||['editor','viewer'].includes(target.role))&&(!nextRole||['editor','viewer'].includes(nextRole)));
}
export const publicUser=u=>u?({id:u.id,email:u.email,name:u.name,role:u.role,active:u.active,networks:isManager(u)?networkIDs:u.networks||[],accepted:!!u.password_hash}):null;
