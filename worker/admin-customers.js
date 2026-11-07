// Only account metadata and already-public card information leave this endpoint.
// Draft JSON, account IDs, access tokens and unpublished contact fields are never selected.
const metadata=row=>({
 email:row.email,enabled:!!row.enabled,revision:row.revision,hasSignedIn:!!row.hasSignedIn,
 accessUpdatedAt:row.accessUpdatedAt,hasCard:!!row.hasCard,cardUpdatedAt:row.cardUpdatedAt,
 publication:row.publishedId?'published':row.hasCard?'private':'not_started',
 publishedName:row.publishedId?row.publishedName:null,publishedAt:row.publishedId?row.publishedAt:null,
 publicPath:row.publishedId?'/p/'+encodeURIComponent(row.publishedId):null,plan:'personal_pilot'
});
export async function adminCustomers(request,env,context,userId,json){
 if(!userId)return json({error:'Sign in to view customers.'},401);
 if(context?.role!=='owner')return json({error:'Only the studio owner can view personal customers.'},403);
 if(request.method!=='GET')return json({error:'Method not allowed.'},405);
 const row=await env.DB.prepare("SELECT json_group_array(json_object('email',a.email,'enabled',a.enabled,'revision',a.revision,'hasSignedIn',CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END,'accessUpdatedAt',a.updated_at,'hasCard',CASE WHEN p.owner_id IS NULL THEN 0 ELSE 1 END,'cardUpdatedAt',p.updated_at,'publishedId',CASE WHEN a.enabled=1 AND p.live IS NOT NULL AND v.payload IS NOT NULL THEN p.id ELSE NULL END,'publishedName',CASE WHEN a.enabled=1 AND p.live IS NOT NULL THEN json_extract(v.payload,'$.name') ELSE NULL END,'publishedAt',p.published_at)) AS customers FROM (SELECT * FROM card_personal_access WHERE studio_owner_id=? ORDER BY email LIMIT 100) a LEFT JOIN card_personal_profiles p ON p.owner_id=a.user_id LEFT JOIN card_public_views v ON v.view_key='p/'||p.id AND v.owner_id='personal:'||p.owner_id").bind(context.ownerId).first();
 const customers=JSON.parse(row.customers).map(metadata);
 const own=await env.DB.prepare("SELECT p.updated_at AS cardUpdatedAt,CASE WHEN p.live IS NOT NULL AND v.payload IS NOT NULL THEN p.id ELSE NULL END AS publishedId,CASE WHEN p.live IS NOT NULL THEN json_extract(v.payload,'$.name') ELSE NULL END AS publishedName,p.published_at AS publishedAt FROM card_personal_profiles p LEFT JOIN card_public_views v ON v.view_key='p/'||p.id AND v.owner_id='personal:'||p.owner_id WHERE p.owner_id=?").bind(context.ownerId).first();
 return json({customers,limit:100,counts:{
 total:customers.length,enabled:customers.filter(c=>c.enabled).length,published:customers.filter(c=>c.publication==='published').length,
 awaitingSignIn:customers.filter(c=>c.enabled&&!c.hasSignedIn).length,privateCards:customers.filter(c=>c.publication==='private').length
 },ownCard:{hasCard:!!own,cardUpdatedAt:own?.cardUpdatedAt||null,publication:own?.publishedId?'published':own?'private':'not_started',publishedName:own?.publishedId?own.publishedName:null,publicPath:own?.publishedId?'/p/'+encodeURIComponent(own.publishedId):null}});
}

