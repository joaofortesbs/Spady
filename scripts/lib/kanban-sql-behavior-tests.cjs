const { assert, id, user, otherUser, project, otherProject, column, card,
  invariant, edit, change, reject } = require('./kanban-sql-test-helpers.cjs');

async function behaviorTests(client, test) {
  await test('instalação corrige 4 vínculos e preserva os demais campos', async () => {
    await client.query('RESET ROLE');
    const rows = await client.query(`SELECT count(*)::int n
      FROM kanban_integrity.pre_binding_cards b JOIN public.kanban_cards k USING(id)
      WHERE b.project_id IS DISTINCT FROM k.project_id`);
    assert.equal(rows.rows[0].n, 4);
    await invariant(client);
    const protection = await client.query(`SELECT count(*)::int n FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname IN ('kanban_integrity','public') AND p.prosecdef
        AND p.proname IN ('serialize','guard_statement','guard_owner','guard_column',
          'inherit_card_project','propagate_column_project','edit_kanban_project_v1',
          'edit_kanban_column_v1','get_kanban_data','get_user_kanban','move_card',
          'update_card_positions','update_column_positions')`);
    assert.equal(protection.rows[0].n, 0);
    await client.query('SET LOCAL ROLE service_role');
  });
  await test('nome e cor não regravam colunas ou tarefas', async () => {
    const before = await client.query('SELECT to_jsonb(k) record FROM public.kanban_cards k ORDER BY id');
    const beforeColumns = await client.query('SELECT to_jsonb(c) record FROM public.kanban_columns c ORDER BY id');
    const result = await edit(client, { name: 'Renamed', color: '#FFCCAA' },
      { name: 'Original', color: '#AABBCC' });
    assert.equal(result.project.name, 'Renamed');
    assert.equal(result.project.color, '#ffccaa');
    assert.deepEqual(result.columns, []);
    assert.deepEqual(result.cards, []);
    assert.deepEqual((await client.query('SELECT to_jsonb(k) record FROM public.kanban_cards k ORDER BY id')).rows,
      before.rows);
    assert.deepEqual((await client.query('SELECT to_jsonb(c) record FROM public.kanban_columns c ORDER BY id')).rows,
      beforeColumns.rows);
  });
  await test('vínculo, desvínculo e resposta com todos os cards, inclusive concluídos', async () => {
    let result = await edit(client, {}, {}, [change(1, project, null)]);
    assert.equal(result.columns[0].projectId, null);
    assert.equal(result.cards.length, 8);
    assert.ok(result.cards.every(k => k.projectId === null && k.columnId === column(1)));
    await invariant(client);
    result = await edit(client, {}, {}, [change(1, null, project)]);
    assert.equal(result.cards.length, 8);
    assert.ok(result.cards.every(k => k.projectId === project));
    await invariant(client);
  });
  await test('transferência de coluna de outro projeto preserva seus cards', async () => {
    await client.query(`INSERT INTO public.kanban_projects(id,user_id,name,color)
      VALUES($1,$2,'Second','#112233')`, [otherProject, user]);
    await client.query(`UPDATE public.kanban_columns SET project_id=$1 WHERE id=$2`,
      [otherProject, column(1)]);
    const result = await edit(client, {}, {}, [change(1, otherProject, project)]);
    assert.equal(result.cards.length, 8);
    await invariant(client);
  });
  await test('conflito de nome aborta toda a edição', async () => {
    await reject(client, '40001', () => edit(client, { name: 'Changed' }, { name: 'Stale' },
      [change(2, null, project)]));
    assert.equal((await client.query('SELECT project_id FROM public.kanban_columns WHERE id=$1',
      [column(2)])).rows[0].project_id, null);
  });
  await test('conflito de vínculo aborta nome, cor e outras colunas', async () => {
    await reject(client, '40001', () => edit(client, { name: 'Changed' }, { name: 'Original' },
      [change(2, null, project), change(3, project, null)]));
    assert.equal((await client.query('SELECT name FROM public.kanban_projects WHERE id=$1',
      [project])).rows[0].name, 'Original');
    await invariant(client);
  });
  await test('metadados não incluídos no envio são preservados', async () => {
    await client.query('UPDATE public.kanban_projects SET color=$1 WHERE id=$2', ['#123456', project]);
    const result = await edit(client, { name: 'Changed' }, { name: 'Original' });
    assert.equal(result.project.color, '#123456');
  });
  await test('coluna removida produz conflito sem edição parcial', async () => {
    await client.query('DELETE FROM public.kanban_columns WHERE id=$1', [column(14)]);
    await reject(client, '40001', () => edit(client, { name: 'Changed' }, { name: 'Original' },
      [change(14, null, project)]));
  });
  await test('falha durante propagação reverte nome, cor e vínculos', async () => {
    await client.query('RESET ROLE');
    await client.query(`CREATE FUNCTION public.fixture_fail_card() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic failure'; END; $$;
      CREATE TRIGGER z_fixture_failure BEFORE UPDATE ON public.kanban_cards
      FOR EACH ROW EXECUTE FUNCTION public.fixture_fail_card();`);
    await client.query('SET LOCAL ROLE service_role');
    await reject(client, 'P0001', () => edit(client, { name: 'Changed' }, { name: 'Original' },
      [change(1, project, null)]));
    assert.equal((await client.query('SELECT name FROM public.kanban_projects WHERE id=$1',
      [project])).rows[0].name, 'Original');
    await invariant(client);
  });
  const malformed = [
    ['nome vazio', { name: ' ' }, { name: 'Original' }, []],
    ['cor inválida', { color: 'orange' }, { color: '#AABBCC' }, []],
    ['campo extra', { hidden: true }, {}, []],
    ['expected ausente', { name: 'New' }, {}, []],
    ['nenhuma mudança', {}, {}, []],
    ['colunas duplicadas', {}, {}, [change(2, null, project), change(2, null, project)]],
    ['terceiro projeto', {}, {}, [change(2, null, otherProject)]],
    ['desvincular outro projeto', {}, {}, [change(2, otherProject, null)]],
    ['diferença sem efeito', {}, {}, [change(1, project, project)]],
    ['campo de coluna extra', {}, {}, [{ ...change(2, null, project), extra: true }]],
  ];
  for (const [name, updates, expected, changes] of malformed) {
    await test(`validação SQL rejeita ${name}`, async () => {
      await reject(client, '22023', () => edit(client, updates, expected, changes));
      await invariant(client);
    });
  }
  await test('INSERT/UPDATE direto ignora atribuição individual e herda inclusive nulo', async () => {
    await client.query(`INSERT INTO public.kanban_cards(id,user_id,column_id,title,priority,position,project_id)
      VALUES($1,$2,$3,'New','media',0,$4)`, [id(9901), user, column(1), id(9999)]);
    assert.equal((await client.query('SELECT project_id FROM public.kanban_cards WHERE id=$1',
      [id(9901)])).rows[0].project_id, project);
    await client.query('UPDATE public.kanban_cards SET column_id=$1,project_id=$2 WHERE id=$3',
      [column(2), project, id(9901)]);
    assert.equal((await client.query('SELECT project_id FROM public.kanban_cards WHERE id=$1',
      [id(9901)])).rows[0].project_id, null);
    await invariant(client);
  });
  await test('RPCs antigas de movimento e reorder seguem a coluna', async () => {
    await client.query('SELECT public.move_card($1,$2,$3,$4)', [user, card(1), column(2), 10]);
    await client.query('SELECT public.update_card_positions($1,$2)',
      [user, JSON.stringify([{ id: card(1), column_id: column(1), position: 0 }])]);
    await client.query('SELECT public.update_column_positions($1,$2)',
      [user, JSON.stringify([{ id: column(1), position: 5 }])]);
    await invariant(client);
  });
  await test('RPC antiga de edição de coluna suporta nulo e preserva retorno', async () => {
    const result = (await client.query('SELECT public.edit_kanban_column_v1($1,$2,$3) result',
      [user, column(1), JSON.stringify({ project_id: null })])).rows[0].result;
    assert.equal(result.column.project_id, null);
    assert.equal(result.cards_updated_count, 8);
    await invariant(client);
  });
  await test('cruzamento entre proprietários e mudança de dono são rejeitados', async () => {
    await client.query(`INSERT INTO public.kanban_projects(id,user_id,name,color)
      VALUES($1,$2,'Other owner','#112233')`, [otherProject, otherUser]);
    await client.query(`INSERT INTO public.kanban_columns(id,user_id,title,position)
      VALUES($1,$2,'Other owner',0)`, [id(9900), otherUser]);
    await reject(client, '42501', () => edit(client, { name: 'Bad' }, { name: 'Original' }, [], project, otherUser));
    await reject(client, '42501', () => edit(client, {}, {},
      [{ columnId: id(9900), expectedProjectId: null, projectId: project }]));
    await reject(client, '42501', () => client.query(
      'UPDATE public.kanban_cards SET column_id=$1 WHERE id=$2', [id(9900), card(1)]));
    await reject(client, '42501', () => client.query(
      'UPDATE public.kanban_columns SET project_id=$1 WHERE id=$2', [otherProject, column(1)]));
    await reject(client, '42501', () => client.query(
      'UPDATE public.kanban_projects SET user_id=$1 WHERE id=$2', [otherUser, project]));
    await invariant(client);
  });
  await test('excluir projeto conserva cards/colunas e remove todos os vínculos', async () => {
    await client.query('DELETE FROM public.kanban_projects WHERE id=$1', [project]);
    assert.equal((await client.query('SELECT count(*)::int n FROM public.kanban_cards')).rows[0].n, 21);
    assert.equal((await client.query('SELECT count(*)::int n FROM public.kanban_columns')).rows[0].n, 14);
    await invariant(client);
  });
  await test('excluir coluna conserva o comportamento CASCADE existente', async () => {
    await client.query('DELETE FROM public.kanban_columns WHERE id=$1', [column(1)]);
    assert.equal((await client.query('SELECT count(*)::int n FROM public.kanban_cards')).rows[0].n, 13);
    await invariant(client);
  });
  await test('permissões negam funções inseguras a anon/authenticated e backup a todos os papéis do app', async () => {
    await client.query('RESET ROLE');
    const permissions = await client.query(`SELECT p.oid::regprocedure::text signature,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
      has_function_privilege('service_role',p.oid,'EXECUTE') server
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('get_kanban_data','get_user_kanban',
        'move_card','update_card_positions','update_column_positions',
        'edit_kanban_column_v1','edit_kanban_project_v1')`);
    for (const permission of permissions.rows) {
      assert.equal(permission.anon, false);
      assert.equal(permission.authenticated, permission.signature === 'get_user_kanban(uuid)');
      assert.equal(permission.server, true);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const permissions = await client.query(`SELECT
        has_table_privilege($1,'kanban_integrity.pre_binding_cards','SELECT') backup,
        has_table_privilege($1,'public.kanban_cards','TRUNCATE') truncate`,
      [role]);
      assert.equal(permissions.rows[0].backup, false);
      if (role !== 'service_role') assert.equal(permissions.rows[0].truncate, false);
      await client.query(`SET LOCAL ROLE ${role}`);
      if (role !== 'service_role') {
        await reject(client, '42501', () => client.query('SELECT public.get_kanban_data($1)', [user]));
        await reject(client, '42501', () => client.query(
          'SELECT public.move_card($1,$2,$3,0)', [user, card(1), column(2)]));
      }
      await reject(client, '42501', () => client.query('SELECT * FROM kanban_integrity.pre_binding_cards'));
      await client.query('RESET ROLE');
    }
  });
  await test('DML authenticated legítimo funciona com RLS e a herança', async () => {
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    await client.query('UPDATE public.kanban_columns SET project_id=NULL WHERE id=$1', [column(1)]);
    await invariant(client);
    const result = await client.query('SELECT * FROM public.get_user_kanban($1)', [user]);
    assert.ok(result.rows.length > 0);
    await reject(client, 'P0001', () => client.query('SELECT * FROM public.get_user_kanban($1)', [otherUser]));
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [otherUser]);
    assert.equal((await client.query('SELECT id FROM public.kanban_cards')).rowCount, 0);
  });
}

module.exports = { behaviorTests };