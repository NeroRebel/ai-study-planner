import type {SupabaseClient} from '@supabase/supabase-js';
export async function validateAvatar(file:File):Promise<'png'|'jpg'|'webp'> {
  if(file.size<=0 || file.size>2*1024*1024)throw new Error('Choose an image up to 2 MB.');
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
  let extension:'png'|'jpg'|'webp'|null=null;
  if(file.type==='image/png'&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))extension='png';
  if(file.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)extension='jpg';
  const text=new TextDecoder().decode(bytes);
  if(file.type==='image/webp'&&text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')extension='webp';
  if(!extension)throw new Error('Choose a valid PNG, JPEG or WebP image. SVG files are not supported.');
  if(typeof createImageBitmap==='function'){
    let image:ImageBitmap;
    try{image=await createImageBitmap(file);}catch{throw new Error('This image could not be decoded.');}
    const valid=image.width>0&&image.height>0&&image.width<=4096&&image.height<=4096;
    image.close();if(!valid)throw new Error('Choose an image no larger than 4096 × 4096 pixels.');
  }
  return extension;
}
export async function replaceAvatar(client:SupabaseClient,userId:string,file:File,oldPath:string|null,
  save:(path:string|null)=>Promise<void>) {
  const extension=await validateAvatar(file);
  const path=userId+'/'+crypto.randomUUID()+'.'+extension;
  const {error}=await client.storage.from('avatars').upload(path,file,{upsert:false,contentType:file.type,cacheControl:'300'});
  if(error)throw new Error('Avatar upload failed. Please try again.');
  try{await save(path);}catch(error){await client.storage.from('avatars').remove([path]);throw error;}
  if(oldPath)await client.storage.from('avatars').remove([oldPath]);
}
export async function removeAvatar(client:SupabaseClient,path:string|null,save:(path:null)=>Promise<void>) {
  await save(null); // Do not leave the profile pointing at a deleted object.
  if(path){const {error}=await client.storage.from('avatars').remove([path]);if(error)throw new Error('Avatar removed from profile; storage cleanup can be retried.');}
}
