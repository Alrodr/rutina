import { emptyState } from './logic.js';

const KEY = 'rutina:v1';
const PRE_IMPORT_KEY = 'rutina:v1:antes-de-importar';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    return { ...emptyState(), ...s };
  } catch (e) {
    console.error('[rutina] no se pudo leer el estado', e);
    return emptyState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('[rutina] no se pudo guardar', e);
    return false;
  }
}

export function savePreImport(state) {
  try {
    localStorage.setItem(PRE_IMPORT_KEY, JSON.stringify(state));
  } catch { /* sin espacio: seguimos igualmente */ }
}

export function getFlag(name) {
  try { return localStorage.getItem(`rutina:${name}`); } catch { return null; }
}

export function setFlag(name, value) {
  try { localStorage.setItem(`rutina:${name}`, value); } catch { /* ignorar */ }
}
