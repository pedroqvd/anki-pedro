<script lang="ts">
  import { BookOpen, Target, TrendingUp, Flame, WifiOff, Sun, Moon, Award, CalendarClock, Building } from "lucide-svelte";
  import type { Flashcard } from "../lib/googleSheets";

  let { 
    isOnline, 
    theme, 
    streak, 
    pendingToday, 
    cards, 
    accuracyRate, 
    weeklyActivity,
    annualActivity, 
    weekDayLabels, 
    disciplineCoverage, 
    setTheme 
  } = $props<{
    isOnline: boolean;
    theme: string;
    streak: number;
    pendingToday: number;
    cards: Flashcard[];
    accuracyRate: number;
    weeklyActivity: number[];
    annualActivity: {date: string, count: number}[];
    weekDayLabels: string[];
    disciplineCoverage: any[];
    setTheme: (t: string) => void;
  }>();

  // 1. Gráfico de Previsão (Forecasting)
  let next7Days = $derived.by(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const labels = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      labels.push(d.toLocaleDateString('pt-BR', { weekday: 'short' }));
    }

    cards.forEach(c => {
      if (c.interval === -1) return;
      const reviewDate = new Date(c.nextReview);
      reviewDate.setHours(0,0,0,0);
      const diffTime = reviewDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        counts[diffDays]++;
      } else if (diffDays < 0) {
        counts[0]++; // Atrasados contam para hoje
      }
    });
    return { counts, labels };
  });

  // 2. Rastreador por Banca
  let bancas = $derived.by(() => {
    const b = new Map<string, number>();
    cards.forEach(c => {
      const tags = (c.front + ' ' + c.topic).match(/#([a-zA-Z0-9_]+)/g);
      if (tags) {
        tags.forEach(t => {
          b.set(t, (b.get(t) || 0) + 1);
        });
      }
    });
    return Array.from(b.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5);
  });
</script>

<div class="dash-header">
  <div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <p class="text-muted text-sm" style="margin: 0">Bem-vindo de volta</p>
      {#if !isOnline}
        <span class="badge" style="background: var(--err-bg); color: var(--err-text); display: flex; align-items: center; gap: 4px;"><WifiOff size={12}/> Offline</span>
      {/if}
    </div>
    <h1 class="dash-title">Painel de Estudos</h1>
  </div>
  <select class="input select-sm" style="max-width: 140px; margin-bottom: 0;" onchange={(e) => setTheme((e.target as HTMLSelectElement).value)}>
    <option value="dark" selected={theme === 'dark'}>Padrão Escuro</option>
    <option value="light" selected={theme === 'light'}>Padrão Claro</option>
    <option value="oled" selected={theme === 'oled'}>OLED Black</option>
    <option value="dracula" selected={theme === 'dracula'}>Dracula</option>
  </select>
</div>

<!-- Conquistas (Achievements) -->
<div class="achievements-bar">
  {#if streak >= 7}
    <div class="badge-icon" title="7 Dias de Foco"><Flame size={16} color="#f97316"/> Foco Semanal</div>
  {/if}
  {#if cards.length >= 100}
    <div class="badge-icon" title="100+ Cartões"><BookOpen size={16} color="#3b82f6"/> Criador</div>
  {/if}
  {#if accuracyRate >= 90 && cards.length > 20}
    <div class="badge-icon" title="90%+ de Acerto"><Target size={16} color="#10b981"/> Sniper</div>
  {/if}
</div>

<style>
  .achievements-bar {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
    overflow-x: auto;
  }
  .badge-icon {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    background: var(--bg-card);
    border: 1px solid var(--accent);
    color: var(--accent);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .banca-tag {
    display: inline-block;
    padding: 4px 10px;
    background: var(--bg-card);
    border-radius: 4px;
    margin: 4px;
    font-size: 0.85rem;
    border: 1px solid var(--bg-card-border);
  }
</style>

<!-- Streak -->
{#if streak > 0}
  <div class="streak-banner">
    <Flame size={22} color="#f97316"/>
    <span><strong>{streak}</strong> {streak === 1 ? 'dia' : 'dias'} seguidos estudando!</span>
  </div>
{/if}

<!-- Stat Cards -->
<div class="stat-grid">
  <div class="card stat-card">
    <Target size={20} class="stat-icon"/>
    <span class="stat-number">{pendingToday}</span>
    <span class="stat-label">Pendentes Hoje</span>
  </div>
  <div class="card stat-card">
    <BookOpen size={20} class="stat-icon"/>
    <span class="stat-number">{cards.length}</span>
    <span class="stat-label">Total de Cartões</span>
  </div>
  <div class="card stat-card">
    <TrendingUp size={20} class="stat-icon"/>
    <span class="stat-number">{accuracyRate}%</span>
    <span class="stat-label">Taxa de Acerto</span>
  </div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
  <!-- Weekly Chart -->
  <div class="card">
    <h3 class="section-title">Atividade (Passado)</h3>
    <div class="chart">
      {#each weeklyActivity as count, i}
        <div class="chart-bar-col">
          <div class="chart-bar" style="height: {Math.max(count * 8, 4)}px"></div>
          <span class="chart-label">{weekDayLabels[i]}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Forecast Chart -->
  <div class="card">
    <h3 class="section-title"><CalendarClock size={16} style="display:inline; vertical-align:text-bottom; margin-right:4px;"/> Previsão (Futuro)</h3>
    <div class="chart">
      {#each next7Days.counts as count, i}
        <div class="chart-bar-col">
          <div class="chart-bar" style="height: {Math.max(count * 8, 4)}px; background: var(--accent);"></div>
          <span class="chart-label">{next7Days.labels[i]}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<div class="card" style="margin-top: 15px;">
  <h3 class="section-title">Mapa de Calor (Último Ano)</h3>
  <div class="heatmap-container">
    {#each annualActivity as day}
      <div class="heatmap-cell" 
           title="{day.date}: {day.count} revisões" 
           style="background: {day.count === 0 ? 'var(--bg-input)' : `rgba(139,92,246,${Math.min(0.2 + day.count * 0.1, 1)})`}">
      </div>
    {/each}
  </div>
</div>

<style>
  .heatmap-container {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    height: 105px;
    gap: 3px;
    overflow-x: auto;
    padding-bottom: 5px;
  }
  .heatmap-cell {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
  }
</style>

{#if bancas.length > 0}
  <div class="card" style="margin-top: 15px;">
    <h3 class="section-title"><Building size={16} style="display:inline; vertical-align:text-bottom; margin-right:4px;"/> Distribuição por Bancas (Tags)</h3>
    <div>
      {#each bancas as [banca, count]}
        <span class="banca-tag"><strong>{banca}</strong>: {count} {count === 1 ? 'questão' : 'questões'}</span>
      {/each}
    </div>
  </div>
{/if}

<!-- Edital Coverage -->
<div class="card" style="margin-top: 15px;">
  <h3 class="section-title">Cobertura do Edital</h3>
  {#each disciplineCoverage as disc}
    <div class="coverage-row">
      <div class="coverage-header">
        <span class="coverage-name">{disc.name}</span>
        <span class="coverage-count">{disc.coveredTopics}/{disc.totalTopics}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: {disc.totalTopics > 0 ? (disc.coveredTopics / disc.totalTopics) * 100 : 0}%"></div>
      </div>
    </div>
  {/each}
</div>
