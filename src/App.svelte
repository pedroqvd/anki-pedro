<script lang="ts">
  import { onMount } from "svelte";
  import { fetchCardsFromSheet, updateCardInSheet, addCardToSheet, deleteCardFromSheet, type Flashcard } from "./lib/googleSheets";
  import { calculateNextReview, type Grade } from "./lib/scheduler";
  import { BookOpen, PlusCircle, Settings, Trash2, CheckCircle, Sparkles, Search, Edit2, Clock, Calendar, X } from "lucide-svelte";

  let cards = $state<Flashcard[]>([]);
  let loading = $state(true);
  
  // Tabs: 'study' | 'add' | 'manage'
  let activeTab = $state<'study' | 'add' | 'manage'>('study');

  // ================= Aba Estudar =================
  let selectedTopic = $state<string>('Todos');
  let currentCardIndex = $state(0);
  let showBack = $state(false);
  
  let topics = $derived(['Todos', ...new Set(cards.map(c => c.topic))]);
  let filteredCards = $derived(
    cards.filter(c => selectedTopic === 'Todos' || c.topic === selectedTopic)
  );
  let currentCard = $derived(filteredCards[currentCardIndex]);

  // ================= Aba Adicionar =================
  let newFront = $state('');
  let newBack = $state('');
  let newTopic = $state('');

  // ================= Aba Gerenciar =================
  let searchQuery = $state('');
  let filteredManageCards = $derived(
    cards.filter(c => 
      c.front.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.back.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.topic.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let editingCard = $state<Flashcard | null>(null);

  // ================= Toast System =================
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
  onMount(async () => {
    loading = true;
    const data = await fetchCardsFromSheet();
    cards = data || [];
    loading = false;
  });

  async function silentSync() {
    const data = await fetchCardsFromSheet();
    if (data && data.length > 0) cards = data;
  }

  // ================= Lógica =================
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
    if (currentCardIndex >= filteredCards.length) showToast("Fim das revisões deste tópico!");
    
    updateCardInSheet(cardToUpdate); 
  }

  async function handleAdd() {
    if (!newFront || !newBack || !newTopic) {
      showToast("Preencha todos os campos!");
      return;
    }
    const tempCard: Flashcard = {
      id: "temp-" + Date.now(),
      front: newFront, back: newBack, topic: newTopic,
      interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: -1
    };
    cards = [...cards, tempCard];
    const f = newFront, b = newBack, t = newTopic;
    newFront = ''; newBack = '';
    showToast('Cartão salvo na nuvem!');
    
    await addCardToSheet(f, b, t);
    silentSync();
  }

  async function handleDelete(rowNumber: number, id: string) {
    cards = cards.filter(c => c.id !== id);
    showToast('Cartão deletado!');
    if (rowNumber !== -1) {
      await deleteCardFromSheet(rowNumber);
      silentSync();
    }
  }

  async function saveEdit() {
    if(!editingCard) return;
    const idx = cards.findIndex(c => c.id === editingCard!.id);
    if(idx !== -1) cards[idx] = { ...editingCard };
    
    const cardToUpdate = { ...editingCard };
    editingCard = null;
    showToast('Cartão atualizado!');
    
    if (cardToUpdate.rowNumber !== -1) {
      await updateCardInSheet(cardToUpdate);
      silentSync();
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
  }
</script>

<main class="app-container dark-theme">
  <!-- Toast Notification -->
  <div class="toast" class:toast-visible={toastVisible}>
    <CheckCircle size={20} color="#10b981" />
    <span>{toastMessage}</span>
  </div>

  <!-- Edit Modal -->
  {#if editingCard}
    <div class="modal-backdrop">
      <div class="glass-card modal-content">
        <div class="modal-header">
          <h3>Editar Cartão</h3>
          <button class="btn-icon" onclick={() => editingCard = null}><X size={24} color="white"/></button>
        </div>
        <label>Tópico</label>
        <input class="glass-input" bind:value={editingCard.topic} />
        <label>Pergunta</label>
        <textarea class="glass-input" bind:value={editingCard.front}></textarea>
        <label>Resposta</label>
        <textarea class="glass-input" bind:value={editingCard.back}></textarea>
        
        <div class="stats-row mt-4 mb-4">
          <div class="stat"><Clock size={16}/> Intervalo: {editingCard.interval}d</div>
          <div class="stat"><Calendar size={16}/> Revisão: {formatDate(editingCard.nextReview)}</div>
        </div>

        <button class="btn-primary" onclick={saveEdit}>Salvar Alterações</button>
      </div>
    </div>
  {/if}

  <div class="content">
    {#if loading}
      <div class="glass-card loading-skeleton">
        <Sparkles size={32} class="spin-anim" color="#8b5cf6" />
        <p>Sincronizando com a Nuvem...</p>
      </div>
    {:else if activeTab === 'study'}
      <div class="header">
        <div class="select-wrapper">
          <select bind:value={selectedTopic} onchange={() => {currentCardIndex = 0; showBack = false;}}>
            {#each topics as topic}
              <option value={topic}>{topic}</option>
            {/each}
          </select>
        </div>
        <div class="badge">
          {filteredCards.length - currentCardIndex} Pendentes
        </div>
      </div>

      {#if currentCard}
        <div class="scene">
          <div class="flashcard" class:is-flipped={showBack}>
            <div class="card-face card-front glass-card">
              <h2>{currentCard.front}</h2>
              <div class="hint-text">Toque no botão abaixo para revelar</div>
              <button class="btn-primary" onclick={() => showBack = true}>Mostrar Resposta</button>
            </div>
            
            <div class="card-face card-back glass-card">
              <p class="answer-text">{currentCard.back}</p>
              <div class="actions">
                <button class="btn-grade btn-err" onclick={() => handleAnswer(0)}>Errei</button>
                <button class="btn-grade btn-hard" onclick={() => handleAnswer(1)}>Difícil</button>
                <button class="btn-grade btn-good" onclick={() => handleAnswer(2)}>Bom</button>
                <button class="btn-grade btn-easy" onclick={() => handleAnswer(3)}>Fácil</button>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <div class="glass-card empty-state">
          <Sparkles size={48} color="#f59e0b" />
          <h3>Tudo limpo!</h3>
          <p>Você finalizou todas as revisões do tópico <strong>{selectedTopic}</strong> por hoje.</p>
        </div>
      {/if}

    {:else if activeTab === 'add'}
      <div class="glass-card form-container">
        <h3>Criar Novo Cartão</h3>
        <label>Tópico</label>
        <input class="glass-input" placeholder="Ex: Biologia" bind:value={newTopic} />
        <label>Pergunta (Frente)</label>
        <textarea class="glass-input" placeholder="Digite a pergunta..." bind:value={newFront}></textarea>
        <label>Resposta (Verso)</label>
        <textarea class="glass-input" placeholder="Digite a resposta oculta..." bind:value={newBack}></textarea>
        <button class="btn-primary mt-4" onclick={handleAdd}>Salvar na Nuvem</button>
      </div>

    {:else if activeTab === 'manage'}
      <div class="list-container">
        <div class="search-bar">
          <Search size={20} color="#94a3b8" />
          <input class="glass-input search-input" placeholder="Buscar pergunta, resposta ou tópico..." bind:value={searchQuery} />
        </div>

        {#if filteredManageCards.length === 0}
          <div class="glass-card empty-state">
            <p class="text-gray-400">Nenhum cartão encontrado.</p>
          </div>
        {/if}

        {#each filteredManageCards as c (c.id)}
          <div class="list-item glass-card">
            <div class="item-info">
              <span class="topic-tag">{c.topic}</span>
              <span class="item-front">{c.front}</span>
              <div class="item-stats">
                <span title="Intervalo de Repetição"><Clock size={12}/> {c.interval}d</span>
                <span title="Próxima Revisão"><Calendar size={12}/> {formatDate(c.nextReview)}</span>
              </div>
            </div>
            <div class="item-actions">
              <button class="btn-icon" onclick={() => editingCard = { ...c }}>
                <Edit2 size={18} color="#60a5fa" />
              </button>
              <button class="btn-icon" onclick={() => handleDelete(c.rowNumber, c.id)}>
                <Trash2 size={18} color="#ef4444" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <nav class="bottom-nav glass-nav">
    <button class:active={activeTab === 'study'} onclick={() => activeTab = 'study'}>
      <BookOpen size={24} /><span>Estudar</span>
    </button>
    <button class:active={activeTab === 'add'} onclick={() => activeTab = 'add'} class="add-btn">
      <div class="add-circle"><PlusCircle size={28} /></div><span>Add</span>
    </button>
    <button class:active={activeTab === 'manage'} onclick={() => activeTab = 'manage'}>
      <Settings size={24} /><span>Gerenciar</span>
    </button>
  </nav>
</main>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  :global(body) { margin: 0; font-family: 'Inter', sans-serif; background-color: #0f172a; color: #f8fafc; }
  .dark-theme { background: radial-gradient(circle at top left, #1e1b4b, #0f172a 40%, #020617); }
  .app-container { display: flex; flex-direction: column; min-height: 100vh; }
  .content { flex: 1; overflow-y: auto; padding: 1.5rem; padding-bottom: 100px; display: flex; flex-direction: column; align-items: center; }

  .glass-card {
    background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
    width: 100%; max-width: 400px; padding: 1.5rem; box-sizing: border-box;
  }
  .glass-input {
    background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.1); color: white; border-radius: 12px;
    padding: 1rem; font-family: inherit; font-size: 1rem; width: 100%; box-sizing: border-box; transition: border 0.2s;
  }
  .glass-input:focus { outline: none; border: 1px solid #8b5cf6; }
  .glass-input::placeholder { color: rgba(255,255,255,0.3); }

  .toast {
    position: fixed; top: -100px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(10px); border: 1px solid rgba(16, 185, 129, 0.5); padding: 12px 24px; border-radius: 30px;
    display: flex; align-items: center; gap: 8px; font-weight: 500; z-index: 1000; transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
  }
  .toast-visible { top: 20px; }

  .header { width: 100%; max-width: 400px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
  .select-wrapper select { background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 12px; font-family: inherit; font-size: 0.9rem; outline: none; }
  .select-wrapper select option { background: #0f172a; }
  .badge { background: rgba(139, 92, 246, 0.2); color: #c4b5fd; padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; border: 1px solid rgba(139, 92, 246, 0.3); }

  .scene { width: 100%; max-width: 400px; perspective: 1000px; min-height: 350px; }
  .flashcard { width: 100%; height: 100%; position: relative; transition: transform 0.6s; transform-style: preserve-3d; }
  .is-flipped { transform: rotateY(180deg); }
  .card-face { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .card-back { transform: rotateY(180deg); }
  .card-front h2 { font-size: 1.8rem; font-weight: 600; line-height: 1.3; margin-bottom: 2rem;}
  .hint-text { font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 2rem; }
  .answer-text { font-size: 1.2rem; line-height: 1.5; margin-bottom: 2rem; color: #e2e8f0; }

  .btn-primary { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); border: none; color: white; padding: 14px 24px; border-radius: 14px; font-weight: 600; font-size: 1rem; font-family: inherit; cursor: pointer; width: 100%; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3); transition: transform 0.1s, opacity 0.2s; }
  .btn-primary:active { transform: scale(0.97); opacity: 0.9; }
  .mt-4 { margin-top: 1rem; } .mb-4 { margin-bottom: 1rem; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
  .btn-grade { border: none; padding: 12px; border-radius: 12px; font-weight: 600; color: white; cursor: pointer; font-size: 0.9rem; transition: transform 0.1s; }
  .btn-grade:active { transform: scale(0.95); }
  .btn-err { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
  .btn-hard { background: rgba(249, 115, 22, 0.2); color: #fdba74; border: 1px solid rgba(249, 115, 22, 0.3); }
  .btn-good { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.3); }
  .btn-easy { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); }

  .form-container label, .modal-content label { display: block; width: 100%; text-align: left; margin-bottom: 0.5rem; font-size: 0.85rem; color: #cbd5e1; font-weight: 500; }
  .form-container textarea, .modal-content textarea { min-height: 100px; resize: none; }

  /* Modal */
  .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); z-index: 100; display: flex; justify-content: center; align-items: center; padding: 1rem; box-sizing: border-box; }
  .modal-content { max-height: 90vh; overflow-y: auto; position: relative; }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .modal-header h3 { margin: 0; }

  /* Manage List */
  .list-container { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 12px; }
  .search-bar { display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0 1rem; }
  .search-input { border: none; background: transparent; padding: 1rem 0.5rem; }
  .search-input:focus { border: none; }
  .list-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem; }
  .item-info { display: flex; flex-direction: column; gap: 4px; overflow: hidden; flex: 1; margin-right: 10px; }
  .topic-tag { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: #8b5cf6; font-weight: 700; }
  .item-front { font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-stats { display: flex; gap: 10px; font-size: 0.7rem; color: #94a3b8; margin-top: 4px; }
  .item-stats span { display: flex; align-items: center; gap: 4px; }
  .item-actions { display: flex; gap: 8px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;}

  .stats-row { display: flex; gap: 1rem; justify-content: space-between; font-size: 0.85rem; color: #94a3b8;}
  .stat { display: flex; align-items: center; gap: 6px; }

  .empty-state, .loading-skeleton { text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; min-height: 250px;}
  .spin-anim { animation: spin 2s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }

  .glass-nav { position: fixed; bottom: 0; left: 0; width: 100%; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-around; align-items: center; padding: 1rem 0; padding-bottom: calc(1rem + env(safe-area-inset-bottom)); z-index: 50; }
  .bottom-nav button { background: none; border: none; color: #64748b; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 0.75rem; font-family: inherit; font-weight: 600; cursor: pointer; transition: color 0.2s; }
  .bottom-nav button.active { color: #a78bfa; }
  .add-btn { position: relative; }
  .add-circle { background: linear-gradient(135deg, #8b5cf6, #6d28d9); border-radius: 50%; padding: 10px; color: white; transform: translateY(-20px); box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4); border: 4px solid #0f172a; transition: transform 0.2s; }
  .add-btn.active .add-circle { transform: translateY(-25px) scale(1.1); }
</style>
