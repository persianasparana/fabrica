/**
 * Camada de persistência do PCP.
 *
 * O componente principal (App.jsx) foi escrito para um objeto global
 * `window.storage` com a interface { list, get, set, delete }. Aqui esse
 * objeto é reimplementado sobre a API REST do backend PHP, tornando os
 * dados COMPARTILHADOS (multiusuário) — sem reescrever o componente.
 *
 * Contrato esperado pelo App:
 *   list(prefix) -> { keys: string[] }
 *   get(key)     -> { value: string | null }
 *   set(key, v)  -> qualquer (v já vem como string JSON)
 *   delete(key)  -> qualquer
 */
import { apiFetch } from './api.js';
import { getCsrf } from './session.js';

export function installStorage() {
  window.storage = {
    list(prefix) {
      return apiFetch('storage.php?prefix=' + encodeURIComponent(prefix || ''));
    },
    get(key) {
      return apiFetch('storage.php?key=' + encodeURIComponent(key));
    },
    set(key, value) {
      return apiFetch('storage.php?key=' + encodeURIComponent(key), {
        method: 'PUT',
        body: { value },
        csrf: getCsrf(),
      });
    },
    delete(key) {
      return apiFetch('storage.php?key=' + encodeURIComponent(key), {
        method: 'DELETE',
        csrf: getCsrf(),
      });
    },
  };
}
