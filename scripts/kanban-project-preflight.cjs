/* Read-only inspection. Never prints credentials, user IDs, or card content. */
const { Client } = require('pg');

async function main() {
  if (!process.env.SUPABASE_DB_URL) {
    console.log(JSON.stringify({ ok: false, category: 'missing_database_connection' }));
    process.exitCode = 1;
    return;
  }
  let client;
  try {
    client = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
      ssl: { rejectUnauthorized: true },
    });
    await client.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    const schema = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('kanban_projects', 'kanban_columns', 'kanban_cards')
      ORDER BY table_name, ordinal_position
    `);
    const constraints = await client.query(`
      SELECT conrelid::regclass::text AS relation, conname,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN ('public.kanban_projects'::regclass,
        'public.kanban_columns'::regclass, 'public.kanban_cards'::regclass)
      ORDER BY relation, conname
    `);
    const triggers = await client.query(`
      SELECT tgrelid::regclass::text AS relation, tgname,
        pg_get_triggerdef(oid) AS definition
      FROM pg_trigger
      WHERE NOT tgisinternal AND tgrelid IN ('public.kanban_projects'::regclass,
        'public.kanban_columns'::regclass, 'public.kanban_cards'::regclass)
      ORDER BY relation, tgname
    `);
    const functions = await client.query(`
      SELECT p.oid::regprocedure::text AS signature, p.prosecdef AS security_definer,
        p.proacl::text AS grants, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND (p.proname LIKE '%kanban%'
        OR p.proname IN ('move_card','update_card_positions','update_column_positions'))
      ORDER BY signature
    `);
    const policies = await client.query(`
      SELECT tablename, policyname, roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname='public'
        AND tablename IN ('kanban_projects','kanban_columns','kanban_cards')
      ORDER BY tablename, policyname
    `);
    const grants = await client.query(`
      SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public'
        AND table_name IN ('kanban_projects','kanban_columns','kanban_cards')
      ORDER BY table_name, grantee, privilege_type
    `);
    const counts = await client.query(`
      SELECT count(*)::int AS cards,
        count(*) FILTER (WHERE c.project_id IS DISTINCT FROM col.project_id)::int AS mismatches,
        count(*) FILTER (WHERE col.project_id IS NULL AND c.project_id IS NOT NULL)::int AS projects_in_unbound_columns,
        count(*) FILTER (WHERE col.project_id IS NOT NULL AND c.project_id IS DISTINCT FROM col.project_id)::int AS bound_mismatches,
        count(*) FILTER (WHERE col.id IS NULL)::int AS missing_columns,
        count(*) FILTER (WHERE c.user_id IS DISTINCT FROM col.user_id)::int AS owner_mismatches
      FROM public.kanban_cards c LEFT JOIN public.kanban_columns col ON col.id=c.column_id
    `);
    const history = await client.query("SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS available");
    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      ok: true, readOnly: true, schema: schema.rows, constraints: constraints.rows,
      triggers: triggers.rows, functions: functions.rows, policies: policies.rows,
      grants: grants.rows, counts: counts.rows[0], migrationHistoryAvailable: history.rows[0].available,
    }, null, 2));
  } catch (error) {
    // Do not print message/stack: PostgreSQL errors may contain connection details.
    console.log(JSON.stringify({ ok: false, category: error.code || 'connection_or_query_error' }));
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}
async function inspectRest() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const columns = new Map();
    let counts = { cards: 0, mismatches: 0, projects_in_unbound_columns: 0,
      bound_mismatches: 0, missing_columns: 0, owner_mismatches: 0 };
    for (const table of ['kanban_columns', 'kanban_cards']) {
      for (let offset = 0; ; offset += 1000) {
        const fields = table === 'kanban_columns'
          ? 'id,user_id,project_id' : 'column_id,user_id,project_id';
        const { data, error } = await api.from(table).select(fields).range(offset, offset + 999);
        if (error) throw Object.assign(new Error('Read-only query failed'), { code: error.code });
        for (const row of data || []) {
          if (table === 'kanban_columns') {
            columns.set(row.id, row);
            continue;
          }
          counts.cards++;
          const column = columns.get(row.column_id);
          if (!column) counts.missing_columns++;
          if (column && row.user_id !== column.user_id) counts.owner_mismatches++;
          if ((row.project_id ?? null) !== (column?.project_id ?? null)) {
            counts.mismatches++;
            if (column?.project_id == null) counts.projects_in_unbound_columns++;
            else counts.bound_mismatches++;
          }
        }
        if (!data || data.length < 1000) break;
      }
    }
    console.log(JSON.stringify({ ok: true, readOnly: true, source: 'application_rest_api',
      atomicSnapshot: false, columns: columns.size, counts,
      sqlMetadataVerified: false }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, category: error.code || 'rest_connection_error' }));
    process.exitCode = 1;
  }
}
if (process.argv.includes('--rest')) inspectRest();
else main();