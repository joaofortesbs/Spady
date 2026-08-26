const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const entrypoint = path.join(root, 'dist', 'index.js');
const port = process.env.SMOKE_PORT || '3101';
const baseUrl = `http://127.0.0.1:${port}`;

if (!existsSync(entrypoint)) {
  throw new Error('Missing dist/index.js. Run npm run build first.');
}

const server = spawn(process.execPath, [entrypoint], {
  cwd: root,
  env: {
    ...process.env,
    HOSTNAME: '203.0.113.254',
    PORT: port,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk;
});
server.stderr.on('data', (chunk) => {
  output += chunk;
});

async function waitForResponse(pathname, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) return response;
      lastError = new Error(`${pathname} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError || new Error(`Timed out waiting for ${pathname}`);
}

async function shutdown() {
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
}

(async () => {
  try {
    const rootResponse = await waitForResponse('/');
    const healthResponse = await waitForResponse('/api/health');
    const health = await healthResponse.json();

    if (health.status !== 'ok') {
      throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
    }

    console.log(`Publish smoke test passed: /=${rootResponse.status}, /api/health=${healthResponse.status}`);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    await shutdown();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});