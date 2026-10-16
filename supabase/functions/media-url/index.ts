import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store'}
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return new Response(null,{headers})
 if(request.method!=='POST')return Response.json({error:'Use POST'},{status:405,headers})
 try{
  const {id}=await request.json()
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return Response.json({error:'Media not found'},{status:404,headers})
  const url=Deno.env.get('SUPABASE_URL')!
  const authorization=request.headers.get('Authorization')
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:authorization?{headers:{Authorization:authorization}}:undefined,auth:{persistSession:false}})
  // Public references are allowed by this RPC; private references require the
  // verified request JWT and matching owner or historical booking entitlement.
  const {data:path,error}=await client.schema('travelbuddy_api').rpc('media_path',{media_id:id})
  if(error||!path)return Response.json({error:'Media not found'},{status:404,headers})
  const storage=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
  const {data,error:signError}=await storage.storage.from('buddy-media').createSignedUrl(path,300)
  if(signError||!data)throw new Error('Signing failed')
  const signed=new URL(data.signedUrl);const publicUrl=new URL(Deno.env.get('SUPABASE_PUBLIC_URL')!);signed.protocol=publicUrl.protocol;signed.host=publicUrl.host
  return Response.json({url:signed.toString()},{headers})
 }catch{return Response.json({error:'Media temporarily unavailable'},{status:503,headers})}
})
