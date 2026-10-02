const { assert, id, user, project, column, card, invariant, edit, change } =
  require('./kanban-sql-test-helpers.cjs');

async function concurrencyTests(database, admin, report) {
  const first = await database.connect();
  const second = await database.connect();
  async function begin(client, isolation = 'READ COMMITTED') {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query('SET LOCAL ROLE service_role');
  }
  async function paired(name, operationA, operationB) {
    await begin(first);
    await begin(second);
    try {
      await operationA(first);
      const pid = (await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      let settled = false;
      const pending = operationB(second).finally(() => { settled = true; });
      // Observe PostgreSQL's actual wait state rather than merely sleeping.
      let waiting = false;
      for (let n = 0; n < 80; n++) {
        const result = await admin.query(`SELECT wait_event FROM pg_stat_activity WHERE pid=$1`, [pid]);
        if (result.rows[0]?.wait_event === 'advisory') { waiting = true; break; }
        if (settled) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(waiting, true, 'Second writer must wait on serialization, not a row lock');
      await first.query('COMMIT');
      await pending;
      await second.query('COMMIT');
      await invariant(admin);
      report(name);
    } finally {
      await first.query('ROLLBACK');
      await second.query('ROLLBACK');
    }
  }
  const bind = async (client, destination) => {
    // Submit the intended change directly. A pre-RPC SELECT can see the old
    // committed binding and incorrectly skip a change while another writer holds it.
    await edit(client, {}, {}, [change(1, destination === null ? project : null, destination)]);
  };
  const insert = async (client, n) => client.query(`INSERT INTO public.kanban_cards(
    id,user_id,column_id,title,priority,position,project_id)
    VALUES($1,$2,$3,'Concurrent card','media',0,NULL)`, [id(10000 + n), user, column(1)]);
  await paired('concorrência: transferência antes de criação', client => bind(client, null),
    client => insert(client, 1));
  await paired('concorrência: criação antes de transferência', client => insert(client, 2),
    client => bind(client, project));
  await paired('concorrência: transferência antes de movimento antigo', client => bind(client, null),
    client => client.query('SELECT public.move_card($1,$2,$3,0)', [user, card(1), column(1)]));
  await paired('concorrência: movimento antigo antes de transferência',
    client => client.query('SELECT public.move_card($1,$2,$3,0)', [user, card(1), column(2)]),
    client => bind(client, project));
  await paired('concorrência: RPC de coluna antes de edição coletiva',
    client => client.query('SELECT public.edit_kanban_column_v1($1,$2,$3)',
      [user, column(1), JSON.stringify({ project_id: null })]),
    client => bind(client, project));
  await paired('concorrência: edição coletiva antes de RPC de coluna',
    client => bind(client, null),
    client => client.query('SELECT public.edit_kanban_column_v1($1,$2,$3)',
      [user, column(1), JSON.stringify({ project_id: project })]));
  await paired('concorrência: DML de coluna antes de reorder antigo',
    client => client.query('UPDATE public.kanban_columns SET project_id=NULL WHERE id=$1', [column(1)]),
    client => client.query('SELECT public.update_card_positions($1,$2)', [user,
      JSON.stringify([{ id: card(1), column_id: column(1), position: 4 }])]));
  await paired('concorrência: reorder antigo antes de DML de coluna',
    client => client.query('SELECT public.update_card_positions($1,$2)', [user,
      JSON.stringify([{ id: card(1), column_id: column(2), position: 5 }])]),
    client => client.query('UPDATE public.kanban_columns SET project_id=$1 WHERE id=$2', [project, column(1)]));

  // Both editors submit the SAME old binding. The loser must fail as a conflict,
  // not silently confirm a second stale update.
  await begin(first);
  await begin(second);
  try {
    await edit(first, {}, {}, [change(1, project, null)]);
    const losing = edit(second, {}, {}, [change(1, project, null)]);
    const assertion = assert.rejects(losing, error => error.code === '40001');
    await first.query('COMMIT');
    await assertion;
    await second.query('ROLLBACK');
    await invariant(admin);
    report('concorrência: edições simultâneas rejeitam o snapshot antigo');
  } finally {
    await first.query('ROLLBACK');
    await second.query('ROLLBACK');
  }

  // A mutex alone cannot refresh a REPEATABLE READ snapshot. The parent row lock
  // must force a serialization error rather than persist an old inherited value.
  await begin(second, 'REPEATABLE READ');
  try {
    await second.query('SELECT project_id FROM public.kanban_columns WHERE id=$1', [column(1)]);
    await begin(first);
    await bind(first, project);
    await first.query('COMMIT');
    await assert.rejects(() => insert(second, 3), error => error.code === '40001');
    await second.query('ROLLBACK');
    await invariant(admin);
    report('concorrência: snapshot REPEATABLE READ antigo não cria vínculo divergente');
  } finally {
    await first.query('ROLLBACK');
    await second.query('ROLLBACK');
  }
  await paired('concorrência: transferência antes de exclusão de projeto',
    client => bind(client, null),
    client => client.query('DELETE FROM public.kanban_projects WHERE id=$1', [project]));
  // Original ON DELETE CASCADE must still remove every card of a removed column.
  await paired('concorrência: movimento antes de exclusão de coluna',
    client => client.query('SELECT public.move_card($1,$2,$3,0)', [user, card(1), column(2)]),
    client => client.query('DELETE FROM public.kanban_columns WHERE id=$1', [column(2)]));
}

module.exports = { concurrencyTests };