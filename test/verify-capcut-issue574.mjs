import path from 'node:path';
import { spawn } from 'node:child_process';

const browserScriptPath = path.join(process.cwd(), 'test', 'verify-capcut-issue574-browser.mjs');

const child = spawn(process.execPath, [browserScriptPath], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

