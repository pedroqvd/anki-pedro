// Interface mockada para conectar com a API REST do Google Sheets futuramente
// No mundo real, usaríamos a biblioteca do Google APIs ou REST puro usando fetch()

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  interval: number;
  ease: number;
  nextReview: string; // ISO date string
  rowNumber: number;  // Para saber qual linha atualizar
}

const SHEET_ID = import.meta.env.VITE_GOOGLE_SHEETS_ID || "COLOQUE_SEU_SHEET_ID_AQUI";
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "COLOQUE_SUA_API_KEY_AQUI";

export async function fetchCardsFromSheet(): Promise<Flashcard[]> {
  console.log(`[Google Sheets API] Fetching from ${SHEET_ID}...`);
  
  // MOCK DATA para podermos testar a UI enquanto não configuramos as chaves
  return [
    {
      id: "1",
      front: "O que é WebAssembly?",
      back: "É um formato de instrução binária para uma máquina virtual baseada em pilha.",
      interval: 0,
      ease: 2.5,
      nextReview: new Date().toISOString(),
      rowNumber: 2
    },
    {
      id: "2",
      front: "Como o Google Sheets atua nesta arquitetura?",
      back: "Ele atua como um banco de dados relacional gratuito na nuvem via API REST.",
      interval: 1,
      ease: 2.5,
      nextReview: new Date().toISOString(),
      rowNumber: 3
    }
  ];
}

export async function updateCardInSheet(card: Flashcard): Promise<void> {
  // Chamada REST para atualizar apenas as colunas de "interval", "ease" e "nextReview" da "rowNumber"
  console.log(`[Google Sheets API] Updating row ${card.rowNumber}... Novo intervalo: ${card.interval} dias.`);
  return Promise.resolve();
}
