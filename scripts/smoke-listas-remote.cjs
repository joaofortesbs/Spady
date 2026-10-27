/* Explicit integration test. Uses temporary accounts only, removes them in finally.
   Never prints credentials, cookies, IDs, URLs, raw API errors or user content. */
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const assert = require('node:assert/strict');

if (!process.argv.includes('--allow-temporary-users')) {
  console.log('Requires --allow-temporary-users; creates and removes isolated test accounts.');
  process.exit(1);
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const users = [];
const checks = [];
let stage = 'create-test-accounts';

function ok(result) {
  if (result.error) throw Object.assign(new Error('Integration operation failed'), { code: result.error.code || 'API_ERROR' });
  return result.data;
}
async function account() {
  const email = `listas-smoke-${randomUUID()}@example.invalid`;
  const password = randomBytes(36).toString('base64url');
  const created = ok(await admin.auth.admin.createUser({email,password,email_confirm:true}));
  users.push(created.user.id);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  ok(await client.auth.signInWithPassword({email,password}));
  const cookies = new Map();
  const ssr = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll:()=>[...cookies].map(([name,value])=>({name,value})),
      setAll: values=>values.forEach(({name,value})=>cookies.set(name,value)) },
  });
  ok(await ssr.auth.signInWithPassword({email,password}));
  return { id:created.user.id, client, cookie: [...cookies].map(([name,value])=>`${name}=${value}`).join('; ') };
}
async function main() {
  let failure = null;
  try {
    const a = await account();
    const b = await account();
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
    const path = `${a.id}/${createHash('sha256').update(bytes).digest('hex')}`;
    const image = {id:randomUUID(),name:'test.png',objectPath:path,mimeType:'image/png',byteSize:bytes.length};
    const item = {id:randomUUID(),title:'Temporary item',description:'Smoke fixture',images:[image]};
    const otherItem = {id:randomUUID(),title:'Second item',description:'',images:[]};
    const list = {id:randomUUID(),name:'Temporary list',description:'Smoke fixture',items:[item,otherItem]};
    const read = async client => ok(await client.rpc('listas_read_v1'));
    const save = async (revision,lists,key=null) => ok(await a.client.rpc('listas_commit_v1',{
      p_owner:a.id,p_revision:revision,p_lists:lists,p_import_key:key,
    }));
    stage='private-upload';
    ok(await a.client.storage.from('listas-images').upload(path,bytes,{contentType:'image/png',cacheControl:'0',upsert:false}));
    const initial = await read(a.client);
    let snapshot = await save(initial.revision,[list]);
    assert.equal(snapshot.lists[0].items[0].images[0].objectPath,path);
    checks.push('real-upload-and-transaction');
    stage='read-after-commit';
    const loaded = await read(a.client);
    assert.deepEqual(loaded,snapshot);
    stage='item-order-and-edit';
    const previous = snapshot.revision;
    snapshot = await save(snapshot.revision,[{...list,items:[otherItem,{...item,title:'Edited title'}]}]);
    assert.deepEqual(snapshot.lists[0].items.map(value=>value.id),[otherItem.id,item.id]);
    assert.equal(snapshot.lists[0].items[1].title,'Edited title');
    stage='stale-revision-rejection';
    const stale = await a.client.rpc('listas_commit_v1',{p_owner:a.id,p_revision:previous,p_lists:[]});
    assert.equal(stale.status,409);
    assert.equal(stale.error?.code,'PT409');
    checks.push('real-read-edit-order-and-conflict');
    stage='owner-isolation';
    assert.equal((await read(b.client)).lists.length,0);
    assert.equal(ok(await b.client.from('listas_lists').select('id').eq('user_id',a.id)).length,0);
    assert.ok((await b.client.storage.from('listas-images').download(path)).error);
    assert.ok((await b.client.rpc('listas_commit_v1',{p_owner:a.id,p_revision:'0',p_lists:[]})).error);
    const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
    assert.ok((await anonymous.storage.from('listas-images').download(path)).error);
    assert.ok((await anonymous.rpc('listas_read_v1')).error);
    checks.push('real-cross-account-and-anonymous-denial');
    stage='referenced-image-protection';
    const protectedRemoval = ok(await a.client.storage.from('listas-images').remove([path]));
    assert.equal(protectedRemoval.length,0);
    assert.equal(ok(await a.client.storage.from('listas-images').list(a.id))
      .some(file=>`${a.id}/${file.name}`===path),true);
    const downloaded = ok(await a.client.storage.from('listas-images').download(path));
    assert.equal(downloaded.size,bytes.length);
    checks.push('real-referenced-image-deletion-denied');
    stage='import-idempotency';
    const importedList = {id:randomUUID(),name:'Imported fixture',description:'',items:[]};
    snapshot = await save('',[importedList],'temporary-import');
    const retry = await save('',[importedList],'temporary-import');
    assert.deepEqual(retry,snapshot);
    assert.equal(snapshot.lists.length,2);
    checks.push('real-import-idempotency');
    stage='authenticated-image-route';
    if (!process.env.REPLIT_DEV_DOMAIN) throw new Error('Development domain missing');
    const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const imageUrl = `${origin}/api/listas/images?path=${encodeURIComponent(path)}`;
    const imageResponse = await fetch(imageUrl,{headers:{Cookie:a.cookie}});
    assert.equal(imageResponse.status,200);
    assert.equal(imageResponse.headers.get('content-type'),'image/png');
    assert.ok(imageResponse.headers.get('cache-control')?.includes('private'));
    assert.equal((await imageResponse.arrayBuffer()).byteLength,bytes.length);
    assert.equal((await fetch(imageUrl,{headers:{Cookie:b.cookie}})).status,404);
    assert.equal((await fetch(imageUrl)).status,401);
    checks.push('real-authenticated-image-route');
    stage='image-removal';
    snapshot = await save(snapshot.revision,[{...list,items:[otherItem]}]);
    const removed = ok(await a.client.storage.from('listas-images').remove([path]));
    assert.equal(removed.length,1);
    const remaining = ok(await a.client.storage.from('listas-images').list(a.id));
    assert.equal(remaining.some(file=>`${a.id}/${file.name}`===path),false);
    checks.push('real-unreferenced-image-removal');
  } catch(error) {
    failure = {stage,category:error.code||'ASSERTION_OR_REQUEST_FAILED',
      ...(error.operator ? {assertion:error.operator} : {})};
  } finally {
    let cleaned = true;
    for(const user of users) {
      try {
        // Service operations scoped exclusively to freshly-created fixture accounts.
        const files = ok(await admin.storage.from('listas-images').list(user,{limit:1000}));
        if(files.length) ok(await admin.storage.from('listas-images').remove(files.map(file=>`${user}/${file.name}`)));
        ok(await admin.auth.admin.deleteUser(user));
      } catch { cleaned=false; }
    }
    console.log(JSON.stringify({ok:!failure&&cleaned,checks,temporaryAccountsRemoved:cleaned,...(failure||{})}));
    if(failure||!cleaned) process.exitCode=1;
  }
}
main();
