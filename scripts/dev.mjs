import { spawn } from 'node:child_process';

const children = [];
const commands = [
  ['web', ['run', 'dev:web']],
  ['dashboard', ['run', 'dev:dashboard']],
  ['backend', ['run', 'dev:backend']],
  ['realtime', ['run', 'dev:realtime']],
];

for (const [name, args] of commands) {
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
  });
  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}${signal ? ` (${signal})` : ''}`);
      shutdown(code);
    }
  });
  children.push(child);
}

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  const timer = setTimeout(() => {
    for (const child of children) if (!child.killed) child.kill('SIGKILL');
    process.exit(code);
  }, 5000);
  timer.unref();
  Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve))))
    .finally(() => process.exit(code));
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
