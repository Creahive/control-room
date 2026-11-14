'use strict';
/* build.js against a throwaway public dir and a stand-in for esbuild (identity "minify"), so the test needs no
   devDependency: tag rewriting, hashed names, cleanup of old builds, and the no-esbuild fallback. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const B = require('../src/lib/build');
const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
const w = (f, s) => fs.writeFileSync(path.join(pub, f), s);
w('chat-clean.js', 'var a=1;'); w('app.js', 'var b=2;'); w('tasks-ui.js', 'var c=3;');
w('app.css', 'body{color:red}'); w('tasks.css', 'p{margin:0}');
w('index.html', [
  '<head>', '<link rel="stylesheet" href="vendor/xterm.css">', '<link rel="stylesheet" href="app.css">', '<link rel="stylesheet" href="tasks.css">', '</head>',
  '<body>', '<script src="vendor/d3.min.js"></script>', '<script src="vendor/xterm.js"></script>', '<script src="chat-clean.js"></script>',
  '<script src="app.js"></script>', '<script src="tasks-ui.js"></script>', '</body>', ''].join('\n'));
let d3ok = false;
const fake = {
  transformSync: (code) => ({ code }),
  buildSync: () => { if (!d3ok) throw new Error('no d3 packages'); return { outputFiles: [{ text: 'var d3={};' }] }; },
};

// without esbuild: build throws, ensureBuilt serves the sources
assert.throws(() => B.build({ pub, esbuild: false }), /not installed/);
assert.strictEqual(B.ensureBuilt({ pub, esbuild: false, quiet: true }), null);
assert.ok(!fs.existsSync(path.join(pub, 'dist')));

// with esbuild but no d3 packages: the vendored d3 tag stays, xterm tags go, sources are bundled in order
let info = B.build({ pub, esbuild: fake });
const out = path.join(pub, 'dist'), html = () => fs.readFileSync(path.join(out, 'index.html'), 'utf8');
assert.ok(!info.files.d3 && /^app\.[0-9a-f]{10}\.js$/.test(info.files.app) && /^app\.[0-9a-f]{10}\.css$/.test(info.files.css));
assert.strictEqual(fs.readFileSync(path.join(out, info.files.app), 'utf8'), 'var a=1;\n;\nvar b=2;\n;\nvar c=3;');
let h = html();
assert.ok(h.includes('<script src="vendor/d3.min.js"></script>\n<script src="dist/' + info.files.app + '"></script>\n</body>'), h);
assert.ok(h.includes('<link rel="stylesheet" href="dist/' + info.files.css + '">\n</head>') && !/xterm|chat-clean\.js|tasks\.css/.test(h), h);

// with d3: one d3 bundle replaces the vendored one; the build before stays, older ones are removed
d3ok = true; const first = info.files.app;
w('app.js', 'var b=22;');
info = B.build({ pub, esbuild: fake });
h = html();
assert.ok(info.files.d3 && h.includes(`<script src="dist/${info.files.d3}"></script>\n<script src="dist/${info.files.app}"></script>`) && !h.includes('vendor/d3'), h);
assert.ok(fs.existsSync(path.join(out, first)), 'previous build kept');
w('app.js', 'var b=222;'); const second = info.files.app;
info = B.build({ pub, esbuild: fake });
assert.ok(!fs.existsSync(path.join(out, first)) && fs.existsSync(path.join(out, second)), 'only the last two builds stay');
const meta = JSON.parse(fs.readFileSync(path.join(out, 'build.json'), 'utf8'));
assert.deepStrictEqual(meta.files, info.files); assert.ok(meta.sizes.app > 0);

// ensureBuilt: returns the dist page, rebuilds only when a source changed
assert.strictEqual(B.ensureBuilt({ pub, esbuild: fake }), path.join(out, 'index.html'));
const before = meta.at;
assert.strictEqual(B.ensureBuilt({ pub, esbuild: fake }), path.join(out, 'index.html'));
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(out, 'build.json'), 'utf8')).at, before, 'no rebuild without a change');
const later = new Date(Date.now() + 5000); w('tasks.css', 'p{margin:1px}'); fs.utimesSync(path.join(pub, 'tasks.css'), later, later);
B.ensureBuilt({ pub, esbuild: fake });
assert.ok(fs.readFileSync(path.join(out, JSON.parse(fs.readFileSync(path.join(out, 'build.json'), 'utf8')).files.css), 'utf8').includes('1px'), 'rebuilt after an edit');
// a changed page layout is caught instead of shipping a page without the bundle
w('index.html', '<body>no tags</body>');
assert.throws(() => B.build({ pub, esbuild: fake }), /index\.html tags changed/);
assert.deepStrictEqual(B.swapTags('a\n<x>1</x>\n<x>2</x>\nb', ['1', '2'], f => `<x>${f}</x>`, 'Z'), { html: 'a\nZ\nb', found: true });
fs.rmSync(pub, { recursive: true });
console.log('build ok');
