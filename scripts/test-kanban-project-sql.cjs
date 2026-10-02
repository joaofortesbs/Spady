/* Local-only PostgreSQL tests. No remote URL, credentials, or real records. */
const { assert, fs, proposalPath, fixture, localDatabase, invariant } =
  require('./lib/kanban-sql-test-helpers.cjs');
const { behaviorTests } = require('./lib/kanban-sql-behavior-tests.cjs');
const { concurrencyTests } = require('./lib/kanban-sql-concurrency-tests.cjs');

async function main() {
  const database = await localDatabase();
  let passed = 0;
  const report = name => { passed++; console.log(`PASS ${name}`); };
  try {
    const client = await database.connect();
    await fixture(client);
    const proposal = fs.readFileSync(proposalPath, 'utf8');
    // Refuse schema drift and prove the failed proposal leaves no new objects.
    await client.query('INSERT INTO public.kanban_projects(user_id,name,color) SELECT id,\'Drift\',\'#112233\' FROM auth.users LIMIT 1');
    await assert.rejects(() => client.query(proposal), error => error.code === 'P0001');
    await client.query('ROLLBACK');
    assert.equal((await client.query("SELECT to_regnamespace('kanban_integrity') namespace")).rows[0].namespace, null);
    await client.query("DELETE FROM public.kanban_projects WHERE name='Drift'");
    report('pré-condições impedem aplicação se o impacto mudou');
    await client.query(proposal);
    await invariant(client);
    // Every behavior test rolls back its own synthetic mutations.
    const test = async (name, operation) => {
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE service_role');
        await operation();
        report(name);
      } finally {
        await client.query('ROLLBACK');
      }
    };
    await behaviorTests(client, test);
    await concurrencyTests(database, client, report);
    console.log(`SUCCESS ${passed} PostgreSQL checks. Remote database untouched.`);
  } finally {
    await database.close();
  }
}

main().catch(error => {
  // All connections are hard-coded local; still avoid dumping full SQL/errors.
  console.error(`FAIL local SQL tests: ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
});