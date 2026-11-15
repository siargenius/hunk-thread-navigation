import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readFileSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pty from 'node-pty';
import xterm from '@xterm/headless';
const root = mkdtempSync(join(tmpdir(), 'hunk-thread-nav-'));
const cwd = join(root, 'repo');
mkdirSync(cwd);
const installed = process.env.HUNK_SMOKE_INSTALLED === '1';
const env = { ...process.env, TERM: 'xterm-256color', XDG_CONFIG_HOME: installed ? (process.env.XDG_CONFIG_HOME || join(homedir(), '.config')) : join(root, 'config') };
if (!installed) {
  mkdirSync(join(env.XDG_CONFIG_HOME, 'hunk'), { recursive: true });
  writeFileSync(join(env.XDG_CONFIG_HOME, 'hunk/config.toml'), '[keybindings]\n"hunk.review.previousAnnotatedHunk" = []\n"hunk.review.nextAnnotatedHunk" = []\n');
}
const run = (exe, args) => execFileSync(exe, args, { cwd, env, encoding: 'utf8' });
const cli = async args => (await promisify(execFile)(hunk, args, { cwd, env, encoding: 'utf8', timeout: 15000 })).stdout;
const hunk = process.env.HUNK_BIN || '/opt/homebrew/bin/hunk';
run('git', ['init', '-q']);
writeFileSync(join(cwd, 'a.txt'), Array.from({ length: 20 }, (_, i) => `before ${i + 1}`).join('\n')+'\n');
writeFileSync(join(cwd, 'b.txt'), 'before\n');
run('git', ['add', '.']);
run('git', ['-c', 'user.name=Smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '-qm', 'fixture']);
writeFileSync(join(cwd, 'a.txt'), Array.from({ length: 20 }, (_, i) => `after ${i + 1}`).join('\n')+'\n');
writeFileSync(join(cwd, 'b.txt'), 'after\n');
writeFileSync(join(root, 'notes.json'), JSON.stringify({ files: [
  { path: 'a.txt', annotations: [
    { id: 'first', summary: 'First thread', newRange: [3, 3] },
    { id: 'last', summary: 'Second thread in same hunk', newRange: [16, 16] },
    { id: 'deleted', summary: 'Deleted-line thread', oldRange: [7, 7] },
  ] },
  { path: 'b.txt', annotations: [{ summary: 'Other file', newRange: [1, 1] }] },
] }));
// Probe through a real command context after each jump, not through the navigation helper.
const probeFile = join(root, 'position.json');
writeFileSync(join(root, 'probe.ts'), `import { writeFileSync } from 'node:fs'; export default function(hunk) { let seq=0; hunk.registerCommand({id:"probe", title:"Probe", key:"ctrl+t"}, ctx => { writeFileSync(${JSON.stringify(probeFile)}, JSON.stringify({seq:++seq,path:ctx.selection.file?.path,line:ctx.selection.currentLine,files:ctx.selection.files.map(f=>({path:f.path, noteCount:f.agent?.annotations.length ?? 0}))})); }); }`);
const term = new xterm.Terminal({ cols: 140, rows: 42, allowProposedApi: true });
let child;
let exited = false;
const screen = () => Array.from({ length: term.rows }, (_, i) => term.buffer.active.getLine(i)?.translateToString(true) ?? '').join('\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label) {
  for (let i=0; i<100; i++) { await sleep(100); if (test()) return; if (exited) break; }
  throw new Error(label+'\n'+screen());
}
async function probe() {
  const before = existsSync(probeFile) ? JSON.parse(readFileSync(probeFile, 'utf8')).seq : 0;
  child.write('\x14');
  await until(() => existsSync(probeFile) && JSON.parse(readFileSync(probeFile, 'utf8')).seq > before, 'probe received');
  return JSON.parse(readFileSync(probeFile, 'utf8'));
}
async function jump(key, target) {
  child.write(key);
  let last;
  for (let i=0; i<40; i++) {
    last = await probe();
    if (`${last.path}:${last.line?.side}:${last.line?.line}` === target) {
      console.log('landed:', target);
      return;
    }
    await sleep(100);
  }
  throw new Error('Expected '+target+'; actual '+JSON.stringify(last)+'\n'+screen());
}

try {
  child = pty.spawn(hunk, ['diff', '--agent-notes', ...(installed ? [] : ['--extension', resolve('hunk-thread-navigation.ts')]), '--extension', join(root, 'probe.ts'), '--agent-context', join(root, 'notes.json')], { cwd, env, cols: 140, rows: 42 });
  child.onData(data => term.write(data));
  child.onExit(() => { exited=true; });
  await until(() => screen().includes('First thread'), 'initial review');
  await jump('}', 'a.txt:new:3');
  await jump('}', 'a.txt:old:7');
  await jump('}', 'a.txt:new:16');
  await jump('}', 'b.txt:new:1');
  await jump('}', 'a.txt:new:3');
  await jump('{', 'b.txt:new:1');
  await jump('{', 'a.txt:new:16');
  await jump('{', 'a.txt:old:7');
  await jump('{', 'a.txt:new:3');
  console.log('PASS: forward/backward braces, actual source positions, wrapping, old/new sides, and file crossing');
  const sessions = JSON.parse(await cli(['session', 'list', '--json'])).sessions;
  const session = sessions.find(s => s.cwd===realpathSync(cwd) || s.repoRoot===realpathSync(cwd));
  assert.ok(session);
  const added = JSON.parse(await cli(['session','comment','add',session.sessionId,'--file','a.txt','--new-line','3','--summary','Separate live thread','--author','Codex','--json']));
  await cli(['session','comment','add',session.sessionId,'--reply-to',added.result.commentId,'--summary','Reply must not become a new stop','--json']);
  for (let i=0; i<30; i++) {
    const state = await probe();
    if (state.files.find(f=>f.path==='a.txt').noteCount===5) break;
    await sleep(100);
  }
  await jump('}', 'a.txt:new:3');
  await jump('}', 'a.txt:old:7');
  child.write('r');
  await sleep(600);
  await jump('}', 'a.txt:new:16');
  assert.ok(!screen().includes('key "}" is taken'));
  console.log('PASS: braces land on actual annotated lines, multiple threads in one hunk, old/new sides, file crossing, wrapping, reply grouping, and reload');
} finally {
  child?.kill(); await sleep(300); term.dispose(); rmSync(root, { recursive:true, force:true });
}
