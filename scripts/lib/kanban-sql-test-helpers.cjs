const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = id(9001);
const otherUser = id(9002);
const project = id(8001);
const otherProject = id(8002);
const column = (n) => id(7000 + n);
const card = (n) => id(6000 + n);
const proposalPath = path.join(__dirname, '../sql/kanban-project-binding-proposal.sql');

function command(name, args) {
  const result = spawnSync(name, args, {
    encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' },
  });
  if (result.status !== 0) throw new Error(`Local ${name} failed: ${result.stderr || result.stdout}`);
}

function legacyFunctions(file, names) {
  const source = fs.readFileSync(file, 'utf8');
  const blocks = [...source.matchAll(
    /CREATE OR REPLACE FUNCTION (?:public\.)?([a-z0-9_]+)\([\s\S]*?AS (\$[\w]*\$)[\s\S]*?\2;/g,
  )].filter(match => names.includes(match[1])).map(match => match[0]);
  assert.equal(blocks.length, names.length, 'Every inspected legacy function must have a local source');
  return blocks.join('\n');
}

async function fixture(client) {
  await client.query(fs.readFileSync(path.join(__dirname, '../sql/fixtures/kanban-schema.sql'), 'utf8'));
  // Extract only definitions, NEVER run the old migrations in full.
  await client.query(legacyFunctions('migrations/007_service_role_rpc_fix.sql', [
    'move_card', 'update_card_positions', 'update_column_positions', 'get_kanban_data',
  ]));
  await client.query(legacyFunctions('migrations/005_complete_kanban_fix.sql', ['get_user_kanban']));
  await client.query(legacyFunctions('supabase/migrations/005_kanban_column_editing.sql',
    ['edit_kanban_column_v1']));
  await client.query(`INSERT INTO auth.users VALUES ($1),($2)`, [user, otherUser]);
  await client.query(`INSERT INTO public.kanban_projects(id,user_id,name,color)
    VALUES($1,$2,'Original','#AABBCC')`, [project, user]);
  for (let n = 1; n <= 14; n++) {
    await client.query(`INSERT INTO public.kanban_columns(id,user_id,title,position,behavior,project_id)
      VALUES($1,$2,$3,$4,'active',$5)`, [column(n), user, `Column ${n}`, n, n === 1 ? project : null]);
  }
  for (let n = 1; n <= 21; n++) {
    const columnNumber = n <= 8 ? 1 : 2 + (n % 12);
    await client.query(`INSERT INTO public.kanban_cards(
      id,user_id,column_id,title,description,priority,tags,subtasks,position,project_id,due_date,completed_at)
      VALUES($1,$2,$3,$4,'Synthetic description','alta','["synthetic"]',
        '[{"id":"synthetic","completed":true}]',$5,$6,'2030-01-01',$7)`,
    [card(n), user, column(columnNumber), `Card ${n}`, n,
      n > 4 && columnNumber === 1 ? project : null, n <= 3 ? '2020-01-01T00:00:00Z' : null]);
  }
}

async function localDatabase() {
  // The runner accepts NO database URL. It never loads a Supabase secret.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-sql-local-'));
  const data = path.join(directory, 'data');
  command('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale']);
  command('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o',
    `-k ${directory} -p 55439 -c listen_addresses='' -c fsync=off`, '-w', 'start']);
  const options = { host: directory, port: 55439, user: 'postgres', database: 'postgres',
    connectionTimeoutMillis: 5000, statement_timeout: 10000 };
  const clients = new Set();
  async function connect() {
    const client = new Client(options);
    await client.connect();
    clients.add(client);
    return client;
  }
  async function close() {
    for (const client of clients) await client.end().catch(() => {});
    command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return { connect, close };
}

async function invariant(client) {
  const result = await client.query(`SELECT count(*)::int AS failures
    FROM public.kanban_cards k LEFT JOIN public.kanban_columns c ON c.id=k.column_id
    WHERE c.id IS NULL OR k.user_id IS DISTINCT FROM c.user_id
      OR k.project_id IS DISTINCT FROM c.project_id`);
  assert.equal(result.rows[0].failures, 0);
}

async function edit(client, updates = {}, expected = {}, changes = [], target = project, owner = user) {
  return (await client.query(`SELECT public.edit_kanban_project_v1($1,$2,$3,$4,$5) AS result`,
    [owner, target, JSON.stringify(updates), JSON.stringify(expected), JSON.stringify(changes)])).rows[0].result;
}

const change = (n, before, after) => ({ columnId: column(n), expectedProjectId: before, projectId: after });

async function reject(client, code, operation) {
  await client.query('SAVEPOINT rejected_operation');
  await assert.rejects(operation, error => error.code === code);
  await client.query('ROLLBACK TO SAVEPOINT rejected_operation');
  await client.query('RELEASE SAVEPOINT rejected_operation');
}

module.exports = { assert, fs, id, user, otherUser, project, otherProject, column, card,
  proposalPath, fixture, localDatabase, invariant, edit, change, reject };