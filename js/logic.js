// Funciones puras: sin DOM ni almacenamiento, para poder probarlas con node --test.

export const DAY_CUTOFF_HOUR = 4;

const pad = (n) => String(n).padStart(2, '0');

/** Clave AAAA-MM-DD del "día de rutina": antes de las 4:00 cuenta como el día anterior. */
export function dayKey(date = new Date(), cutoffHour = DAY_CUTOFF_HOUR) {
  const d = new Date(date.getTime());
  d.setHours(d.getHours() - cutoffHour);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(a, b) {
  return Math.round((keyToDate(b) - keyToDate(a)) / 86400000);
}

/** Lunes de la semana de `key`. */
export function mondayOf(key) {
  const dow = (keyToDate(key).getDay() + 6) % 7; // 0 = lunes
  return addDays(key, -dow);
}

export function activeHabits(block, key) {
  return block.habits.filter((h) => h.since <= key && (!h.until || key <= h.until));
}

export function blockProgress(block, key, doneIds = []) {
  const active = activeHabits(block, key);
  const done = active.filter((h) => doneIds.includes(h.id)).length;
  return { done, total: active.length };
}

/** Nivel 0–4 para la intensidad de la celda. */
export function level(done, total) {
  if (!total || !done) return 0;
  return Math.min(4, Math.max(1, Math.ceil((done / total) * 4)));
}

export function dayProgress(blocks, key, doneIds = []) {
  return blocks.reduce((acc, b) => {
    const p = blockProgress(b, key, doneIds);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
}

function goodDay(blocks, key, days) {
  const p = dayProgress(blocks, key, days[key] || []);
  return p.total > 0 && p.done * 2 >= p.total;
}

/** Días seguidos con al menos la mitad de los hábitos. Hoy cuenta solo si ya llega. */
export function streak(blocks, days, today) {
  let key = goodDay(blocks, today, days) ? today : addDays(today, -1);
  let n = 0;
  while (goodDay(blocks, key, days)) {
    n++;
    key = addDays(key, -1);
  }
  return n;
}

/** Porcentaje de hábitos hechos desde el lunes hasta hoy (incluido). */
export function weekPercent(blocks, days, today) {
  let done = 0, total = 0;
  for (let k = mondayOf(today); k <= today; k = addDays(k, 1)) {
    const p = dayProgress(blocks, k, days[k] || []);
    done += p.done;
    total += p.total;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

// ---------- Escala de Impacto ----------

export const sum = (scores) => scores.reduce((a, b) => a + b, 0);

export function semaforo(total) {
  if (total <= 20) return { id: 'verde', label: 'Poco impacto', next: 'Puedes dejarlo en segundo plano.' };
  if (total <= 40) return { id: 'amarillo', label: 'Impacto moderado', next: 'Es momento de priorizar su resolución.' };
  return { id: 'rojo', label: 'Gran impacto', next: 'Priorízalo por encima de todo lo demás.' };
}

export function liveMeasurements(problem) {
  return problem.measurements
    .filter((m) => !m.deleted)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function latestTotal(problem) {
  const ms = liveMeasurements(problem);
  return ms.length ? sum(ms[ms.length - 1].scores) : null;
}

/** Pregunta diaria de sí/no del problema, si tiene una activa. */
export const liveDaily = (problem) => (problem.daily && !problem.daily.deleted ? problem.daily : null);

/** Problemas activos con pregunta diaria, para responderla en «Hoy». */
export const dailyProblems = (problems) =>
  problems.filter((p) => !p.deleted && !p.resolvedAt && liveDaily(p));

/** Problemas activos ordenados por la última puntuación, de mayor a menor. */
export function sortedActive(problems) {
  return problems
    .filter((p) => !p.deleted && !p.resolvedAt)
    .sort((a, b) => (latestTotal(b) ?? -1) - (latestTotal(a) ?? -1));
}

// ---------- Fusión (importar) ----------

export function emptyState() {
  return { version: 1, lastExportAt: null, days: {}, problems: [] };
}

const newer = (a, b) => ((a.updatedAt || '') >= (b.updatedAt || '') ? a : b);

/** Fusiona dos estados sin perder nada: une días y mediciones; gana el problema editado más tarde. */
export function mergeState(a, b) {
  const out = emptyState();
  out.lastExportAt = [a.lastExportAt, b.lastExportAt].filter(Boolean).sort().pop() || null;

  for (const src of [a.days || {}, b.days || {}]) {
    for (const [k, ids] of Object.entries(src)) {
      out.days[k] = [...new Set([...(out.days[k] || []), ...ids])];
    }
  }

  const byId = new Map();
  for (const p of [...(a.problems || []), ...(b.problems || [])]) {
    const prev = byId.get(p.id);
    if (!prev) {
      byId.set(p.id, structuredClone(p));
      continue;
    }
    const winner = newer(prev, p);
    const lose = winner === prev ? p : prev;
    const win = structuredClone(winner);
    const ms = new Map();
    for (const m of [...prev.measurements, ...p.measurements]) {
      const old = ms.get(m.id);
      ms.set(m.id, old ? { ...old, ...m, deleted: !!(old.deleted || m.deleted) } : { ...m });
    }
    win.measurements = [...ms.values()].sort((x, y) => x.at.localeCompare(y.at));
    win.deleted = !!(prev.deleted || p.deleted);
    if (!win.daily && lose.daily) win.daily = structuredClone(lose.daily);
    else if (win.daily && !win.daily.deleted && lose.daily?.answers) {
      win.daily.answers = { ...lose.daily.answers, ...win.daily.answers };
    }
    byId.set(p.id, win);
  }
  out.problems = [...byId.values()];
  return out;
}

// ---------- Exportar (CSV) ----------

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Una fila por día con datos y hábito activo ese día. */
export function habitsCSV(blocks, days) {
  const rows = [['fecha', 'bloque', 'habito_id', 'habito', 'hecho']];
  for (const k of Object.keys(days).sort()) {
    for (const b of blocks) {
      for (const h of activeHabits(b, k)) {
        rows.push([k, b.name, h.id, h.label, days[k].includes(h.id) ? 1 : 0]);
      }
    }
  }
  return toCSV(rows);
}

/** Una fila por día respondido en la pregunta diaria de cada problema. */
export function seguimientoCSV(problems) {
  const rows = [['fecha', 'problema', 'pregunta', 'respuesta']];
  const all = [];
  for (const p of problems.filter((x) => !x.deleted)) {
    const d = liveDaily(p);
    if (!d) continue;
    for (const [k, v] of Object.entries(d.answers || {})) all.push([k, p.name, d.question, v ? 'si' : 'no']);
  }
  all.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return toCSV([...rows, ...all]);
}

export function escalaCSV(dimensions, problems) {
  const rows = [['fecha', 'problema', 'estado', ...dimensions.map((d) => d.id), 'total', 'semaforo']];
  const all = [];
  for (const p of problems.filter((p) => !p.deleted)) {
    for (const m of liveMeasurements(p)) all.push([p, m]);
  }
  all.sort((x, y) => x[1].at.localeCompare(y[1].at));
  for (const [p, m] of all) {
    const t = sum(m.scores);
    rows.push([m.at, p.name, p.resolvedAt ? 'resuelto' : 'activo', ...m.scores, t, semaforo(t).id]);
  }
  return toCSV(rows);
}
