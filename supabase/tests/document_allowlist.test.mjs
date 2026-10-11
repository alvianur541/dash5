import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migrationPath = new URL('../migrations/20261011_document_allowlist.sql', import.meta.url);

// Isolated PostgreSQL fixture, never a remote database connection.
const setup = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.email', true), '') $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE public.user_niks (nik text PRIMARY KEY, auth_email text);
ALTER TABLE public.user_niks ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.documents (id bigint PRIMARY KEY, content text, metadata jsonb);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read for email-authenticated users only" ON public.documents
FOR SELECT TO authenticated USING (auth.email() IS NOT NULL);
GRANT SELECT ON public.documents TO anon, authenticated, service_role;
CREATE FUNCTION public.document_catalog() RETURNS TABLE (model text, kategori text, count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT metadata->>'Model', metadata->>'Kategori', count(*)::integer FROM documents GROUP BY 1,2 $$;
REVOKE ALL ON FUNCTION public.document_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_catalog() TO authenticated, service_role;
CREATE VIEW public.parts_catalog_view WITH (security_invoker=true) AS SELECT * FROM public.documents;
GRANT SELECT ON public.parts_catalog_view TO anon, authenticated, service_role;
INSERT INTO auth.users VALUES
('00000000-0000-0000-0000-000000000001', 'staff@example.invalid', now()),
('00000000-0000-0000-0000-000000000002', 'outsider@example.invalid', now()),
('00000000-0000-0000-0000-000000000003', 'pending@example.invalid', NULL),
('00000000-0000-0000-0000-000000000004', 'demo@example.invalid', now());
INSERT INTO public.user_niks VALUES ('N1', 'staff@example.invalid'), ('N3', 'pending@example.invalid'), ('N4', 'demo@example.invalid');
INSERT INTO public.documents VALUES (1,'dummy manual','{"Model":"TEST","Kategori":"TEST"}');
`;

async function asUser(db, role, id = '', email = '') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)", [id, email]);
  await db.exec(`SET ROLE ${role}`);
  const direct = await db.query('SELECT count(*)::integer AS count FROM public.documents');
  const view = await db.query('SELECT count(*)::integer AS count FROM public.parts_catalog_view');
  return [direct.rows[0].count, view.rows[0].count];
}

test('allowlist gates documents, invoker view and catalog without exposing mapping', async () => {
  const db = new PGlite();
  try {
    await db.exec(setup);
    // Before the migration, this authenticated non-allowlisted account can read.
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000002', 'outsider@example.invalid'), [1, 1]);
    await db.exec('RESET ROLE');
    const migration = await readFile(migrationPath, 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Re-running does not weaken the policy or grants.
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000002', 'staff@example.invalid'), [0, 0], 'outsider must be denied even with an allowlisted JWT email');
    assert.equal((await db.query('SELECT * FROM public.document_catalog()')).rows.length, 0);
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000001', 'staff@example.invalid'), [1, 1]);
    assert.equal((await db.query('SELECT * FROM public.document_catalog()')).rows.length, 1);
    assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.user_niks','SELECT') AS allowed")).rows[0].allowed, false);
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000003', 'pending@example.invalid'), [0, 0]);
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000004', 'demo@example.invalid'), [1, 1]);
    assert.deepEqual(await asUser(db, 'authenticated', '', 'staff@example.invalid'), [0, 0]);
    assert.deepEqual(await asUser(db, 'anon'), [0, 0]);
    assert.equal((await db.query("SELECT has_function_privilege('anon','public.document_catalog()','EXECUTE') AS allowed")).rows[0].allowed, false);
    assert.deepEqual(await asUser(db, 'service_role'), [1, 1]);
    await db.exec('RESET ROLE');
    // A different permissive policy cannot override a restrictive gate.
    await db.exec('CREATE POLICY other_reader ON public.documents FOR SELECT TO authenticated USING (true)');
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000002', 'outsider@example.invalid'), [0, 0]);
    await db.exec('RESET ROLE');
    await db.exec("UPDATE public.user_niks SET auth_email='removed@example.invalid' WHERE nik='N1'");
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000001', 'staff@example.invalid'), [0, 0]);
    await db.exec('RESET ROLE');
    await db.exec("UPDATE public.user_niks SET auth_email='STAFF@example.invalid' WHERE nik='N1'");
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000001', 'stale@example.invalid'), [1, 1]);
    await db.exec('RESET ROLE');
    await db.exec("UPDATE auth.users SET email='changed@example.invalid' WHERE id='00000000-0000-0000-0000-000000000001'");
    assert.deepEqual(await asUser(db, 'authenticated', '00000000-0000-0000-0000-000000000001', 'staff@example.invalid'), [0, 0]);
  } finally { await db.close(); }
});
