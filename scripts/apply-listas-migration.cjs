/* Explicit forward migration for the existing external project. No legacy baseline changes. */
const { connect } = require('./lib/supabase-admin.cjs');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const migrations = ['006_listas_remote','007_listas_conflict_http'].map(name => {
  const source = fs.readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
  return {name,source,checksum:createHash('sha256').update(source).digest('hex')};
});

(async () => {
  let client;
  try {
    const expected = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
    const url = new URL(process.env.SUPABASE_DB_URL);
    if (decodeURIComponent(url.username) !== `postgres.${expected}` && url.hostname !== `db.${expected}.supabase.co`) {
      throw Object.assign(new Error('Target mismatch'), { code: 'TARGET_MISMATCH' });
    }
    client = await connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('listas-schema-migration',0))");
    await client.query('CREATE SCHEMA IF NOT EXISTS listas_internal');
    await client.query('REVOKE ALL ON SCHEMA listas_internal FROM PUBLIC,anon,authenticated');
    await client.query(`CREATE TABLE IF NOT EXISTS listas_internal.migrations(
      name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = [];
    for (const {name,source,checksum} of migrations) {
      const existing = (await client.query('SELECT checksum FROM listas_internal.migrations WHERE name=$1', [name])).rows[0];
      if (existing) {
        if (existing.checksum !== checksum) throw Object.assign(new Error('Migration drift'), { code: 'MIGRATION_CHECKSUM_MISMATCH' });
      } else {
        if (name==='006_listas_remote') {
          const found = (await client.query("SELECT to_regclass('public.listas_lists') IS NOT NULL AS present")).rows[0].present;
          if (found) throw Object.assign(new Error('Existing untracked schema'), { code: 'UNTRACKED_LISTAS_SCHEMA' });
        }
        // Keep original migrations immutable; the runner journals each within this transaction.
        await client.query(source.replace(/^BEGIN;$/m,'').replace(/^COMMIT;\s*$/m,''));
        await client.query('INSERT INTO listas_internal.migrations(name,checksum) VALUES($1,$2)', [name,checksum]);
        applied.push(name);
      }
    }
    const tables = (await client.query(`SELECT c.relname,c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
      ('listas_accounts','listas_lists','listas_items','listas_images','listas_imports') ORDER BY c.relname`)).rows;
    if (tables.length!==5 || tables.some(t=>!t.relrowsecurity)) throw new Error('RLS verification failed');
    const bucket = (await client.query(`SELECT public,file_size_limit,allowed_mime_types
      FROM storage.buckets WHERE id='listas-images'`)).rows[0];
    if (!bucket || bucket.public || Number(bucket.file_size_limit)!==10485760) throw new Error('Bucket verification failed');
    await client.query('COMMIT');
    console.log(JSON.stringify({ok:true,applied,alreadyApplied:!applied.length,verifiedRlsTables:tables.length,
      privateBucket:true,legacyMigrationHistoryUnchanged:true}));
  } catch (error) {
    await client?.query('ROLLBACK').catch(()=>{});
    console.log(JSON.stringify({ok:false,category:error.code||'MIGRATION_FAILED'}));
    process.exitCode=1;
  } finally { await client?.end().catch(()=>{}); }
})();
