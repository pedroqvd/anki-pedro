// =====================================================================
// FILA OFFLINE — Garante que nenhuma ação se perca sem internet
// Salva ações pendentes no localStorage e reenvia quando a internet voltar
// =====================================================================

const QUEUE_KEY = 'anki_offline_queue';

export interface QueuedAction {
  id: string;
  payload: any;
  timestamp: number;
}

function getQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(queue: QueuedAction[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* silently fail */ }
}

export function enqueue(payload: any): void {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    payload,
    timestamp: Date.now()
  });
  saveQueue(queue);
}

export function getPendingCount(): number {
  return getQueue().length;
}

// Processa toda a fila: envia cada ação para o Google Apps Script
// Retorna a quantidade de ações sincronizadas com sucesso
export async function processQueue(apiUrl: string): Promise<number> {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const failed: QueuedAction[] = [];

  for (const action of queue) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify(action.payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
      if (response.ok) {
        synced++;
      } else {
        failed.push(action); // Servidor recusou, tenta de novo depois
      }
    } catch {
      failed.push(action); // Ainda sem internet
    }
  }

  saveQueue(failed); // Salva apenas as que falharam
  return synced;
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}
