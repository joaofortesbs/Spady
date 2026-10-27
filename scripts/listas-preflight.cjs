const { connect } = require('./lib/supabase-admin.cjs');

(async () => {
  let client;
  try {
    client = await connect();
    await client.query('BEGIN READ ONLY');
    const tables = (await client.query(`SELECT table_schema,table_name FROM information_schema.tables
      WHERE (table_schema='public' AND table_name LIKE 'listas_%')
        OR (table_schema='auth' AND table_name='users')
        OR (table_schema='storage' AND table_name IN ('objects','buckets'))
        OR (table_schema='supabase_migrations' AND table_name='schema_migrations')
      ORDER BY 1,2`)).rows;
    const columns = (await client.query(`SELECT table_schema,table_name,column_name,data_type
      FROM information_schema.columns WHERE (table_schema='auth' AND table_name='users' AND column_name='id')
      OR (table_schema='storage' AND table_name IN ('objects','buckets')) ORDER BY 1,2,ordinal_position`)).rows;
    const policies = (await client.query(`SELECT policyname,cmd,roles,qual,with_check FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'`)).rows;
    const bucket = (await client.query(`SELECT id,public,file_size_limit,allowed_mime_types
      FROM storage.buckets WHERE id='listas-images'`)).rows;
    // Confirm JWT project reference matches the administrative pooler login without printing either.
    const expected = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
    const login = decodeURIComponent(new URL(process.env.SUPABASE_DB_URL).username);
    const targetMatches = login === `postgres.${expected}` ||
      new URL(process.env.SUPABASE_DB_URL).hostname === `db.${expected}.supabase.co`;
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ ok: true, readOnly: true, targetMatches, tables, columns, policies, bucket }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, category: error.code || 'PREFLIGHT_FAILED' }));
    process.exitCode = 1;
  } finally { await client?.end().catch(() => {}); }
})();
