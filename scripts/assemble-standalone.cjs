const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const standaloneDir = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');
const wrapper = path.join(root, 'scripts', 'start-standalone.cjs');

for (const requiredPath of [standaloneDir, staticDir, wrapper]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Missing required production artifact: ${requiredPath}`);
  }
}

rmSync(distDir, { recursive: true, force: true });
cpSync(standaloneDir, distDir, { recursive: true });

mkdirSync(path.join(distDir, '.next'), { recursive: true });
cpSync(staticDir, path.join(distDir, '.next', 'static'), { recursive: true });

if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(distDir, 'public'), { recursive: true });
}

cpSync(wrapper, path.join(distDir, 'index.js'));

for (const requiredPath of [
  path.join(distDir, 'index.js'),
  path.join(distDir, 'server.js'),
  path.join(distDir, '.next', 'static'),
]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Standalone assembly failed: ${requiredPath}`);
  }
}

console.log('Standalone production artifact assembled in dist/');