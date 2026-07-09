// =====================================================================
// SISTEMA DE GAMIFICAÇÃO — Streak + Estatísticas Locais
// Usa localStorage para persistir dados sem depender do Google Sheets
// =====================================================================

const STREAK_KEY = 'anki_streak';
const ACTIVITY_KEY = 'anki_activity';
const ANSWERS_KEY = 'anki_answers';

export interface StreakData {
  currentStreak: number;
  lastStudyDate: string; // ISO date string (YYYY-MM-DD)
}

export interface DailyActivity {
  [date: string]: number; // date (YYYY-MM-DD) -> cards reviewed
}

export interface AnswerHistory {
  correct: number;  // grades 2, 3
  incorrect: number; // grades 0, 1
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ==================== STREAK ====================

export function getStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { currentStreak: 0, lastStudyDate: '' };
    const data = JSON.parse(raw) as StreakData;
    
    // Se o último dia de estudo foi antes de ontem, o streak quebrou
    if (data.lastStudyDate !== today() && data.lastStudyDate !== yesterday()) {
      return { currentStreak: 0, lastStudyDate: data.lastStudyDate };
    }
    return data;
  } catch {
    return { currentStreak: 0, lastStudyDate: '' };
  }
}

export function recordStudyToday(): StreakData {
  const streak = getStreak();
  const t = today();
  
  if (streak.lastStudyDate === t) {
    // Já estudou hoje, não incrementa
    return streak;
  }
  
  let newStreak: number;
  if (streak.lastStudyDate === yesterday()) {
    // Continuando a ofensiva
    newStreak = streak.currentStreak + 1;
  } else {
    // Começando novo streak
    newStreak = 1;
  }
  
  const data: StreakData = { currentStreak: newStreak, lastStudyDate: t };
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  return data;
}

// ==================== ACTIVITY ====================

export function getWeeklyActivity(): number[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    const activity: DailyActivity = raw ? JSON.parse(raw) : {};
    
    const result: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      result.push(activity[key] || 0);
    }
    return result;
  } catch {
    return [0, 0, 0, 0, 0, 0, 0];
  }
}

export function recordCardReviewed(): void {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    const activity: DailyActivity = raw ? JSON.parse(raw) : {};
    const t = today();
    activity[t] = (activity[t] || 0) + 1;
    
    // Limpa dados com mais de 365 dias para o mapa de calor anual
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    for (const key of Object.keys(activity)) {
      if (key < cutoffStr) delete activity[key];
    }
    
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
  } catch { /* silently fail */ }
}

// ==================== ANSWERS ====================

export function getAnswerHistory(): AnswerHistory {
  try {
    const raw = localStorage.getItem(ANSWERS_KEY);
    if (!raw) return { correct: 0, incorrect: 0 };
    return JSON.parse(raw) as AnswerHistory;
  } catch {
    return { correct: 0, incorrect: 0 };
  }
}

export function recordAnswer(grade: number): void {
  try {
    const history = getAnswerHistory();
    if (grade >= 2) {
      history.correct++;
    } else {
      history.incorrect++;
    }
    localStorage.setItem(ANSWERS_KEY, JSON.stringify(history));
  } catch { /* silently fail */ }
}

export function getAccuracyRate(): number {
  const { correct, incorrect } = getAnswerHistory();
  const total = correct + incorrect;
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

export function getWeekDayLabels(): string[] {
  const labels: string[] = [];
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(dayNames[d.getDay()]);
  }
  return labels;
}

export function getAnnualActivity(): { date: string, count: number, empty?: boolean }[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    const activity: DailyActivity = raw ? JSON.parse(raw) : {};
    
    const result: { date: string, count: number, empty?: boolean }[] = [];
    const d = new Date();
    d.setDate(d.getDate() - 364);
    
    // Adicionar padding para que o primeiro dia caia na linha certa (0 = Domingo)
    const startDay = d.getDay();
    for (let i = 0; i < startDay; i++) {
      result.push({ date: '', count: 0, empty: true });
    }
    
    for (let i = 364; i >= 0; i--) {
      const cur = new Date();
      cur.setDate(cur.getDate() - i);
      const key = cur.toISOString().split('T')[0];
      result.push({ date: key, count: activity[key] || 0 });
    }
    return result;
  } catch {
    return [];
  }
}
