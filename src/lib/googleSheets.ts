export interface Flashcard {
  id: string;         // Usaremos o número da linha como ID
  front: string;      // Coluna A (Pergunta)
  back: string;       // Coluna B (Resposta)
  interval: number;   // Coluna C (Intervalo em dias)
  ease: number;       // Fator de facilidade (default 2.5)
  nextReview: string; // Coluna D (Próxima revisão - ISO String)
  rowNumber: number;  // Para saber qual linha atualizar
}

// O Vite injeta as variáveis de ambiente que começam com VITE_
// Se não houver, ele usa uma string vazia para não quebrar a compilação.
const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "";

export async function fetchCardsFromSheet(): Promise<Flashcard[]> {
  if (!API_URL) {
    console.warn("⚠️ URL do Apps Script não configurada. Mostrando Mock de teste.");
    return [
      { id: "2", front: "Exemplo Mock 1", back: "Configure a VITE_APPS_SCRIPT_URL no seu Vercel!", interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: 2 }
    ];
  }

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Falha ao buscar as cartas");
    const data = await response.json();
    return data as Flashcard[];
  } catch (error) {
    console.error("[Google Sheets API Error]", error);
    return [];
  }
}

export async function updateCardInSheet(card: Flashcard): Promise<void> {
  if (!API_URL) {
    console.warn("⚠️ URL não configurada. Atualização ignorada (Mock mode).");
    return;
  }

  try {
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(card),
      // Não usamos Headers "application/json" porque requisições CORS complexas (preflight)
      // costumam falhar no Google Apps Script Web App de forma nativa.
      // O text/plain passa direto (simple request) e processamos como JSON lá no script.
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      }
    });
    console.log(`[Google Sheets API] Row ${card.rowNumber} atualizada!`);
  } catch (error) {
    console.error("[Google Sheets API Error] Falha ao atualizar a carta.", error);
  }
}
