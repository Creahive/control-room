'use strict';
/* Host load and the governor. A sampler reads CPU, memory, swap, disk and load every 5 s (the map's corner widget).
 * Under pressure the governor lowers the number of `heavy --` slots and, if sleepIdleMin is set, puts agents that sat
 * idle that long to sleep (their Claude process ends; the next message relaunches the same session). Tuned by the
 * core count of the machine it runs on, or by config.governor. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { now, writeJSON } = require('./util');

module.exports = function governor(hub) {
  const { cfg, tree } = hub;
  const g = cfg.governor || {};
  const cores = os.cpus().length || 1;
  const maxHeavy = g.maxHeavy > 0 ? g.maxHeavy : Math.max(1, Math.floor(cores / 4));
  const LIVE_F = path.join(cfg.dataDir, 'governor-live.json');
  let stat = {}, seen = 0, prev = null;
  const state = { pressure: false, since: 0, why: '', hits: 0 };
  const idleSince = {};

  function sample() {
    try {
      const la = os.loadavg(), total = os.totalmem(), free = os.freemem();
      let cpu = null, swap = { used: 0, total: 0, p: 0 }, memAvail = free;
      try {
        const a = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
        const c = { idle: a[3] + a[4], all: a.reduce((x, y) => x + y, 0) };
        cpu = prev ? Math.round(100 * (1 - (c.idle - prev.idle) / Math.max(1, c.all - prev.all))) : null; prev = c;
        const mi = Object.fromEntries(fs.readFileSync('/proc/meminfo', 'utf8').split('\n').filter(Boolean).map(l => { const [k, v] = l.split(':'); return [k, parseInt(v) * 1024]; }));
        memAvail = mi.MemAvailable || free;
        swap = { used: mi.SwapTotal - mi.SwapFree, total: mi.SwapTotal, p: mi.SwapTotal ? Math.round(100 * (mi.SwapTotal - mi.SwapFree) / mi.SwapTotal) : 0 };
      } catch {}
      let disk = null; try { const d = fs.statfsSync(cfg.dataDir); disk = { used: (d.blocks - d.bavail) * d.bsize, total: d.blocks * d.bsize }; disk.p = Math.round(100 * disk.used / disk.total); } catch {}
      const memP = Math.round(100 * (total - memAvail) / total), loadP = Math.round(100 * la[0] / cores);
      const level = (cpu >= 95 && loadP >= 150) || swap.p >= 95 || (disk && disk.p >= 95) ? 'bad' : (cpu >= 80 || loadP >= 100 || swap.p >= 80 || memP >= (g.memHighPct || 90)) ? 'warn' : 'ok';
      stat = { at: now(), cpu, cores, load: la.map(x => Math.round(x * 10) / 10), loadP, mem: { used: total - memAvail, total, p: memP }, swap, disk, uptime: Math.round(os.uptime()), level, gov: { ...state, slots: slots() } };
    } catch {}
  }
  const slots = () => (state.pressure ? 1 : maxHeavy);

  function pressureTick() {
    if (!stat.at) return;
    const loadX = stat.load[0] / cores;
    const hot = loadX >= (g.loadHigh || 1.5) || stat.mem.p >= (g.memHighPct || 90);
    const calm = loadX < (g.loadHigh || 1.5) * 0.66 && stat.mem.p < (g.memHighPct || 90) - 10;
    const why = `load ${stat.load[0]}/${cores} cores, RAM ${stat.mem.p}% used, swap ${stat.swap.p}%`;
    if (!state.pressure) {
      state.hits = hot ? state.hits + 1 : 0;
      if (state.hits >= 2) { state.pressure = true; state.since = now(); state.why = why; hub.logEvent({ type: 'care', from: 'hub', to: 'brain', text: `governor: pressure ON (${why})` }); }
    } else if (calm) { state.pressure = false; state.hits = 0; hub.logEvent({ type: 'care', from: 'hub', to: 'brain', text: `governor: pressure off (${why})` }); }
    try { writeJSON(LIVE_F, { slots: slots(), pressure: state.pressure, why: state.pressure ? state.why : 'calm', at: now() }); } catch {}
  }

  const neverSleeps = n => n.role === 'front' || n.role === 'brain' || /^desk-/.test(n.id);
  function sleepNode(n, why) {
    const st = hub.statusOf(n); if (!st.pid) return false;
    n.asleep = { at: now(), why }; hub.saveTree();
    hub.logEvent({ type: 'care', from: 'hub', to: n.id, text: 'asleep: ' + why + ' (the next message wakes it)' });
    try { process.kill(st.pid, 'SIGTERM'); } catch {}
    return true;
  }
  function wakeNode(n, why) {
    if (!n.asleep || n.stopped) return;
    delete n.asleep;
    if (hub.demo) { hub.saveTree(); return; }
    if (hub.tmux.paneAlive(n.pane) && hub.tmux.paneCmd(n.pane) !== 'claude') hub.tmux.runLine(n.pane, hub.launchCmd(n, n.sessionId));
    else hub.launch(n, n.sessionId);
    hub.saveTree();
    hub.logEvent({ type: 'care', from: 'hub', to: n.id, text: 'woke up: ' + why });
  }
  function sleepTick() {
    if (!(g.sleepIdleMin > 0) || hub.demo) return;
    for (const n of Object.values(tree.nodes)) {
      if (n.stopped || n.asleep || neverSleeps(n)) { delete idleSince[n.id]; continue; }
      const st = hub.statusOf(n).state;
      if (st !== 'idle' || (hub.pending[n.id] || []).length) { delete idleSince[n.id]; continue; }
      idleSince[n.id] = idleSince[n.id] || now();
      if (state.pressure && now() - idleSince[n.id] > g.sleepIdleMin * 60000) { sleepNode(n, `idle ${g.sleepIdleMin}+ min while the machine is loaded`); delete idleSince[n.id]; }
    }
  }

  /** `heavy --` jobs: bin/heavy keeps one file per job in <dataDir>/heavy/<pid>.json while it waits or runs. */
  function heavyJobs() {
    const dir = path.join(cfg.dataDir, 'heavy'), out = [];
    let files = []; try { files = fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f)); } catch {}
    for (const f of files) {
      let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
      try { process.kill(j.pid, 0); } catch (e) { if (e.code !== 'EPERM') continue; }
      out.push({ pid: j.pid, cmd: String(j.cmd || '').slice(0, 200), state: j.state, at: j.at, agent: j.agent || null });
    }
    return out.sort((a, b) => a.at - b.at);
  }

  sample();
  setInterval(() => { sample(); pressureTick(); try { sleepTick(); } catch (e) { console.error('[governor]', e.message); } }, 5000).unref();
  Object.assign(hub, { heavyJobs, serverStat: () => { seen = now(); return stat; }, sleepNode, wakeNode, govState: () => ({ ...state, slots: slots(), maxHeavy, cores, sleepIdleMin: g.sleepIdleMin || 0 }) });
  void seen;
};
