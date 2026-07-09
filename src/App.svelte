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
  let selectedTopic = $state<string>('Todos');
  let customFilter = $state<string>('');
  let currentCardIndex = $state(0);
  let showBack = $state(false);
  let isCramming = $state(false);
  let lastAnswered = $state<{ cardIndex: number; oldState: Flashcard } | null>(null);
  
  let topics = $derived(['Todos', ...new Set(cards.map(c => getDisciplineFromPath(c.topic)))]);
  let filteredCards = $derived(
    cards.filter(c => {
      const isSuspended = c.interval === -1;
      if (isSuspended) return false;

      if (customFilter) {
        const q = customFilter.toLowerCase();
        return c.front.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q);
      }

      const isDue = new Date(c.nextReview) <= new Date();
      const matchesTopic = selectedTopic === 'Todos' || getDisciplineFromPath(c.topic) === selectedTopic;
      return (isDue || isCramming) && matchesTopic;
    })
  );
  let currentCard = $derived(filteredCards[currentCardIndex]);

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

  async function handleAnswer(grade: Grade) {
    if (!currentCard || isSaving) return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Parar fala ao responder
    }

    lastAnswered = { cardIndex: currentCardIndex, oldState: { ...currentCard } };

    const { interval, ease, nextReview } = calculateNextReview({
      interval: currentCard.interval,
      ease: currentCard.ease,
      nextReview: new Date(currentCard.nextReview)
    }, grade);

    currentCard.interval = interval;
    currentCard.ease = ease;
    currentCard.nextReview = nextReview.toISOString();
    
    const cardToUpdate = { ...currentCard };
    showBack = false;
    currentCardIndex++;

    // Gamificação
    recordCardReviewed();
    recordAnswer(grade);
    const s = recordStudyToday();
    streak = s.currentStreak;
    weeklyActivity = getWeeklyActivity();
    accuracyRate = getAccuracyRate();

    if (currentCardIndex >= filteredCards.length) showToast("Revisões concluídas! 🎉");
    saveLocal();
    updateCardInSheet(cardToUpdate);
  }

  async function undoLastAnswer() {
    if (!lastAnswered) return;
    const { cardIndex, oldState } = lastAnswered;
    const idx = cards.findIndex(c => c.id === oldState.id);
    if (idx !== -1) {
      cards[idx] = { ...oldState };
      currentCardIndex = cardIndex;
      showBack = false;
      saveLocal();
      updateCardInSheet(cards[idx]);
      showToast("Resposta desfeita!");
    }
    lastAnswered = null;
  }

  // ================= Gestos Mobile (Swipe) =================
  let touchStartX = $state(0);
  let touchMoveX = $state(0);
  let swipeOffset = $state(0);

  function handleTouchStart(e: TouchEvent) {
    if (!showBack) return;
    touchStartX = e.touches[0].clientX;
  }
  function handleTouchMove(e: TouchEvent) {
    if (!showBack || touchStartX === 0) return;
    touchMoveX = e.touches[0].clientX;
    swipeOffset = touchMoveX - touchStartX;
  }
  function handleTouchEnd() {
    if (!showBack || touchStartX === 0) return;
    if (swipeOffset > 100) {
      handleAnswer(3); // Fácil
    } else if (swipeOffset < -100) {
      handleAnswer(0); // Errei
    }
    touchStartX = 0;
    touchMoveX = 0;
    swipeOffset = 0;
  }

  // ================= Pomodoro =================
  let pomodoroTime = $state(25 * 60);
  let pomodoroActive = $state(false);
  let pomodoroInterval: ReturnType<typeof setInterval> | null = null;
  let pomodoroFormatted = $derived(`${Math.floor(pomodoroTime/60).toString().padStart(2, '0')}:${(pomodoroTime%60).toString().padStart(2, '0')}`);

  function togglePomodoro() {
    if (pomodoroActive) {
      if (pomodoroInterval) clearInterval(pomodoroInterval);
      pomodoroActive = false;
    } else {
      pomodoroActive = true;
      pomodoroInterval = setInterval(() => {
        if (pomodoroTime > 0) {
          pomodoroTime--;
        } else {
          if (pomodoroInterval) clearInterval(pomodoroInterval);
          pomodoroActive = false;
          showToast("Pomodoro concluído! Faça uma pausa.");
          pomodoroTime = 25 * 60;
        }
      }, 1000);
    }
  }

  function resetPomodoro() {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
    pomodoroActive = false;
    pomodoroTime = 25 * 60;
  }

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
      <div class="tab-header" style="flex-wrap: wrap;">
        <select class="input select-sm" bind:value={selectedTopic} disabled={!!customFilter} onchange={() => {currentCardIndex = 0; showBack = false; lastAnswered = null;}}>
          {#each topics as topic}
            <option value={topic}>{topic}</option>
          {/each}
        </select>
        <button class="btn-icon" class:active={isCramming} disabled={!!customFilter} onclick={() => {isCramming = !isCramming; currentCardIndex = 0; showBack = false; lastAnswered = null;}} title="Modo Intensivão (Ignorar Data)" style="background: {isCramming ? 'var(--accent)' : 'var(--bg-card)'}; border: 1px solid var(--bg-card-border); color: {isCramming ? '#fff' : 'inherit'}">
          <Zap size={18} />
        </button>
        <div class="badge">{Math.max(0, filteredCards.length - currentCardIndex)} pendentes</div>
        
        <div style="width: 100%; display: flex; gap: 10px; margin-top: 5px;">
          <input class="input" style="margin-bottom:0; flex:1;" placeholder="Simulado: Digite uma tag (ex: #cesgranrio) ou termo" bind:value={customFilter} oninput={() => {currentCardIndex=0; showBack=false; lastAnswered = null;}} />
        </div>
      </div>

      <div style="display:flex; justify-content:center; gap: 10px; margin-bottom: 15px;">
        <button class="badge" style="background: {pomodoroActive ? 'var(--accent)' : 'var(--bg-card)'}; color: {pomodoroActive ? '#fff' : 'var(--text-primary)'}; border: 1px solid {pomodoroActive ? 'var(--accent)' : 'var(--bg-card-border)'}; cursor: pointer; display:flex; align-items:center; gap: 6px; font-size: 1rem; padding: 6px 12px;" onclick={togglePomodoro}>
          <Timer size={16}/> {pomodoroFormatted}
        </button>
        {#if pomodoroTime !== 25 * 60}
          <button class="btn-icon" style="background: var(--bg-card);" onclick={resetPomodoro} title="Resetar Pomodoro"><RotateCcw size={16}/></button>
        {/if}
      </div>

      {#if currentCard}
        <div class="scene">
          <div class="flashcard" class:is-flipped={showBack} ontouchstart={handleTouchStart} ontouchmove={handleTouchMove} ontouchend={handleTouchEnd} style={showBack && swipeOffset !== 0 ? `transform: rotateY(180deg) translateX(${swipeOffset}px) rotate(${swipeOffset/15}deg); transition: none;` : ''}>
            <div class="card-face card-front card">
              <span class="topic-tag">{getDisciplineFromPath(currentCard.topic)}</span>
              <div class="card-question">
                {#if currentCard.front.match(/^[a-e]\) /mi)}
                  {@html marked.parse(currentCard.front).replace(/([a-e]\) .*)/gi, '<div style="padding: 8px; margin: 4px 0; border: 1px solid var(--bg-card-border); border-radius: 6px;">$1</div>')}
                {:else}
                  {@html marked.parse(currentCard.front.replace(/\{\{(.*?)\}\}/g, '[...]'))}
                {/if}
              </div>
              <button class="btn-icon tts-btn" onclick={(e) => { e.stopPropagation(); readText(currentCard.front.replace(/\{\{(.*?)\}\}/g, '')); }} title="Ouvir Pergunta">
                <Volume2 size={20}/>
              </button>
              <p class="text-muted text-sm">Toque para revelar a resposta</p>
              <button class="btn-primary" onclick={() => showBack = true}>Mostrar Resposta</button>
            </div>
            <div class="card-face card-back card">
              <div class="card-answer">
                {#if currentCard.front.includes('{{')}
                  <div class="cloze-reveal" style="font-size: 1.1rem; margin-bottom: 10px;">
                    {@html marked.parse(currentCard.front.replace(/\{\{(.*?)\}\}/g, '<span style="color:var(--accent); font-weight:bold; background: rgba(0, 122, 255, 0.1); padding: 0 4px; border-radius: 4px;">$1</span>'))}
                  </div>
                  <hr style="margin: 10px 0; border: 1px solid var(--bg-card-border);" />
                {/if}
                {@html marked.parse(currentCard.back)}
              </div>
              <button class="btn-icon tts-btn" onclick={(e) => { e.stopPropagation(); readText(currentCard.back); }} title="Ouvir Resposta">
                <Volume2 size={20}/>
              </button>
              <div class="grade-grid">
                <button class="btn-grade btn-err" onclick={() => handleAnswer(0)}>Errei</button>
                <button class="btn-grade btn-hard" onclick={() => handleAnswer(1)}>Difícil</button>
                <button class="btn-grade btn-good" onclick={() => handleAnswer(2)}>Bom</button>
                <button class="btn-grade btn-easy" onclick={() => handleAnswer(3)}>Fácil</button>
              </div>
              {#if lastAnswered}
                <button class="btn-icon undo-btn" onclick={(e) => { e.stopPropagation(); undoLastAnswer(); }} title="Desfazer">
                  <RotateCcw size={16}/> Desfazer
                </button>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="card center-col" style="min-height:280px">
          <Sparkles size={40}/>
          <h3>Tudo limpo!</h3>
          <p class="text-muted">Nenhuma revisão pendente para <strong>{selectedTopic}</strong>.</p>
          {#if cards.some(c => c.interval === -1 && (selectedTopic === 'Todos' || getDisciplineFromPath(c.topic) === selectedTopic))}
            <p class="text-muted text-sm" style="color: var(--warn); margin-top: 10px;">
              Aviso: Você possui cartões pausados neste filtro.
            </p>
          {/if}
        </div>
      {/if}

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
