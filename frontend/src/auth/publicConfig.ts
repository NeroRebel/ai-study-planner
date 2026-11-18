export function isPublishableKey(key:string):boolean {
  if(key.startsWith('sb_publishable_'))return true;
  try {
    const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return payload.role==='anon'; // Legacy public anon key; never a service-role JWT.
  } catch {return false;}
}


export function isProjectUrl(value:string):boolean {
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&['','/'].includes(url.pathname);}
  catch{return false;}
}
