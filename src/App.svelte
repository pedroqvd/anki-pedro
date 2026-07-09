<script lang="ts">
  import { onMount } from "svelte";
  import { fetchCardsFromSheet, updateCardInSheet, addCardToSheet, deleteCardFromSheet, loadCachedCards, setCachedCards, getApiUrl, type Flashcard } from "./lib/googleSheets";
  import { calculateNextReview, type Grade } from "./lib/scheduler";
  import { EDITAL, getAllDisciplines, getDisciplineFromPath, parseTopic, type Area } from "./lib/edital";
  import { getStreak, recordStudyToday, getWeeklyActivity, recordCardReviewed, recordAnswer, getAccuracyRate, getWeekDayLabels } from "./lib/streak";
  import { processQueue, getPendingCount } from "./lib/offlineQueue";
  import { BookOpen, PlusCircle, Settings, Trash2, CheckCircle, Sparkles, Search, Edit2, Clock, Calendar, X, Sun, Moon, LayoutDashboard, Flame, TrendingUp, Target, WifiOff, Download, Upload } from "lucide-svelte";

  // ================= Estado Global =================
  let cards = $state<Flashcard[]>([]);
  let loading = $state(true);
  let activeTab = $state<'dashboard' | 'study' | 'add' | 'manage'>('dashboard');
  let darkMode = $state(true);
  let isOnline = $state(true);
  let isSaving = $state(false);

  // ================= Dashboard =================
  let streak = $state(0);
  let weeklyActivity = $state<number[]>([0,0,0,0,0,0,0]);
  let weekDayLabels = $state<string[]>(['Seg','Ter','Qua','Qui','Sex','Sáb','Dom']);
  let accuracyRate = $state(0);
  
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
  let currentCardIndex = $state(0);
  let showBack = $state(false);
  
  let topics = $derived(['Todos', ...new Set(cards.map(c => getDisciplineFromPath(c.topic)))]);
  let filteredCards = $derived(
    cards.filter(c => {
      const isDue = new Date(c.nextReview) <= new Date();
      const matchesTopic = selectedTopic === 'Todos' || getDisciplineFromPath(c.topic) === selectedTopic;
      return isDue && matchesTopic;
    })
  );
  let currentCard = $derived(filteredCards[currentCardIndex]);

  // ================= Aba Adicionar =================
  let newFront = $state('');
  let newBack = $state('');
  let selectedArea = $state('');
  let selectedDiscipline = $state('');
  let selectedTopicName = $state('');

  let availableDisciplines = $derived(
    EDITAL.find(a => a.name === selectedArea)?.disciplines || []
  );
  let availableTopics = $derived(
    availableDisciplines.find(d => d.name === selectedDiscipline)?.topics || []
  );

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
    // Carregar preferência de tema ou tema do sistema
    const savedTheme = localStorage.getItem('anki_theme');
    if (savedTheme === 'light') {
      darkMode = false;
    } else if (savedTheme === 'dark') {
      darkMode = true;
    } else {
      darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // Carregar gamificação
    const s = getStreak();
    streak = s.currentStreak;
    weeklyActivity = getWeeklyActivity();
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

  function toggleTheme() {
    darkMode = !darkMode;
    localStorage.setItem('anki_theme', darkMode ? 'dark' : 'light');
  }

  // ================= Lógica de Estudo =================
  async function handleAnswer(grade: Grade) {
    if (!currentCard) return;
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

  // ================= Lógica de Adição =================
  async function handleAdd() {
    if (isSaving) return;
    if (!newFront || !newBack || !selectedArea || !selectedDiscipline || !selectedTopicName) {
      showToast("Preencha todos os campos!");
      return;
    }
    isSaving = true;
    const topicPath = `${selectedArea} > ${selectedDiscipline} > ${selectedTopicName}`;
    const tempCard: Flashcard = {
      id: "temp-" + Date.now(),
      front: newFront, back: newBack, topic: topicPath,
      interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: -1
    };
    cards = [...cards, tempCard];
    saveLocal();
    const f = newFront, b = newBack, t = topicPath;
    newFront = ''; newBack = '';
    showToast('Cartão salvo localmente!');
    await addCardToSheet(f, b, t);
    await silentSync();
    isSaving = false;
  }

  // ================= Lógica de Gerenciamento =================
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
        const importedCards = JSON.parse(e.target?.result as string);
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

<main class="app-container" class:dark={darkMode} class:light={!darkMode}>
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

    <!-- ==================== DASHBOARD ==================== -->
    {:else if activeTab === 'dashboard'}
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
        <button class="btn-icon theme-toggle" onclick={toggleTheme}>
          {#if darkMode}<Sun size={22}/>{:else}<Moon size={22}/>{/if}
        </button>
      </div>

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

      <!-- Weekly Chart -->
      <div class="card">
        <h3 class="section-title">Atividade Semanal</h3>
        <div class="chart">
          {#each weeklyActivity as count, i}
            <div class="chart-bar-col">
              <div class="chart-bar" style="height: {Math.max(count * 8, 4)}px"></div>
              <span class="chart-label">{weekDayLabels[i]}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Edital Coverage -->
      <div class="card">
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

    <!-- ==================== ESTUDAR ==================== -->
    {:else if activeTab === 'study'}
      <div class="tab-header">
        <select class="input select-sm" bind:value={selectedTopic} onchange={() => {currentCardIndex = 0; showBack = false;}}>
          {#each topics as topic}
            <option value={topic}>{topic}</option>
          {/each}
        </select>
        <div class="badge">{Math.max(0, filteredCards.length - currentCardIndex)} pendentes</div>
      </div>

      {#if currentCard}
        <div class="scene">
          <div class="flashcard" class:is-flipped={showBack}>
            <div class="card-face card-front card">
              <span class="topic-tag">{getDisciplineFromPath(currentCard.topic)}</span>
              <h2 class="card-question">{currentCard.front}</h2>
              <p class="text-muted text-sm">Toque para revelar a resposta</p>
              <button class="btn-primary" onclick={() => showBack = true}>Mostrar Resposta</button>
            </div>
            <div class="card-face card-back card">
              <p class="card-answer">{currentCard.back}</p>
              <div class="grade-grid">
                <button class="btn-grade btn-err" onclick={() => handleAnswer(0)}>Errei</button>
                <button class="btn-grade btn-hard" onclick={() => handleAnswer(1)}>Difícil</button>
                <button class="btn-grade btn-good" onclick={() => handleAnswer(2)}>Bom</button>
                <button class="btn-grade btn-easy" onclick={() => handleAnswer(3)}>Fácil</button>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <div class="card center-col" style="min-height:280px">
          <Sparkles size={40}/>
          <h3>Tudo limpo!</h3>
          <p class="text-muted">Nenhuma revisão pendente para <strong>{selectedTopic}</strong>.</p>
        </div>
      {/if}

    <!-- ==================== ADICIONAR ==================== -->
    {:else if activeTab === 'add'}
      <div class="card form-container">
        <h3 class="section-title">Novo Cartão</h3>

        <label>Área</label>
        <select class="input" bind:value={selectedArea} onchange={() => { selectedDiscipline = ''; selectedTopicName = ''; }}>
          <option value="">Selecione a área...</option>
          {#each EDITAL as area}
            <option value={area.name}>{area.name}</option>
          {/each}
        </select>

        {#if selectedArea}
          <label>Disciplina</label>
          <select class="input" bind:value={selectedDiscipline} onchange={() => { selectedTopicName = ''; }}>
            <option value="">Selecione a disciplina...</option>
            {#each availableDisciplines as disc}
              <option value={disc.name}>{disc.name} ({disc.questions}q)</option>
            {/each}
          </select>
        {/if}

        {#if selectedDiscipline}
          <label>Tópico do Edital</label>
          <select class="input" bind:value={selectedTopicName}>
            <option value="">Selecione o tópico...</option>
            {#each availableTopics as topic}
              <option value={topic.name}>{topic.name}</option>
            {/each}
          </select>
        {/if}

        <label>Pergunta (Frente)</label>
        <textarea class="input" placeholder="Digite a pergunta..." bind:value={newFront}></textarea>

        <label>Resposta (Verso)</label>
        <textarea class="input" placeholder="Digite a resposta..." bind:value={newBack}></textarea>

        <button class="btn-primary" onclick={handleAdd} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar na Nuvem'}
        </button>
      </div>

    <!-- ==================== GERENCIAR ==================== -->
    {:else if activeTab === 'manage'}
      <div class="list-container">
        <div style="display: flex; gap: 10px; margin-bottom: 0.5rem;">
          <div class="search-bar" style="flex: 1">
            <Search size={18}/>
            <input class="input search-input" placeholder="Buscar..." bind:value={searchQuery} />
          </div>
          <label class="btn-icon" title="Importar Backup JSON" style="background: var(--bg-card); border: 1px solid var(--bg-card-border); cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <input type="file" accept=".json" style="display: none;" onchange={handleImport} />
            <Upload size={18} color="var(--info)" />
          </label>
          <button class="btn-icon" onclick={exportData} title="Exportar Backup JSON" style="background: var(--bg-card); border: 1px solid var(--bg-card-border);">
            <Download size={18} color="var(--info)" />
          </button>
        </div>

        {#if filteredManageCards.length === 0}
          <div class="card center-col" style="min-height:150px">
            <p class="text-muted">Nenhum cartão encontrado.</p>
          </div>
        {/if}

        {#each filteredManageCards as c (c.id)}
          <div class="card list-item">
            <div class="item-info">
              <span class="topic-tag">{getDisciplineFromPath(c.topic)}</span>
              <span class="item-front">{c.front}</span>
              <div class="item-stats">
                <span><Clock size={12}/> {c.interval}d</span>
                <span><Calendar size={12}/> {formatDate(c.nextReview)}</span>
              </div>
            </div>
            <div class="item-actions">
              <button class="btn-icon" onclick={() => editingCard = { ...c }}><Edit2 size={16}/></button>
              <button class="btn-icon btn-icon-danger" onclick={() => handleDelete(c.rowNumber, c.id)}><Trash2 size={16}/></button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Bottom Nav -->
  <nav class="bottom-nav">
    <button class:active={activeTab === 'dashboard'} onclick={() => activeTab = 'dashboard'}>
      <LayoutDashboard size={22}/><span>Painel</span>
    </button>
    <button class:active={activeTab === 'study'} onclick={() => activeTab = 'study'}>
      <BookOpen size={22}/><span>Estudar</span>
    </button>
    <button class:active={activeTab === 'add'} onclick={() => activeTab = 'add'} class="add-btn-wrap">
      <div class="add-fab"><PlusCircle size={26}/></div><span>Add</span>
    </button>
    <button class:active={activeTab === 'manage'} onclick={() => activeTab = 'manage'}>
      <Settings size={22}/><span>Gerenciar</span>
    </button>
  </nav>
</main>

<style>
  /* ================================================================
     CSS VARIABLES — THEMING SYSTEM
     ================================================================ */
  .dark {
    --bg-base: #0a0e1a;
    --bg-gradient: radial-gradient(ellipse at top left, #1a1640 0%, #0a0e1a 50%, #020617 100%);
    --bg-card: rgba(255,255,255,0.04);
    --bg-card-border: rgba(255,255,255,0.08);
    --bg-input: rgba(0,0,0,0.3);
    --bg-input-border: rgba(255,255,255,0.1);
    --bg-nav: rgba(10,14,26,0.85);
    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --accent: #8b5cf6;
    --accent-glow: rgba(139,92,246,0.25);
    --accent-text: #c4b5fd;
    --err: #ef4444; --err-bg: rgba(239,68,68,0.12); --err-text: #fca5a5;
    --warn: #f97316; --warn-bg: rgba(249,115,22,0.12); --warn-text: #fdba74;
    --ok: #10b981; --ok-bg: rgba(16,185,129,0.12); --ok-text: #6ee7b7;
    --info: #3b82f6; --info-bg: rgba(59,130,246,0.12); --info-text: #93c5fd;
    --streak-bg: rgba(249,115,22,0.1);
    --streak-border: rgba(249,115,22,0.3);
  }

  .light {
    --bg-base: #f8fafc;
    --bg-gradient: linear-gradient(160deg, #f0f4ff 0%, #f8fafc 40%, #ffffff 100%);
    --bg-card: rgba(255,255,255,0.85);
    --bg-card-border: rgba(0,0,0,0.08);
    --bg-input: rgba(0,0,0,0.04);
    --bg-input-border: rgba(0,0,0,0.12);
    --bg-nav: rgba(255,255,255,0.9);
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-muted: #94a3b8;
    --accent: #7c3aed;
    --accent-glow: rgba(124,58,237,0.15);
    --accent-text: #6d28d9;
    --err: #dc2626; --err-bg: rgba(220,38,38,0.08); --err-text: #dc2626;
    --warn: #ea580c; --warn-bg: rgba(234,88,12,0.08); --warn-text: #ea580c;
    --ok: #059669; --ok-bg: rgba(5,150,105,0.08); --ok-text: #059669;
    --info: #2563eb; --info-bg: rgba(37,99,235,0.08); --info-text: #2563eb;
    --streak-bg: rgba(249,115,22,0.08);
    --streak-border: rgba(249,115,22,0.25);
  }

  /* ================================================================
     GLOBAL RESET & TYPOGRAPHY
     ================================================================ */
  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(body) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .app-container {
    background: var(--bg-gradient);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    transition: background 0.3s, color 0.3s;
  }

  .content {
    flex: 1; overflow-y: auto;
    padding: 1.25rem;
    padding-bottom: 100px;
    max-width: 480px;
    width: 100%;
    margin: 0 auto;
  }

  /* ================================================================
     CARD — Universal Glass Card
     ================================================================ */
  .card {
    background: var(--bg-card);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--bg-card-border);
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 1rem;
    transition: background 0.3s, border 0.3s;
  }

  /* ================================================================
     INPUTS
     ================================================================ */
  .input {
    background: var(--bg-input);
    border: 1px solid var(--bg-input-border);
    color: var(--text-primary);
    border-radius: 10px;
    padding: 0.85rem 1rem;
    font-family: inherit;
    font-size: 0.95rem;
    width: 100%;
    box-sizing: border-box;
    transition: border 0.2s, background 0.3s;
    margin-bottom: 0.75rem;
  }
  .input:focus { outline: none; border-color: var(--accent); }
  .input::placeholder { color: var(--text-muted); }
  .select-sm { max-width: 200px; padding: 0.6rem 0.8rem; font-size: 0.85rem; }
  select.input option { background: var(--bg-base); color: var(--text-primary); }
  textarea.input { min-height: 90px; resize: none; }

  /* ================================================================
     TYPOGRAPHY
     ================================================================ */
  h1, h2, h3 { letter-spacing: -0.02em; }
  .text-muted { color: var(--text-muted); }
  .text-sm { font-size: 0.85rem; }
  .section-title { font-size: 1rem; font-weight: 700; margin-bottom: 1rem; }
  label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.04em; }

  /* ================================================================
     TOAST
     ================================================================ */
  .toast {
    position: fixed; top: -80px; left: 50%; transform: translateX(-50%);
    background: var(--bg-card); backdrop-filter: blur(16px);
    border: 1px solid var(--ok); padding: 10px 20px; border-radius: 50px;
    display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.9rem;
    z-index: 9999; transition: top 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3); color: var(--text-primary);
  }
  .toast-visible { top: 24px; }

  /* ================================================================
     DASHBOARD
     ================================================================ */
  .dash-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; }
  .dash-title { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.03em; margin-top: 0.15rem; }
  .theme-toggle { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }

  .streak-banner {
    background: var(--streak-bg); border: 1px solid var(--streak-border);
    border-radius: 12px; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 10px;
    font-size: 0.9rem; font-weight: 500; margin-bottom: 1rem;
  }

  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
  .stat-card { text-align: center; padding: 1rem 0.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.35rem; }
  .stat-number { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.03em; }
  .stat-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 600; }
  :global(.stat-icon) { color: var(--accent); }

  /* Chart */
  .chart { display: flex; justify-content: space-around; align-items: flex-end; height: 100px; padding-top: 1rem; }
  .chart-bar-col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .chart-bar { width: 28px; background: linear-gradient(180deg, var(--accent), rgba(139,92,246,0.3)); border-radius: 6px 6px 2px 2px; transition: height 0.5s ease; min-height: 4px; }
  .chart-label { font-size: 0.65rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }

  /* Coverage */
  .coverage-row { margin-bottom: 1rem; }
  .coverage-row:last-child { margin-bottom: 0; }
  .coverage-header { display: flex; justify-content: space-between; margin-bottom: 0.35rem; }
  .coverage-name { font-size: 0.8rem; font-weight: 600; }
  .coverage-count { font-size: 0.75rem; color: var(--text-muted); font-weight: 700; }
  .progress-track { height: 6px; background: var(--bg-input); border-radius: 99px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), #a78bfa); border-radius: 99px; transition: width 0.6s ease; }

  /* ================================================================
     STUDY TAB
     ================================================================ */
  .tab-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 1rem; }
  .badge { background: var(--accent-glow); color: var(--accent-text); padding: 5px 12px; border-radius: 50px; font-size: 0.75rem; font-weight: 700; white-space: nowrap; }

  .scene { perspective: 1200px; height: 380px; width: 100%; }
  .flashcard { width: 100%; height: 100%; position: relative; transition: transform 0.6s; transform-style: preserve-3d; }
  .is-flipped { transform: rotateY(180deg); }
  .card-face { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .card-back { transform: rotateY(180deg); }
  .card-question { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin-bottom: 1.5rem; white-space: pre-wrap; }
  .card-answer { font-size: 1.1rem; line-height: 1.6; margin-bottom: 1.5rem; color: var(--text-secondary); white-space: pre-wrap; }

  .btn-primary {
    background: linear-gradient(135deg, var(--accent), #6d28d9);
    border: none; color: white; padding: 13px 20px; border-radius: 12px;
    font-weight: 700; font-size: 0.95rem; font-family: inherit;
    cursor: pointer; width: 100%;
    box-shadow: 0 4px 16px var(--accent-glow);
    transition: transform 0.1s, opacity 0.15s;
  }
  .btn-primary:active { transform: scale(0.97); opacity: 0.9; }

  .grade-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
  .btn-grade { border: none; padding: 11px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 0.85rem; font-family: inherit; transition: transform 0.1s; }
  .btn-grade:active { transform: scale(0.95); }
  .btn-err { background: var(--err-bg); color: var(--err-text); border: 1px solid transparent; }
  .btn-hard { background: var(--warn-bg); color: var(--warn-text); border: 1px solid transparent; }
  .btn-good { background: var(--ok-bg); color: var(--ok-text); border: 1px solid transparent; }
  .btn-easy { background: var(--info-bg); color: var(--info-text); border: 1px solid transparent; }

  /* ================================================================
     FORM / ADD TAB
     ================================================================ */
  .form-container label { margin-top: 0.5rem; }

  /* ================================================================
     MANAGE TAB
     ================================================================ */
  .list-container { display: flex; flex-direction: column; gap: 0.75rem; }
  .search-bar { display: flex; align-items: center; gap: 0.5rem; background: var(--bg-input); border: 1px solid var(--bg-input-border); border-radius: 10px; padding: 0 1rem; color: var(--text-muted); }
  .search-input { border: none !important; background: transparent !important; margin-bottom: 0 !important; padding: 0.85rem 0.5rem !important; }
  .list-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem; margin-bottom: 0; }
  .item-info { display: flex; flex-direction: column; gap: 3px; overflow: hidden; flex: 1; margin-right: 10px; }
  .topic-tag { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); font-weight: 800; }
  .item-front { flex: 1; font-weight: 500; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item-stats { display: flex; gap: 10px; font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }
  .item-stats span { display: flex; align-items: center; gap: 3px; }
  .item-actions { display: flex; gap: 6px; }

  .btn-icon { background: var(--bg-input); border: none; cursor: pointer; padding: 8px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); transition: background 0.15s; }
  .btn-icon:active { opacity: 0.7; }
  .btn-icon-danger { color: var(--err); }

  .stats-row { display: flex; gap: 0.75rem; margin: 1rem 0; }
  .stat-badge { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; color: var(--text-muted); background: var(--bg-input); padding: 6px 10px; border-radius: 8px; }

  /* ================================================================
     MODAL
     ================================================================ */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); z-index: 500; display: flex; justify-content: center; align-items: center; padding: 1rem; }
  .modal-content { max-width: 400px; width: 100%; max-height: 90vh; overflow-y: auto; }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .modal-header h3 { font-weight: 700; }

  /* ================================================================
     HELPERS
     ================================================================ */
  .center-col { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; text-align: center; }
  .spinner { width: 32px; height: 32px; border: 3px solid var(--bg-input-border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ================================================================
     BOTTOM NAVIGATION
     ================================================================ */
  .bottom-nav {
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: var(--bg-nav); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    border-top: 1px solid var(--bg-card-border);
    display: flex; justify-content: space-around; align-items: center;
    padding: 0.6rem 0; padding-bottom: calc(0.6rem + env(safe-area-inset-bottom));
    z-index: 50; transition: background 0.3s, border 0.3s;
  }
  .bottom-nav button {
    background: none; border: none; color: var(--text-muted);
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    font-size: 0.65rem; font-family: inherit; font-weight: 700; cursor: pointer;
    transition: color 0.2s; text-transform: uppercase; letter-spacing: 0.03em;
    padding: 4px 0;
  }
  .bottom-nav button.active { color: var(--accent); }
  .add-btn-wrap { position: relative; }
  .add-fab {
    background: linear-gradient(135deg, var(--accent), #6d28d9);
    border-radius: 50%; padding: 10px; color: white;
    transform: translateY(-14px);
    box-shadow: 0 4px 20px var(--accent-glow);
    border: 3px solid var(--bg-base);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .add-btn-wrap.active .add-fab { transform: translateY(-18px) scale(1.08); }

  /* ================================================================
     RESPONSIVE
     ================================================================ */
  @media (max-width: 380px) {
    .stat-grid { grid-template-columns: 1fr; }
    .stat-number { font-size: 1.2rem; }
  }
</style>
