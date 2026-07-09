import { enqueue } from "./offlineQueue";

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  interval: number;
  ease: number;
  nextReview: string;
  topic: string;
  rowNumber: number;
}

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "";
const CACHE_KEY = "anki_cards_cache";
const CACHE_TIME_KEY = "anki_cache_time";

// ==================== CACHE LOCAL ====================

function getCachedCards(): Flashcard[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function setCachedCards(cards: Flashcard[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cards));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
  } catch { /* localStorage cheio, ignora */ }
}

export function loadCachedCards(): Flashcard[] {
  return getCachedCards();
}

export function getApiUrl(): string {
  return API_URL;
}

// ==================== API ====================

export async function fetchCardsFromSheet(): Promise<Flashcard[]> {
  if (!API_URL) return getCachedCards();
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Falha ao buscar");
    const data = await response.json() as Flashcard[];
    setCachedCards(data);
    return data;
  } catch (error) {
    console.error("[Sync Error]", error);
    return getCachedCards();
  }
}

// sendAction com fallback para fila offline
async function sendAction(payload: any): Promise<void> {
  if (!API_URL) return;
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    if (!response.ok) throw new Error("Server error");
  } catch (error) {
    console.warn("[Offline] Ação enfileirada para sincronização posterior:", payload.action);
    enqueue(payload); // Salva na fila offline
  }
}

export async function addCardToSheet(front: string, back: string, topic: string): Promise<void> {
  await sendAction({
    action: "add",
    card: { front, back, topic, interval: 0, ease: 2.5, nextReview: new Date().toISOString() }
  });
}

export async function updateCardInSheet(card: Flashcard): Promise<void> {
  await sendAction({ action: "update", card });
}

export async function deleteCardFromSheet(rowNumber: number): Promise<void> {
  await sendAction({ action: "delete", rowNumber });
}
