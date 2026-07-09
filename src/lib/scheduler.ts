// Algoritmo inspirado no SM-2 (SuperMemo-2) para espaçamento
export type Grade = 0 | 1 | 2 | 3; // 0: Errei, 1: Difícil, 2: Bom, 3: Fácil

export interface CardState {
  interval: number; // Intervalo em dias
  ease: number;     // Fator de facilidade (padrão: 2.5)
  nextReview: Date; // Data da próxima revisão
}

export function calculateNextReview(current: CardState, grade: Grade): CardState {
  let { interval, ease } = current;

  if (grade === 0) {
    // Errei
    interval = 1;
    ease = Math.max(1.3, ease - 0.2); // Nunca desce abaixo de 1.3
  } else {
    // Acertei
    if (interval === 0) {
      interval = 1;
    } else if (interval === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    
    if (grade === 1) {
      // Difícil
      ease = Math.max(1.3, ease - 0.15);
      interval = Math.round(interval * 1.2);
    } else if (grade === 3) {
      // Fácil
      ease += 0.15;
      interval = Math.round(interval * 1.3);
    }
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return { interval, ease, nextReview };
}
