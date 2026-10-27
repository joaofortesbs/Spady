/* Runs ONLY against a throwaway local PostgreSQL instance; no project secrets used. */
const { localDatabase, assert, fs } = require('./lib/kanban-sql-test-helpers.cjs');
const migration = fs.readFileSync('supabase/migrations/006_listas_remote.sql', 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const objectPath = `${owner}/${'a'.repeat(64)}`;
const img = { id: 'image-1', name: 'cover.webp', objectPath, mimeType: 'image/webp', byteSize: 3 };
const item = (id, images = []) => ({ id, title: `Item ${id}`, description: '', images });
const list = (id, items = []) => ({ id, name: `List ${id}`, description: 'Descrição', items });

(async () => {
  const db = await localDatabase();
  try {
    const admin = await db.connect();
    await admin.query(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,storage TO authenticated,anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
    `);
    await admin.query('INSERT INTO auth.users VALUES($1),($2)', [owner,other]);
    await admin.query(migration);
    await admin.query(fs.readFileSync('supabase/migrations/007_listas_conflict_http.sql', 'utf8'));
    await admin.query(`INSERT INTO storage.objects(bucket_id,name,metadata)
      VALUES('listas-images',$1,'{"size":3,"mimetype":"image/webp"}')`, [objectPath]);
    const client = await db.connect();
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const read = async () => (await client.query('SELECT public.listas_read_v1() AS data')).rows[0].data;
    const save = async (revision, lists, key=null) => (await client.query(
      'SELECT public.listas_commit_v1($1,$2,$3,$4) AS data', [owner,revision,JSON.stringify(lists),key])).rows[0].data;
    let state = await read();
    assert.equal(state.revision,'0');
    state = await save('0',[list('a',[item('one',[img]),item('two')])]);
    assert.equal(state.lists[0].items[0].images[0].objectPath,objectPath);
    const firstRevision = state.revision;
    state = await save(state.revision,[list('a',[item('two'),item('one',[img])])]);
    assert.deepEqual(state.lists[0].items.map(i=>i.id),['two','one']);
    await assert.rejects(()=>save(firstRevision,[]),e=>e.code==='PT409');
    const before = await read();
    await assert.rejects(()=>save(state.revision,[list('bad',[item('bad-item',Array.from({length:6},(_,n)=>({...img,id:`im-${n}`})))])]),
      e=>e.code==='22023');
    assert.deepEqual(await read(),before,'Failed writes must roll back all metadata');
    await assert.rejects(()=>save(state.revision,[list('bad',[item('bad-item',[{...img,objectPath:`${other}/${'b'.repeat(64)}`}])])]),
      e=>e.code==='22023');
    await assert.rejects(()=>client.query('UPDATE public.listas_items SET title=$1',['bypass']),e=>e.code==='42501');
    assert.equal((await client.query('SELECT public.listas_object_deletable_v1($1) AS allowed',[objectPath])).rows[0].allowed,false);
    const deletion = await client.query('DELETE FROM storage.objects WHERE name=$1',[objectPath]);
    assert.equal(deletion.rowCount,0,'Referenced files cannot be deleted');
    state = await save('',[list('imported',[item('imported-item')])],'local-test');
    const imported = state;
    assert.deepEqual(await save('',[list('imported')],'local-test'),imported,'Import retries must be idempotent');
    await assert.rejects(()=>save('',[list('imported')],'other-copy'),e=>e.code==='PT409');
    const second = await db.connect();
    await second.query('SET ROLE authenticated');
    await second.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[other]);
    assert.equal((await second.query('SELECT * FROM public.listas_lists')).rowCount,0);
    assert.equal((await second.query('SELECT public.listas_read_v1() AS data')).rows[0].data.lists.length,0);
    await assert.rejects(()=>second.query('SELECT public.listas_commit_v1($1,$2,$3)',[owner,'0','[]']),e=>e.code==='42501');
    // Concurrent writes with the same expected revision: exactly one wins.
    const concurrent = await db.connect();
    await concurrent.query('SET ROLE authenticated');
    await concurrent.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);
    const outcomes = await Promise.allSettled([
      save(state.revision,state.lists),
      concurrent.query('SELECT public.listas_commit_v1($1,$2,$3)',[owner,state.revision,JSON.stringify(state.lists)]),
    ]);
    assert.equal(outcomes.filter(outcome=>outcome.status==='fulfilled').length,1);
    state = await read();
    state = await save(state.revision,[list('empty')]);
    assert.equal((await client.query('SELECT public.listas_object_deletable_v1($1) AS allowed',[objectPath])).rows[0].allowed,true);
    assert.equal((await client.query('DELETE FROM storage.objects WHERE name=$1',[objectPath])).rowCount,1);
    const anonymous = await db.connect();
    await anonymous.query('SET ROLE anon');
    await assert.rejects(()=>anonymous.query('SELECT public.listas_read_v1()'),e=>e.code==='42501');
    console.log(JSON.stringify({ok:true,localOnly:true,checks:[
      'migration','owner-isolation','atomic-rollback','revision-conflict','concurrent-save',
      'item-order','private-images','five-image-limit','import-idempotency','cross-account-import-conflict',
      'direct-write-denied','referenced-file-delete-denied','account-switch-denied','anonymous-denied',
    ]}));
  } finally { await db.close(); }
})().catch(error=>{ console.error(error); process.exitCode=1; });
