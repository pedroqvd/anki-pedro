<script lang="ts">
  import { onMount } from "svelte";
  import { fetchCardsFromSheet, updateCardInSheet, addCardToSheet, deleteCardFromSheet, loadCachedCards, setCachedCards, getApiUrl, type Flashcard } from "./lib/googleSheets";
  import { calculateNextReview, type Grade } from "./lib/scheduler";
  import { EDITAL, getAllDisciplines, getDisciplineFromPath, parseTopic, type Area } from "./lib/edital";
  import { getStreak, recordStudyToday, getWeeklyActivity, getAnnualActivity, recordCardReviewed, recordAnswer, getAccuracyRate, getWeekDayLabels } from "./lib/streak";
  import { processQueue, getPendingCount } from "./lib/offlineQueue";
  import { BookOpen, PlusCircle, Settings, Trash2, CheckCircle, Sparkles, Search, Edit2, Clock, Calendar, X, Sun, Moon, LayoutDashboard, Flame, TrendingUp, Target, WifiOff, Download, Upload, Volume2, RotateCcw, Zap, PauseCircle, PlayCircle, Timer } from "lucide-svelte";
  import { marked } from 'marked';
  import Dashboard from './components/Dashboard.svelte';
  import BottomNav from './components/BottomNav.svelte';
  import ManageTab from './components/ManageTab.svelte';
  import AddTab from './components/AddTab.svelte';
  import StudyTab from './components/StudyTab.svelte';

  // ================= Estado Global =================
  let cards = $state<Flashcard[]>([]);
  let loading = $state(true);
  let activeTab = $state<'dashboard' | 'study' | 'add' | 'manage'>('dashboard');
  let theme = $state('dark');
  let isOnline = $state(true);
  let isSaving = $state(false);

  // ================= Dashboard =================
  let streak = $state(0);
  let weeklyActivity = $state<number[]>([0,0,0,0,0,0,0]);
  let weekDayLabels = $state<string[]>(['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']);
  let accuracyRate = $state(0);
  let annualActivity = $state<{date: string, count: number, empty?: boolean}[]>([]);
  
  let pendingToday = $derived(
    cards.filter(c => new Date(c.nextReview) <= new Date()).length
  );

  // Cobertura do edital por disciplina
  let disciplineCoverage = $derived(
    getAllDisciplines().map(disc => {
      const cardsInDisc = cards.filter(c => getDisciplineFromPath(c.topic) === disc.name);
      const coveredTopics = new Set(cardsInDisc.map(c => parseTopic(c.topic).topic));
      return {
        name: disc.name,
        questions: disc.questions,
        totalTopics: disc.topics.length,
        coveredTopics: coveredTopics.size,
        totalCards: cardsInDisc.length
      };
    })
  );

  // ================= Aba Estudar =================
  // O estado do Estudo (filtros, pomodoro, filas) foi extraído para StudyTab.svelte

  // ================= Aba Adicionar =================
  async function handleSaveCards(cardsToAdd: Flashcard[]) {
    isSaving = true;
    cards = [...cards, ...cardsToAdd];
    saveLocal();
    showToast(`${cardsToAdd.length} cartões salvos!`);

    for (const c of cardsToAdd) {
      await addCardToSheet(c.front, c.back, c.topic);
    }
    
    await silentSync();
    isSaving = false;
  }

  // ================= Aba Gerenciar =================
  let searchQuery = $state('');
  let filteredManageCards = $derived(
    cards.filter(c => {
      const q = searchQuery.toLowerCase();
      return c.front.toLowerCase().includes(q) || 
             c.back.toLowerCase().includes(q) ||
             c.topic.toLowerCase().includes(q);
    })
  );
  let editingCard = $state<Flashcard | null>(null);

  // ================= Toast =================
  let toastMessage = $state('');
  let toastVisible = $state(false);
  let toastTimeout: any;
  function showToast(msg: string) {
    toastMessage = msg;
    toastVisible = true;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastVisible = false, 3000);
  }

  // ================= Ciclo de Vida =================
  onMount(() => {
    // Carregar preferência de tema
    const savedTheme = localStorage.getItem('anki_theme');
    if (savedTheme) {
      theme = savedTheme;
    } else {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // Carregar gamificação
    const s = getStreak();
    streak = s.currentStreak;
    weeklyActivity = getWeeklyActivity();
    annualActivity = getAnnualActivity();
    weekDayLabels = getWeekDayLabels();
    accuracyRate = getAccuracyRate();

    // CACHE INSTANTÂNEO: Carregar cartas do localStorage (0ms)
    const cached = loadCachedCards();
    if (cached.length > 0) {
      cards = cached;
      loading = false;
      silentSync();
    } else {
      loadCards();
    }

    // FILA OFFLINE: Detecta quando a internet volta e sincroniza
    isOnline = navigator.onLine;
    window.addEventListener('online', async () => {
      isOnline = true;
      const pending = getPendingCount();
      if (pending > 0) {
        const synced = await processQueue(getApiUrl());
        if (synced > 0) {
          showToast(`${synced} ${synced === 1 ? 'ação sincronizada' : 'ações sincronizadas'} com a nuvem!`);
          silentSync();
        }
      }
    });
    window.addEventListener('offline', () => {
      isOnline = false;
      showToast('Sem internet — modo offline ativado');
    });

    // Tenta processar fila pendente ao abrir (caso tenha ficado pendente da última sessão)
    if (navigator.onLine && getPendingCount() > 0) {
      processQueue(getApiUrl()).then(synced => {
        if (synced > 0) {
          showToast(`${synced} ${synced === 1 ? 'ação pendente sincronizada' : 'ações pendentes sincronizadas'}!`);
          silentSync();
        }
      });
    }
  });

  async function loadCards() {
    loading = true;
    const data = await fetchCardsFromSheet();
    cards = data || [];
    loading = false;
  }

  // Salva estado local no cache a cada mutação
  function saveLocal() {
    setCachedCards(cards);
  }

  async function silentSync() {
    const data = await fetchCardsFromSheet();
    if (data && data.length > 0) {
      cards = data;
      if (currentCardIndex >= filteredCards.length) currentCardIndex = Math.max(0, filteredCards.length - 1);
    }
  }

  function setTheme(t: string) {
    theme = t;
    localStorage.setItem('anki_theme', theme);
  }

  // ================= Funções Auxiliares =================
  function readText(text: string) {
    if (!('speechSynthesis' in window)) {
      showToast("Seu navegador não suporta leitura em voz alta.");
      return;
    }
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
    msg.lang = 'pt-BR';
    window.speechSynthesis.speak(msg);
  }

  function handleStudyAnswer(card: Flashcard, grade: Grade) {
    recordCardReviewed();
    recordAnswer(grade);
    const s = recordStudyToday();
    streak = s.currentStreak;
    weeklyActivity = getWeeklyActivity();
    accuracyRate = getAccuracyRate();

    saveLocal();
    updateCardInSheet(card);
  }

  function handleStudyUndo(oldCard: Flashcard) {
    saveLocal();
    updateCardInSheet(oldCard);
    showToast("Resposta desfeita!");
  }
  // Gestos e Pomodoro movidos para StudyTab
  
  // ================= Lógica de Adição =================
  // handleAdd moved to AddTab.svelte

  // ================= Lógica de Gerenciamento =================
  async function toggleSuspend(c: Flashcard) {
    const isSuspended = c.interval === -1;
    const idx = cards.findIndex(card => card.id === c.id);
    if (idx !== -1) {
      cards[idx].interval = isSuspended ? 0 : -1;
      cards[idx].nextReview = new Date().toISOString(); // Resetar revisão ao retomar
      saveLocal();
      showToast(isSuspended ? 'Cartão retomado!' : 'Cartão pausado!');
      if (cards[idx].rowNumber !== -1) {
        await updateCardInSheet(cards[idx]);
        await silentSync();
      }
    }
  }

  async function handleDelete(rowNumber: number, id: string) {
    if (!confirm('Tem certeza que deseja apagar este cartão permanentemente?')) return;
    cards = cards.filter(c => c.id !== id);
    saveLocal();
    showToast('Cartão deletado!');
    if (rowNumber !== -1) {
      await deleteCardFromSheet(rowNumber);
      silentSync();
    }
  }

  function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cards, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "anki_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;

        // Se não for JSON, tenta ler como TSV (formato padrão do Anki Desktop)
        if (!text.trim().startsWith('[') && !text.trim().startsWith('{')) {
          const lines = text.split('\n');
          let added = 0;
          for (const line of lines) {
            const parts = line.split('\t'); // tab separated
            if (parts.length >= 2) {
              const front = parts[0].trim();
              const back = parts[1].trim();
              if (front && back) {
                cards.push({
                  id: "imported-" + Date.now() + Math.random(),
                  front, back, topic: "Geral > Importado > " + file.name.replace(/\.[^/.]+$/, ""),
                  interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: -1
                });
                added++;
              }
            }
          }
          if (added > 0) {
            saveLocal();
            showToast(`${added} cartões TSV importados com sucesso!`);
            silentSync();
          } else {
            showToast("Nenhum cartão válido encontrado (use separação por Tab).");
          }
          input.value = '';
          return;
        }

        const importedCards = JSON.parse(text);
        if (Array.isArray(importedCards)) {
          // Merge imported cards by ID
          const newCards = [...cards];
          let added = 0;
          for (const ic of importedCards) {
            if (!newCards.find(c => c.id === ic.id)) {
              newCards.push(ic);
              added++;
              // Send to cloud if needed
              if (ic.rowNumber === -1 || ic.rowNumber === undefined) {
                 await addCardToSheet(ic.front, ic.back, ic.topic);
              }
            }
          }
          cards = newCards;
          saveLocal();
          showToast(`${added} cartões importados com sucesso!`);
          silentSync();
        }
      } catch (err) {
        showToast("Erro ao ler arquivo JSON");
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  async function saveEdit() {
    if(!editingCard || isSaving) return;
    isSaving = true;
    const idx = cards.findIndex(c => c.id === editingCard!.id);
    if(idx !== -1) cards[idx] = { ...editingCard };
    const cardToUpdate = { ...editingCard };
    editingCard = null;
    saveLocal();
    showToast('Cartão atualizado!');
    if (cardToUpdate.rowNumber !== -1) {
      await updateCardInSheet(cardToUpdate);
      await silentSync();
    }
    isSaving = false;
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth()+1}`;
  }
</script>

<main class="app-container {theme}">
  <!-- Toast -->
  <div class="toast" class:toast-visible={toastVisible}>
    <CheckCircle size={18} /><span>{toastMessage}</span>
  </div>

  <!-- Edit Modal -->
  {#if editingCard}
    <div class="modal-backdrop" onclick={() => editingCard = null}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="card modal-content" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>Editar Cartão</h3>
          <button class="btn-icon" onclick={() => editingCard = null}><X size={22}/></button>
        </div>
        <label>Tópico</label>
        <input class="input" bind:value={editingCard.topic} />
        <label>Pergunta</label>
        <textarea class="input" bind:value={editingCard.front}></textarea>
        <label>Resposta</label>
        <textarea class="input" bind:value={editingCard.back}></textarea>
        <div class="stats-row">
          <span class="stat-badge"><Clock size={14}/> {editingCard.interval}d</span>
          <span class="stat-badge"><Calendar size={14}/> {formatDate(editingCard.nextReview)}</span>
        </div>
        <button class="btn-primary" onclick={saveEdit} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  {/if}
  <div class="content">
    {#if loading}
      <div class="card center-col" style="min-height:250px">
        <div class="spinner"></div>
        <p class="text-muted">Sincronizando com a Nuvem...</p>
      </div>
    {:else if activeTab === 'dashboard'}
      <Dashboard 
        {isOnline}
        {theme}
        {streak}
        {pendingToday}
        {cards}
        {accuracyRate}
        {weeklyActivity}
        {annualActivity}
        {weekDayLabels}
        {disciplineCoverage}
        {setTheme}
      />

    <!-- ==================== ESTUDAR ==================== -->
    {:else if activeTab === 'study'}
      <StudyTab 
        bind:cards
        onAnswer={handleStudyAnswer}
        onUndo={handleStudyUndo}
        {showToast}
      />

    <!-- ==================== ADICIONAR ==================== -->
    {:else if activeTab === 'add'}
      <AddTab 
        {isSaving} 
        onSave={handleSaveCards} 
        {showToast} 
      />

    <!-- ==================== GERENCIAR ==================== -->
    {:else if activeTab === 'manage'}
      <ManageTab
        {filteredManageCards}
        bind:searchQuery
        {handleImport}
        {exportData}
        {toggleSuspend}
        {handleDelete}
        openEditModal={(c) => editingCard = { ...c }}
      />
    {/if}
  </div>

  <!-- Bottom Nav -->
  <BottomNav bind:activeTab />
</main>

<style>
  /* All global CSS moved to src/app.css */
</style>
