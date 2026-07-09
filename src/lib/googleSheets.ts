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

export async function fetchCardsFromSheet(): Promise<Flashcard[]> {
  if (!API_URL) return [];
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Falha ao buscar as cartas");
    return await response.json() as Flashcard[];
  } catch (error) {
    console.error("[Google Sheets API Error]", error);
    return [];
  }
}

async function sendAction(payload: any): Promise<void> {
  if (!API_URL) return;
  try {
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
  } catch (error) {
    console.error("[Google Sheets API Error]", error);
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
