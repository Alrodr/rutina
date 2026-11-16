import { BLOCKS, DIMENSIONS } from './habits.js';
import {
  dayKey, addDays, daysBetween, keyToDate, mondayOf, blockProgress, level, streak, weekPercent,
  sum, semaforo, liveMeasurements, latestTotal, sortedActive, mergeState, habitsCSV, escalaCSV,
  liveDaily, dailyProblems, seguimientoCSV,
} from './logic.js';
import { load, save, savePreImport, getFlag, setFlag } from './store.js';

const BACKUP_DAYS = 14;
const HISTORY_MIN_DAYS = 28;

let state = load();
const ui = {
  tab: 'hoy',
  viewKey: null,        // null = hoy; si no, el día pasado que se edita
  escala: 'list',       // 'list' | 'form' | 'detail'
  problemId: null,
  draftName: '',
  draftScores: [],
  draftDaily: '',
  addingDaily: false,
  showResolved: false,
};

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const overlay = $('#overlay');

// ---------- utilidades ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtWeekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const fmtShort = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fmtStamp = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const today = () => dayKey();
const pad = (n) => String(n).padStart(2, '0');
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function ago(stamp) {
  const n = daysBetween(dayKey(new Date(stamp)), today());
  if (n <= 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n < 14) return `hace ${n} días`;
  if (n < 60) return `hace ${Math.round(n / 7)} semanas`;
  return `hace ${Math.round(n / 30)} meses`;
}

function persist() {
  if (!save(state)) toast('No se ha podido guardar. ¿Queda espacio en el dispositivo?');
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const hasData = () => Object.keys(state.days).length > 0 || state.problems.some((p) => !p.deleted);
function firstDataDay() {
  const keys = Object.keys(state.days);
  for (const p of state.problems) if (!p.deleted) keys.push(p.createdAt.slice(0, 10));
  return keys.sort()[0];
}
function backupDue() {
  if (!hasData()) return false;
  const since = state.lastExportAt ? dayKey(new Date(state.lastExportAt)) : firstDataDay();
  return daysBetween(since, today()) > BACKUP_DAYS;
}

function header(dateText, title) {
  return `<div class="top">
    <div><div class="date">${esc(dateText)}</div><div class="title">${esc(title)}</div></div>
    <button class="menu-btn" data-act="menu" aria-label="Tus datos">⋯${backupDue() ? '<span class="badge"></span>' : ''}</button>
  </div>`;
}

// ---------- pestaña Hoy ----------

function renderHoy() {
  const t = today();
  const key = ui.viewKey && ui.viewKey !== t ? ui.viewKey : t;
  const isPast = key !== t;
  const done = state.days[key] || [];
  const date = keyToDate(key);

  let h = header(cap(fmtLong.format(date)), isPast ? `¿Cómo fue el ${fmtWeekday.format(date)}?` : '¿Cómo va hoy?');
  if (isPast) {
    h += `<div class="past-bar"><span>Estás editando un día pasado</span><button data-act="today">Volver a hoy</button></div>`;
  }
  h += `<div class="north">El estrés viene de las amenazas, la incertidumbre y la sobreexigencia. La ansiedad es proyectarlas al futuro. Hoy, solo hoy.</div>`;

  for (const b of BLOCKS) {
    const p = blockProgress(b, key, done);
    if (!p.total) continue;
    h += `<section class="block"><div class="bh"><b>${b.name}</b><span>${p.done}/${p.total}</span></div>`;
    for (const habit of b.habits.filter((x) => x.since <= key && (!x.until || key <= x.until))) {
      const on = done.includes(habit.id);
      h += `<button class="item ${on ? 'on' : ''}" data-habit="${habit.id}" aria-pressed="${on}">
        <span class="box"></span>
        <span class="lbl">${esc(habit.label)}${habit.hint ? `<span class="hint">${esc(habit.hint)}</span>` : ''}</span>
      </button>`;
    }
    h += `</section>`;
  }

  const dps = dailyProblems(state.problems);
  if (dps.length) {
    const answered = dps.filter((p) => key in p.daily.answers).length;
    h += `<section class="block"><div class="bh"><b>Seguimiento</b><span>${answered}/${dps.length}</span></div>`;
    for (const p of dps) {
      h += `<div class="item yn-row"><span class="lbl">${esc(p.daily.question)}<span class="hint">${esc(p.name)}</span></span>${ynButtons(p.id, key, p.daily.answers[key])}</div>`;
    }
    h += `</section>`;
  }

  // historial
  const first = Object.keys(state.days).sort()[0];
  let start = addDays(t, -(HISTORY_MIN_DAYS - 1));
  if (first && first < start) start = first;
  let cols = '';
  for (let k = start; k <= t; k = addDays(k, 1)) {
    const ids = state.days[k] || [];
    for (const b of BLOCKS) {
      const p = blockProgress(b, k, ids);
      const lv = level(p.done, p.total);
      const cls = `cell${lv ? ` l${lv}` : ''}${k === t ? ' today' : ''}${isPast && k === key ? ' sel' : ''}`;
      cols += `<button class="${cls}" data-day="${k}" aria-label="${b.name}, ${k}: ${p.done} de ${p.total}"></button>`;
    }
    const monday = keyToDate(k).getDay() === 1;
    cols += `<span class="wk">${monday ? esc(fmtShort.format(keyToDate(k)).replace('.', '')) : ''}</span>`;
  }
  const s = streak(BLOCKS, state.days, t);
  const w = weekPercent(BLOCKS, state.days, t);
  h += `<section class="hist">
    <div class="h3">Últimas semanas</div>
    <div class="cap">Más intenso significa que completaste más de ese bloque. Toca un día para editarlo.</div>
    <div class="hgrid" id="hgrid">
      <div class="hname" style="grid-row:1">Mañana</div>
      <div class="hname" style="grid-row:2">Día</div>
      <div class="hname" style="grid-row:3">Noche</div>
      <div class="hscroll" id="hscroll"><div class="hrows">${cols}</div></div>
    </div>
    <div class="legend">menos <i style="background:var(--c0)"></i><i style="background:var(--c1)"></i><i style="background:var(--c2)"></i><i style="background:var(--c3)"></i><i style="background:var(--c4)"></i> más</div>
    <div class="stats">
      ${s > 0
        ? `<div><b>${s}</b><span>${s === 1 ? 'día cuidándote' : 'días seguidos cuidándote'}</span></div>`
        : `<div><b>Hoy</b><span>es un buen día para empezar</span></div>`}
      <div><b>${w}%</b><span>esta semana</span></div>
    </div>
  </section>`;

  view.innerHTML = h;
  sizeHistory();
}

let lastHistScroll = null;
function sizeHistory() {
  const sc = $('#hscroll');
  const grid = $('#hgrid');
  if (!sc || !grid) return;
  const gap = 2.5;
  const cell = Math.max(7, (sc.clientWidth - gap * (HISTORY_MIN_DAYS - 1)) / HISTORY_MIN_DAYS);
  grid.style.setProperty('--cell', `${cell}px`);
  sc.scrollLeft = lastHistScroll ?? sc.scrollWidth;
}

function toggleHabit(id) {
  const t = today();
  const key = ui.viewKey && ui.viewKey !== t ? ui.viewKey : t;
  const set = new Set(state.days[key] || []);
  set.has(id) ? set.delete(id) : set.add(id);
  if (set.size) state.days[key] = [...set];
  else delete state.days[key];
  persist();
  lastHistScroll = $('#hscroll')?.scrollLeft ?? null;
  renderHoy();
  lastHistScroll = null;
}

function ynButtons(pid, key, v) {
  return `<div class="yn">
    <button data-yn="${esc(pid)}" data-k="${key}" data-v="1" class="${v === true ? 'on' : ''}" aria-pressed="${v === true}">Sí</button>
    <button data-yn="${esc(pid)}" data-k="${key}" data-v="0" class="${v === false ? 'on no' : ''}" aria-pressed="${v === false}">No</button>
  </div>`;
}

/** Guarda la respuesta; repetir la misma respuesta la borra. `v` = undefined también la borra. */
function setAnswer(pid, key, v) {
  const p = state.problems.find((x) => x.id === pid);
  const d = p && liveDaily(p);
  if (!d) return;
  if (v === undefined || d.answers[key] === v) delete d.answers[key];
  else d.answers[key] = v;
  touch(p);
  const sc = $('#hscroll')?.scrollLeft;
  lastHistScroll = sc ?? null;
  render();
  lastHistScroll = null;
}

// ---------- pestaña Escala ----------

function spark(problem, big = false) {
  const ms = liveMeasurements(problem);
  if (ms.length < 2) return '';
  const totals = ms.map((m) => sum(m.scores));
  // Escala local para que los cambios se vean, con un margen mínimo de 12 puntos.
  let lo = Math.min(...totals) - 3, hi = Math.max(...totals) + 3;
  if (hi - lo < 12) { const mid = (hi + lo) / 2; lo = mid - 6; hi = mid + 6; }
  const W = 300, H = big ? 90 : 44;
  const y = (t) => ((hi - t) / (hi - lo)) * (H - 8) + 4;
  const pts = totals.map((t, i) => `${(i / (totals.length - 1)) * W},${y(t).toFixed(1)}`).join(' ');
  const guides = big
    ? [20, 40].filter((g) => g > lo && g < hi).map((g) => `<line x1="0" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="var(--muted)" stroke-opacity=".45" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`).join('')
    : '';
  return `<div class="spark ${big ? 'big' : ''}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${guides}
    <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${pts}"/></svg></div>`;
}

function trend(problem) {
  const ms = liveMeasurements(problem);
  if (ms.length < 2) return '';
  const d = sum(ms[ms.length - 1].scores) - sum(ms[0].scores);
  if (d < 0) return `<div class="trend">↓ ${-d} ${-d === 1 ? 'punto' : 'puntos'} desde que empezaste</div>`;
  if (d > 0) return `<div class="trend flat">↑ ${d} ${d === 1 ? 'punto' : 'puntos'} desde que empezaste</div>`;
  return `<div class="trend flat">Igual que al principio</div>`;
}

function card(p) {
  const ms = liveMeasurements(p);
  const t = latestTotal(p);
  const sem = t != null ? semaforo(t) : null;
  return `<button class="prob" data-pid="${esc(p.id)}">
    <div class="ph"><b>${esc(p.name)}</b>${sem ? `<div class="score"><span class="dot ${sem.id}"></span>${t}</div>` : ''}</div>
    <div class="meta">${ms.length} ${ms.length === 1 ? 'medición' : 'mediciones'}${ms.length ? ` · última ${ago(ms[ms.length - 1].at)}` : ''}${p.resolvedAt ? ' · resuelto' : ''}</div>
    ${spark(p)}${trend(p)}
  </button>`;
}

function renderEscalaList() {
  const active = sortedActive(state.problems);
  const resolved = state.problems.filter((p) => !p.deleted && p.resolvedAt);
  let h = header('Del 1 al 10, según cómo te sientes hoy', 'Escala de Impacto');
  h += `<div class="quote">«Escribir un problema es tener el 50% de la solución en tus manos»</div>`;
  if (!active.length) {
    h += `<div class="empty">Cuando algo te preocupe, ponle nombre y puntúa cuánto te afecta.<br>Volver a puntuarlo con el tiempo te dirá si lo que haces funciona.</div>`;
  }
  h += active.map(card).join('');
  h += `<button class="btn" data-act="new">+ Nuevo problema</button>`;
  if (resolved.length) {
    h += `<button class="link" data-act="toggle-resolved">Resueltos (${resolved.length}) ${ui.showResolved ? '⌄' : '›'}</button>`;
    if (ui.showResolved) h += resolved.map(card).join('');
  }
  view.innerHTML = h;
}

function startForm(problemId) {
  const p = state.problems.find((x) => x.id === problemId);
  const ms = p ? liveMeasurements(p) : [];
  ui.escala = 'form';
  ui.problemId = problemId || null;
  ui.draftName = '';
  ui.draftDaily = '';
  ui.draftScores = ms.length ? [...ms[ms.length - 1].scores] : DIMENSIONS.map(() => 5);
  render();
  window.scrollTo(0, 0);
}

function renderForm() {
  const p = state.problems.find((x) => x.id === ui.problemId);
  let h = `<button class="back" data-act="back">‹ Volver</button>`;
  h += `<div class="date">${esc(cap(fmtLong.format(new Date())))}</div><div class="title">¿Cuánto te afecta hoy?</div>`;
  h += p
    ? `<div class="field">${esc(p.name)}</div>`
    : `<input class="field" id="pname" placeholder="Ponle nombre a lo que te preocupa" value="${esc(ui.draftName)}" autocomplete="off" maxlength="120">
       <input class="field small" id="pdaily" placeholder="Pregunta diaria de sí o no (opcional)" value="${esc(ui.draftDaily)}" autocomplete="off" maxlength="120">
       <div class="dq" style="margin:-4px 0 18px">Por ejemplo: «¿He dormido 7 horas?». La responderás cada día en «Hoy».</div>`;
  DIMENSIONS.forEach((d, i) => {
    h += `<div class="dim" data-dim="${i}">
      <div class="dt">${d.label}<span></span></div>
      <div class="dq">${esc(d.q)}</div>
      <div class="nums">${Array.from({ length: 10 }, (_, n) => `<button data-score="${n + 1}">${n + 1}</button>`).join('')}</div>
    </div>`;
  });
  h += `<div class="total">
    <div class="tt"><div class="verdict" id="verdict"></div><b id="tot"></b></div>
    <div class="bar"><div class="mk" id="mk"></div></div>
    <div class="scale"><span>6</span><span>20</span><span>40</span><span>60</span></div>
    <div class="next" id="next"></div>
    <button class="btn" data-act="save" id="saveBtn">Guardar medición</button>
  </div>`;
  view.innerHTML = h;
  updateForm();
}

function updateForm() {
  view.querySelectorAll('.dim').forEach((el) => {
    const v = ui.draftScores[+el.dataset.dim];
    el.querySelector('.dt span').textContent = v;
    el.querySelectorAll('[data-score]').forEach((b) => b.classList.toggle('on', +b.dataset.score === v));
  });
  const t = sum(ui.draftScores);
  const sem = semaforo(t);
  $('#tot').textContent = t;
  $('#mk').style.left = `calc(${((t - 6) / 54) * 100}% - 2px)`;
  $('#verdict').innerHTML = `<span class="dot ${sem.id}"></span>${sem.label}`;
  $('#next').textContent = sem.next;
  $('#saveBtn').disabled = !ui.problemId && !ui.draftName.trim();
}

function saveMeasurement() {
  const stamp = nowStamp();
  let p = state.problems.find((x) => x.id === ui.problemId);
  if (!p) {
    const name = ui.draftName.trim();
    if (!name) return;
    p = { id: uid('p'), name, createdAt: stamp, updatedAt: stamp, resolvedAt: null, deleted: false, measurements: [] };
    const q = ui.draftDaily.trim();
    if (q) p.daily = { question: q, createdAt: stamp, answers: {} };
    state.problems.push(p);
  }
  p.measurements.push({ id: uid('m'), at: stamp, scores: [...ui.draftScores] });
  p.updatedAt = stamp;
  persist();
  toast('Medición guardada');
  ui.escala = 'list';
  render();
  window.scrollTo(0, 0);
}

function renderDetail() {
  const p = state.problems.find((x) => x.id === ui.problemId && !x.deleted);
  if (!p) { ui.escala = 'list'; return renderEscalaList(); }
  const ms = liveMeasurements(p);
  const t = latestTotal(p);
  const sem = t != null ? semaforo(t) : null;
  let h = `<button class="back" data-act="back">‹ Volver</button>`;
  h += `<input class="field" id="rename" value="${esc(p.name)}" maxlength="120" aria-label="Nombre del problema">`;
  if (sem) {
    h += `<div class="tt"><div class="verdict"><span class="dot ${sem.id}"></span>${sem.label}</div><b style="font-family:var(--head);font-size:30px">${t}</b></div>`;
    h += `<div class="next">${sem.next}</div>`;
  }
  h += spark(p, true) + trend(p);
  if (!p.resolvedAt) h += `<button class="btn" data-act="rate">Puntuar de nuevo</button>`;
  if (ms.length) {
    h += `<div class="mlist">${[...ms].reverse().map((m) => {
      const mt = sum(m.scores);
      return `<div class="mrow"><span class="d">${esc(fmtStamp.format(new Date(m.at)))}</span>
        <span class="dot ${semaforo(mt).id}"></span><b>${mt}</b>
        <button class="x" data-act="del-m" data-mid="${esc(m.id)}" aria-label="Borrar medición">×</button></div>`;
    }).join('')}</div>`;
  }
  h += dailySection(p);
  h += p.resolvedAt
    ? `<button class="btn ghost" data-act="reopen">Volver a activos</button>`
    : `<button class="btn ghost" data-act="resolve">Marcar como resuelto</button>`;
  h += `<button class="btn danger" data-act="del-p">Borrar problema</button>`;
  view.innerHTML = h;
}

function dailySection(p) {
  const d = liveDaily(p);
  if (!d) {
    if (p.resolvedAt) return '';
    return ui.addingDaily
      ? `<div class="daily"><div class="h3">Pregunta diaria</div>
          <input class="field small" id="newdaily" placeholder="Por ejemplo: ¿He dormido 7 horas?" maxlength="120" autocomplete="off">
          <button class="btn" data-act="save-daily">Añadir</button></div>`
      : `<button class="btn ghost" data-act="add-daily">+ Añadir pregunta diaria (sí / no)</button>`;
  }
  const t = today();
  const start = addDays(mondayOf(t), -21);
  let cells = '', si = 0, no = 0;
  for (let i = 0; i < 28; i++) {
    const k = addDays(start, i);
    const v = d.answers[k];
    if (k <= t && v === true) si++;
    if (k <= t && v === false) no++;
    const cls = `yc${v === true ? ' si' : v === false ? ' no' : ''}${k === t ? ' today' : ''}`;
    cells += `<button class="${cls}" data-ycell="${k}" ${k > t ? 'disabled' : ''} aria-label="${k}: ${v === true ? 'sí' : v === false ? 'no' : 'sin respuesta'}"></button>`;
  }
  return `<div class="daily">
    <div class="h3">Pregunta diaria</div>
    <input class="field small" id="dquestion" value="${esc(d.question)}" maxlength="120" aria-label="Pregunta diaria">
    <div class="yn-today"><span>Hoy</span>${ynButtons(p.id, t, d.answers[t])}</div>
    <div class="ycal">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((x) => `<span class="yh">${x}</span>`).join('')}${cells}</div>
    <div class="cap"><i class="sw si"></i> Sí ${si} · <i class="sw no"></i> No ${no} en las últimas 4 semanas. Toca un día para cambiarlo.</div>
    <button class="link" data-act="del-daily">Quitar pregunta diaria</button>
  </div>`;
}

function touch(p) { p.updatedAt = nowStamp(); persist(); }

// ---------- hojas: menú, confirmación, instalación ----------

function closeSheet() { overlay.innerHTML = ''; }

function sheet(inner) {
  overlay.innerHTML = `<div class="scrim" data-act="close"><div class="sheet" role="dialog">${inner}</div></div>`;
}

function confirmSheet({ title, text, ok, danger = false }) {
  return new Promise((resolve) => {
    sheet(`<h3>${esc(title)}</h3><p>${esc(text)}</p>
      <button class="btn ${danger ? 'danger' : ''}" id="cOk">${esc(ok)}</button>
      <button class="btn ghost" id="cNo">Cancelar</button>`);
    $('#cOk').onclick = () => { closeSheet(); resolve(true); };
    $('#cNo').onclick = () => { closeSheet(); resolve(false); };
  });
}

function openMenu() {
  const last = state.lastExportAt ? `Última copia enviada ${ago(state.lastExportAt)}.` : 'Aún no has enviado ninguna copia.';
  sheet(`<h3>Tus datos</h3>
    <p>Los datos solo se guardan en este dispositivo. Envíatelos por correo de vez en cuando para no perderlos.</p>
    <button class="opt" data-act="share">Enviar por correo<small>Hábitos, Escala y seguimiento en CSV, más una copia completa en JSON</small></button>
    <button class="opt" data-act="download">Descargar copia<small>Archivo JSON para restaurar los datos</small></button>
    <button class="opt" data-act="import">Importar copia<small>Se suma a lo que ya tienes; no se borra nada</small></button>
    <div class="note ${backupDue() ? 'warn' : ''}">${last}</div>`);
}

function exportFiles() {
  const t = today();
  return [
    new File([habitsCSV(BLOCKS, state.days)], `rutina-habitos-${t}.csv`, { type: 'text/csv' }),
    new File([escalaCSV(DIMENSIONS, state.problems)], `rutina-escala-${t}.csv`, { type: 'text/csv' }),
    new File([seguimientoCSV(state.problems)], `rutina-seguimiento-${t}.csv`, { type: 'text/csv' }),
    backupFile(),
  ];
}
const backupFile = () => new File([JSON.stringify(state, null, 2)], `rutina-backup-${today()}.json`, { type: 'application/json' });

function download(files) {
  files.forEach((f, i) => setTimeout(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }, i * 400));
}

function markExported() {
  state.lastExportAt = new Date().toISOString();
  persist();
}

async function shareByEmail() {
  const files = exportFiles();
  const subject = `Rutina · datos hasta ${today()}`;
  closeSheet();
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: subject, text: subject });
      markExported();
      toast('Datos enviados');
    } catch (e) {
      if (e.name !== 'AbortError') { console.error('[rutina] share', e); download(files); markExported(); toast('No se pudo compartir; se han descargado los archivos'); }
    }
  } else {
    download(files);
    markExported();
    toast('Archivos descargados');
  }
  render();
}

async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || typeof data.days !== 'object' || !Array.isArray(data.problems)) {
      throw new Error('formato');
    }
    savePreImport(state);
    state = mergeState(state, data);
    persist();
    render();
    toast('Copia importada. No se ha borrado nada.');
  } catch (e) {
    console.error('[rutina] import', e);
    toast('Ese archivo no parece una copia de Rutina');
  }
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function maybeShowInstall() {
  if (!isIOS() || isStandalone() || getFlag('seguir-en-navegador')) return;
  overlay.innerHTML = `<div class="install"><div class="inner">
    <div class="title">Instala Rutina en tu iPhone</div>
    <p class="cap" style="font-size:14px">Así se abre como una app, funciona sin conexión y tus datos se guardan en un solo sitio. En iPhone, lo que marques en Safari no pasa a la app instalada, por eso conviene instalarla antes de empezar.</p>
    <ol>
      <li>Toca el botón <b>Compartir</b> <span class="share-ico"></span> de Safari.</li>
      <li>Elige <b>«Añadir a pantalla de inicio»</b>.</li>
      <li>Abre <b>Rutina</b> desde el icono nuevo.</li>
    </ol>
    <button class="link" data-act="skip-install">Seguir en el navegador</button>
  </div></div>`;
}

// ---------- render y eventos ----------

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  if (ui.tab === 'hoy') return renderHoy();
  if (ui.escala === 'form') return renderForm();
  if (ui.escala === 'detail') return renderDetail();
  return renderEscalaList();
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (ui.tab === b.dataset.tab) {
    ui.viewKey = null;
    ui.escala = 'list';
  }
  ui.tab = b.dataset.tab;
  render();
  window.scrollTo(0, 0);
});

view.addEventListener('click', async (e) => {
  const habit = e.target.closest('[data-habit]');
  if (habit) return toggleHabit(habit.dataset.habit);

  const yn = e.target.closest('[data-yn]');
  if (yn) return setAnswer(yn.dataset.yn, yn.dataset.k, yn.dataset.v === '1');

  const ycell = e.target.closest('[data-ycell]');
  if (ycell) {
    const p = state.problems.find((x) => x.id === ui.problemId);
    const cur = liveDaily(p)?.answers[ycell.dataset.ycell];
    return setAnswer(ui.problemId, ycell.dataset.ycell, cur === undefined ? true : cur === true ? false : undefined);
  }

  const day = e.target.closest('[data-day]');
  if (day) {
    ui.viewKey = day.dataset.day === today() ? null : day.dataset.day;
    lastHistScroll = $('#hscroll')?.scrollLeft ?? null;
    renderHoy();
    lastHistScroll = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const score = e.target.closest('[data-score]');
  if (score) {
    ui.draftScores[+score.closest('.dim').dataset.dim] = +score.dataset.score;
    return updateForm();
  }

  const card = e.target.closest('[data-pid]');
  if (card) {
    ui.escala = 'detail';
    ui.problemId = card.dataset.pid;
    ui.addingDaily = false;
    render();
    window.scrollTo(0, 0);
    return;
  }

  const act = e.target.closest('[data-act]')?.dataset.act;
  const p = state.problems.find((x) => x.id === ui.problemId);
  switch (act) {
    case 'menu': return openMenu();
    case 'today': ui.viewKey = null; return render();
    case 'new': return startForm(null);
    case 'rate': return startForm(ui.problemId);
    case 'save': return saveMeasurement();
    case 'toggle-resolved': ui.showResolved = !ui.showResolved; return render();
    case 'back':
      ui.escala = ui.escala === 'form' && ui.problemId ? 'detail' : 'list';
      render();
      return window.scrollTo(0, 0);
    case 'resolve': p.resolvedAt = nowStamp(); touch(p); toast('Marcado como resuelto'); ui.escala = 'list'; return render();
    case 'reopen': p.resolvedAt = null; touch(p); return render();
    case 'del-m': {
      const ok = await confirmSheet({ title: '¿Borrar esta medición?', text: 'Desaparecerá de la evolución del problema.', ok: 'Borrar medición', danger: true });
      if (!ok) return;
      const m = p.measurements.find((x) => x.id === e.target.closest('[data-mid]').dataset.mid);
      m.deleted = true;
      touch(p);
      return render();
    }
    case 'add-daily':
      ui.addingDaily = true;
      render();
      return $('#newdaily')?.focus();
    case 'save-daily': {
      const q = $('#newdaily')?.value.trim();
      if (!q) return $('#newdaily')?.focus();
      p.daily = { question: q, createdAt: nowStamp(), answers: {} };
      ui.addingDaily = false;
      touch(p);
      toast('Pregunta añadida; la verás cada día en «Hoy»');
      return render();
    }
    case 'del-daily': {
      const ok = await confirmSheet({ title: '¿Quitar la pregunta diaria?', text: 'Se dejarán de mostrar la pregunta y sus respuestas.', ok: 'Quitar', danger: true });
      if (!ok) return;
      p.daily = { ...p.daily, deleted: true };
      touch(p);
      return render();
    }
    case 'del-p': {
      const ok = await confirmSheet({ title: '¿Borrar este problema?', text: 'Se borrará con todas sus mediciones. Si ya no te afecta, también puedes marcarlo como resuelto.', ok: 'Borrar problema', danger: true });
      if (!ok) return;
      p.deleted = true;
      touch(p);
      ui.escala = 'list';
      return render();
    }
  }
});

view.addEventListener('input', (e) => {
  if (e.target.id === 'pdaily') ui.draftDaily = e.target.value;
  if (e.target.id === 'pname') {
    ui.draftName = e.target.value;
    $('#saveBtn').disabled = !ui.draftName.trim();
  }
});

view.addEventListener('change', (e) => {
  if (e.target.id === 'dquestion') {
    const p = state.problems.find((x) => x.id === ui.problemId);
    const d = p && liveDaily(p);
    const q = e.target.value.trim();
    if (d && q && q !== d.question) { d.question = q; touch(p); toast('Pregunta cambiada'); }
    else if (d) e.target.value = d.question;
    return;
  }
  if (e.target.id === 'rename') {
    const p = state.problems.find((x) => x.id === ui.problemId);
    const name = e.target.value.trim();
    if (p && name && name !== p.name) { p.name = name; touch(p); toast('Nombre cambiado'); }
    else if (p) e.target.value = p.name;
  }
});

overlay.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (e.target.classList.contains('scrim')) return closeSheet();
  switch (act) {
    case 'share': return shareByEmail();
    case 'download': closeSheet(); download([backupFile()]); markExported(); toast('Copia descargada'); return render();
    case 'import': closeSheet(); return $('#importFile').click();
    case 'skip-install': setFlag('seguir-en-navegador', '1'); return closeSheet();
  }
});

$('#importFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) importFile(f);
});

// Al volver a la app (p. ej. al día siguiente), refrescar "hoy".
let shownDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== shownDay) {
    shownDay = today();
    ui.viewKey = null;
    render();
  }
});
addEventListener('resize', () => { if (ui.tab === 'hoy') sizeHistory(); });

// ---------- arranque ----------

render();
maybeShowInstall();
if (isStandalone() && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.error('[rutina] sw', e));
}
