/* Administrative scripts only. Never log URLs, credentials, query values or raw errors. */
const { Client } = require('pg');
const fs = require('node:fs');
const tls = require('node:tls');

async function connect() {
  if (!process.env.SUPABASE_DB_URL) throw Object.assign(new Error('Missing database secret'), { code: 'MISSING_DB_SECRET' });
  const caPath = process.env.SUPABASE_CA_FILE || '/tmp/supabase-ca.crt';
  const ca = fs.existsSync(caPath) ? [...tls.rootCertificates, fs.readFileSync(caPath, 'utf8')] : tls.rootCertificates;
  // Strip URL SSL flags: pg otherwise overwrites the explicit verified TLS configuration.
  const url = new URL(process.env.SUPABASE_DB_URL);
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
  const client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: true, ca },
    connectionTimeoutMillis: 12000, statement_timeout: 30000 });
  await client.connect();
  return client;
}
module.exports = { connect };
