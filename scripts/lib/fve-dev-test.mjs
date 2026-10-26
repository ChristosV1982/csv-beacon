import fs from "node:fs/promises";
import assert from "node:assert/strict";
export const project="bdidrcyufazskpuwmfca";
export const company="381b3b4f-0fbd-4f30-bafe-450baa410a04";
export const base=`https://${project}.supabase.co`;
const headers={Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"};
export async function verify(){
 assert.equal((await fs.readFile("supabase/.temp/project-ref","utf8")).trim(),project);
 const r=await fetch(`https://api.supabase.com/v1/projects/${project}`,{headers});
 if(!r.ok)throw Error(`Development project verification HTTP ${r.status}`);
 assert.equal((await r.json()).id,project);
}
export async function sql(query){
 const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,
  {method:"POST",headers,body:JSON.stringify({query})});
 if(!r.ok)throw Error(`Development SQL HTTP ${r.status}: ${await r.text()}`);
 return r.json();
}
export const quote=v=>v==null?"null":"'"+String(v).replaceAll("'","''")+"'";
export function claims(id){return `select set_config('request.jwt.claim.sub',${quote(id)},true);
 select set_config('request.jwt.claims',jsonb_build_object('sub',${quote(id)},'role','authenticated')::text,true); set local role authenticated;`;}
