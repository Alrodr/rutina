import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, DIMENSIONS } from '../js/habits.js';
import {
  dayKey, addDays, mondayOf, level, blockProgress, streak, weekPercent,
  semaforo, sortedActive, mergeState, habitsCSV, escalaCSV, emptyState, activeHabits,
  dailyProblems, seguimientoCSV,
} from '../js/logic.js';

const ALL = BLOCKS.flatMap((b) => b.habits.map((h) => h.id)); // 14 hábitos
const HALF = ALL.slice(0, 7);

test('el día cambia a las 4:00', () => {
  assert.equal(dayKey(new Date(2026, 10, 17, 0, 30)), '2026-11-16');
  assert.equal(dayKey(new Date(2026, 10, 17, 3, 59)), '2026-11-16');
  assert.equal(dayKey(new Date(2026, 10, 17, 4, 0)), '2026-11-17');
});

test('fechas: sumar días y lunes de la semana', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(mondayOf('2026-11-16'), '2026-11-16'); // lunes
  assert.equal(mondayOf('2026-11-22'), '2026-11-16'); // domingo
});

test('nivel de intensidad', () => {
  assert.equal(level(0, 5), 0);
  assert.equal(level(1, 6), 1);
  assert.equal(level(3, 6), 2);
  assert.equal(level(5, 6), 4);
  assert.equal(level(3, 3), 4);
  assert.equal(level(0, 0), 0);
});

test('un hábito añadido después no cuenta en días anteriores', () => {
  const block = { id: 'x', name: 'X', habits: [
    { id: 'a', label: 'A', since: '2020-01-01' },
    { id: 'b', label: 'B', since: '2026-11-10' },
  ] };
  assert.deepEqual(blockProgress(block, '2026-11-09', ['a']), { done: 1, total: 1 });
  assert.deepEqual(blockProgress(block, '2026-11-10', ['a']), { done: 1, total: 2 });
  assert.equal(activeHabits({ habits: [{ id: 'c', since: '2020-01-01', until: '2026-01-01' }] }, '2026-02-01').length, 0);
});

test('racha: hoy cuenta solo si ya llega a la mitad', () => {
  const days = { '2026-11-13': HALF, '2026-11-14': ALL, '2026-11-15': HALF };
  assert.equal(streak(BLOCKS, days, '2026-11-16'), 3);
  assert.equal(streak(BLOCKS, { ...days, '2026-11-16': ALL }, '2026-11-16'), 4);
  assert.equal(streak(BLOCKS, { '2026-11-15': ALL.slice(0, 3) }, '2026-11-16'), 0);
});

test('porcentaje de la semana desde el lunes', () => {
  // miércoles: lunes todo, martes nada, miércoles mitad → 21 de 42 = 50 %
  const days = { '2026-11-16': ALL, '2026-11-18': HALF };
  assert.equal(weekPercent(BLOCKS, days, '2026-11-18'), 50);
});

test('semáforo de la Escala de Impacto', () => {
  assert.equal(semaforo(6).id, 'verde');
  assert.equal(semaforo(20).id, 'verde');
  assert.equal(semaforo(21).id, 'amarillo');
  assert.equal(semaforo(40).id, 'amarillo');
  assert.equal(semaforo(41).id, 'rojo');
});

const prob = (id, scores, extra = {}) => ({
  id, name: id, createdAt: '2026-11-01T10:00', updatedAt: '2026-11-01T10:00', resolvedAt: null, deleted: false,
  measurements: scores.map((s, i) => ({ id: `${id}_m${i}`, at: `2026-11-0${i + 1}T10:00`, scores: s })), ...extra,
});

test('problemas activos ordenados por última puntuación', () => {
  const ps = [
    prob('bajo', [[2, 2, 2, 2, 2, 2]]),
    prob('alto', [[1, 1, 1, 1, 1, 1], [9, 9, 9, 9, 9, 9]]),
    prob('resuelto', [[10, 10, 10, 10, 10, 10]], { resolvedAt: '2026-11-05' }),
    prob('borrado', [[10, 10, 10, 10, 10, 10]], { deleted: true }),
  ];
  assert.deepEqual(sortedActive(ps).map((p) => p.id), ['alto', 'bajo']);
});

test('importar fusiona sin perder datos', () => {
  const a = emptyState();
  a.days = { '2026-11-15': ['mano'], '2026-11-16': ['abrazo'] };
  a.problems = [prob('p', [[5, 5, 5, 5, 5, 5]])];
  const b = emptyState();
  b.days = { '2026-11-15': ['cuello'], '2026-11-10': ['isla'] };
  const pb = prob('p', [[5, 5, 5, 5, 5, 5]], { name: 'renombrado', updatedAt: '2026-11-09T00:00' });
  pb.measurements.push({ id: 'nueva', at: '2026-11-09T10:00', scores: [3, 3, 3, 3, 3, 3] });
  b.problems = [pb, prob('q', [[1, 1, 1, 1, 1, 1]])];

  const m = mergeState(a, b);
  assert.deepEqual(m.days['2026-11-15'].sort(), ['cuello', 'mano']);
  assert.deepEqual(Object.keys(m.days).sort(), ['2026-11-10', '2026-11-15', '2026-11-16']);
  const p = m.problems.find((x) => x.id === 'p');
  assert.equal(p.name, 'renombrado');
  assert.equal(p.measurements.length, 2);
  assert.equal(m.problems.length, 2);
});

test('importar respeta lo borrado', () => {
  const a = emptyState();
  const pa = prob('p', [[5, 5, 5, 5, 5, 5]]);
  pa.measurements[0].deleted = true;
  a.problems = [pa];
  const b = emptyState();
  b.problems = [prob('p', [[5, 5, 5, 5, 5, 5]])];
  assert.equal(mergeState(a, b).problems[0].measurements[0].deleted, true);
  assert.equal(mergeState(b, a).problems[0].measurements[0].deleted, true);
});

test('CSV de hábitos y de la escala', () => {
  const csv = habitsCSV(BLOCKS, { '2026-11-16': ['mano'] });
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'fecha,bloque,habito_id,habito,hecho');
  assert.equal(lines.length, 1 + 14);
  assert.equal(lines[1], '2026-11-16,Mañana,mano,Ejercicio de la mano,1');
  assert.ok(lines.includes('2026-11-16,Mañana,cuello,"Cuello: sí, no, quizá",0'));

  const e = escalaCSV(DIMENSIONS, [prob('Trabajo, "proyecto"', [[8, 6, 5, 9, 6, 6]])]);
  const el = e.replace('﻿', '').trim().split('\r\n');
  assert.equal(el[0], 'fecha,problema,estado,emociones,salud_fisica,relaciones,rendimiento,motivacion,vida_general,total,semaforo');
  assert.equal(el[1], '2026-11-01T10:00,"Trabajo, ""proyecto""",activo,8,6,5,9,6,6,40,amarillo');
});

test('pregunta diaria: solo en problemas activos y sin quitar', () => {
  const ps = [
    prob('a', [], { daily: { question: '¿Dormí bien?', answers: {} } }),
    prob('b', [], { daily: { question: 'x', deleted: true, answers: {} } }),
    prob('c', [], { resolvedAt: '2026-11-05', daily: { question: 'y', answers: {} } }),
    prob('d', []),
  ];
  assert.deepEqual(dailyProblems(ps).map((p) => p.id), ['a']);
});

test('importar une las respuestas diarias y respeta quitar la pregunta', () => {
  const a = emptyState();
  a.problems = [prob('p', [], { updatedAt: '2026-11-10T00:00', daily: { question: '¿Dormí bien?', answers: { '2026-11-10': true } } })];
  const b = emptyState();
  b.problems = [prob('p', [], { updatedAt: '2026-11-01T00:00', daily: { question: '¿Dormí bien?', answers: { '2026-11-01': false, '2026-11-10': false } } })];
  const m = mergeState(a, b).problems[0];
  assert.deepEqual(m.daily.answers, { '2026-11-01': false, '2026-11-10': true });

  const c = emptyState();
  c.problems = [prob('p', [], { updatedAt: '2026-11-12T00:00', daily: { question: '¿Dormí bien?', deleted: true, answers: {} } })];
  assert.equal(mergeState(b, c).problems[0].daily.deleted, true);

  const d = emptyState();
  d.problems = [prob('p', [], { updatedAt: '2026-11-20T00:00' })];
  assert.equal(mergeState(d, b).problems[0].daily.question, '¿Dormí bien?');
});

test('CSV de seguimiento diario', () => {
  const csv = seguimientoCSV([prob('Sueño', [], { daily: { question: '¿Dormí 7 h?', answers: { '2026-11-16': true, '2026-11-15': false } } })]);
  const lines = csv.replace('\uFEFF', '').trim().split('\r\n');
  assert.deepEqual(lines, ['fecha,problema,pregunta,respuesta', '2026-11-15,Sueño,¿Dormí 7 h?,no', '2026-11-16,Sueño,¿Dormí 7 h?,si']);
});
