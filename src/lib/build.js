'use strict';
/* Front-end build. The sources in public/ stay the files everyone edits; this writes public/dist/: one minified app
   bundle (the JS list below, in order), one minified CSS, an optional d3 build with only the modules the map uses,
   all with content-hashed names (safe to serve with a long cache), and dist/index.html pointing at them. The xterm
   tags are dropped from the built page: the terminal code loads xterm the first time a terminal opens.
   esbuild is an optional devDependency. Without it (or when a build fails) ensureBuilt() returns null and the server
   serves the plain sources, so the hub works with no build step at all.
   ensureBuilt() is cheap when nothing changed (mtime check) and rebuilds when a source did, so an edit to
   public/app.js shows on the next page load. `node src/lib/build.js` forces a build. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const JS = ['chat-clean.js', 'app.js', 'tasks-ui.js', 'agents-ui.js', 'jobs-ui.js'], CSS = ['app.css', 'tasks.css', 'agents.css', 'jobs.css'];
const D3 = `export { select, selectAll } from 'd3-selection'; import 'd3-transition';
export { hsl } from 'd3-color'; export { zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
export { min, max, mean } from 'd3-array'; export { line, arc, curveCatmullRomClosed } from 'd3-shape';
export { forceSimulation, forceRadial, forceManyBody, forceLink, forceCollide } from 'd3-force';
export { easeCubicOut, easeCubicIn } from 'd3-ease'; export { drag } from 'd3-drag';`;
const D3_VENDOR = 'vendor/d3.min.js', XTERM = ['vendor/xterm.js'], XTERM_CSS = ['vendor/xterm.css'];
const stamps = new Map();

const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function loadEsbuild() { try { return require('esbuild'); } catch { return null; } }
const dirs = (pub = path.join(ROOT, 'public')) => ({ pub, out: path.join(pub, 'dist') });
const present = (pub, list) => list.filter(f => fs.existsSync(path.join(pub, f)));

/** Replaces the tags for `files` in html: the first one becomes `repl` (or nothing), the rest are removed. */
function swapTags(html, files, tag, repl) {
  let first = true;
  for (const f of files) {
    const re = new RegExp(tag(esc(f)) + '[ \\t]*\\n?');
    if (!re.test(html)) continue;
    html = html.replace(re, first && repl ? repl + '\n' : '');
    first = false;
  }
  return { html, found: !first };
}
const cssTag = f => `<link rel="stylesheet" href="${f}">`;
const jsTag = f => `<script src="${f}"></script>`;

/** Build into public/dist. opts.pub: another public dir; opts.esbuild: an esbuild-compatible object, or false.
    Throws when esbuild is missing or a step fails. */
function build(opts = {}) {
  const esbuild = opts.esbuild === undefined ? loadEsbuild() : opts.esbuild;   // false = act as if not installed
  if (!esbuild) throw new Error('esbuild is not installed (optional devDependency); serving sources');
  const { pub, out } = dirs(opts.pub);
  fs.mkdirSync(out, { recursive: true });
  const js = present(pub, JS), css = present(pub, CSS);
  if (!js.length) throw new Error('no front-end sources found in ' + path.basename(pub));
  const put = (name, code) => { const ext = path.extname(name), file = `${path.basename(name, ext)}.${hash(code)}${ext}`; fs.writeFileSync(path.join(out, file), code); return file; };
  const files = {};
  files.app = put('app.js', esbuild.transformSync(js.map(f => fs.readFileSync(path.join(pub, f), 'utf8')).join('\n;\n'), { loader: 'js', minify: true, target: 'es2020' }).code);
  if (css.length) files.css = put('app.css', esbuild.transformSync(css.map(f => fs.readFileSync(path.join(pub, f), 'utf8')).join('\n'), { loader: 'css', minify: true }).code);
  // the slim d3 build needs the d3-* packages; without them the page keeps the vendored full d3
  try { files.d3 = put('d3.js', esbuild.buildSync({ stdin: { contents: D3, resolveDir: ROOT }, bundle: true, format: 'iife', globalName: 'd3', minify: true, write: false, logLevel: 'silent' }).outputFiles[0].text); } catch {}
  let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  html = swapTags(html, XTERM_CSS, cssTag, '').html;
  html = swapTags(html, css, cssTag, files.css && cssTag('dist/' + files.css)).html;
  const scripts = [...(files.d3 ? [D3_VENDOR] : []), ...XTERM, ...js];
  const head = (files.d3 ? jsTag('dist/' + files.d3) + '\n' : '') + jsTag('dist/' + files.app);
  html = swapTags(html, scripts, jsTag, head).html;
  if (!html.includes('dist/' + files.app) || (files.css && !html.includes('dist/' + files.css))) throw new Error('index.html tags changed; update build.js');
  fs.writeFileSync(path.join(out, 'index.html'), html);
  // keep only this build and the one before it (a page still open on the old one can finish loading); everything
  // else in dist/ is an older generated file
  const keep = new Set(['index.html', 'build.json', ...Object.values(files)]), prev = readJSON(path.join(out, 'build.json'));
  if (prev && prev.files) Object.values(prev.files).forEach(f => keep.add(f));
  for (const f of fs.readdirSync(out)) if (!keep.has(f)) fs.unlinkSync(path.join(out, f));
  const info = { at: Date.now(), files, sizes: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, fs.statSync(path.join(out, f)).size])) };
  fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify(info));
  return info;
}

/** Rebuild if any source is newer than the last build. Returns the dist index path, or null to serve the sources. */
function ensureBuilt(opts = {}) {
  const { pub, out } = dirs(opts.pub), key = pub;
  try {
    if (!(opts.esbuild === undefined ? loadEsbuild() : opts.esbuild)) return null;
    const src = [...present(pub, JS), ...present(pub, CSS), 'index.html'].map(f => path.join(pub, f)).concat(__filename);
    const m = Math.max(...src.map(f => fs.statSync(f).mtimeMs));
    if (stamps.has(key) && m <= stamps.get(key)) return path.join(out, 'index.html');
    const info = readJSON(path.join(out, 'build.json'));
    if (!(info && info.at >= m && fs.existsSync(path.join(out, 'index.html')))) build(opts);
    stamps.set(key, m);
    return path.join(out, 'index.html');
  } catch (e) { if (!opts.quiet) console.error('[build] failed, serving sources:', e.message); stamps.delete(key); return null; }
}

module.exports = { build, ensureBuilt, swapTags, JS, CSS, ROOT };
if (require.main === module) console.log(JSON.stringify(build(), null, 1));
