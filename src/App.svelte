<script lang="ts">
  import { onMount } from "svelte";
  import { fetchCardsFromSheet, updateCardInSheet, addCardToSheet, deleteCardFromSheet, type Flashcard } from "./lib/googleSheets";
  import { calculateNextReview, type Grade } from "./lib/scheduler";

  let cards = $state<Flashcard[]>([]);
  let loading = $state(true);
  
  // Tabs: 'study' | 'add' | 'manage'
  let activeTab = $state<'study' | 'add' | 'manage'>('study');

  // Aba Estudar
  let selectedTopic = $state<string>('Todos');
  let currentCardIndex = $state(0);
  let showBack = $state(false);
  
  // Derivados Aba Estudar
  let topics = $derived(['Todos', ...new Set(cards.map(c => c.topic))]);
  let filteredCards = $derived(
    cards.filter(c => selectedTopic === 'Todos' || c.topic === selectedTopic)
  );
  let currentCard = $derived(filteredCards[currentCardIndex]);

  // Aba Adicionar
  let newFront = $state('');
  let newBack = $state('');
  let newTopic = $state('');

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    cards = await fetchCardsFromSheet();
    loading = false;
  }

  // Ações de Estudo
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

    await updateCardInSheet(currentCard);
    
    showBack = false;
    currentCardIndex++;
  }

  // Ações de Adição
  async function handleAdd() {
    if (!newFront || !newBack || !newTopic) return;
    await addCardToSheet(newFront, newBack, newTopic);
    newFront = '';
    newBack = '';
    alert('Cartão adicionado com sucesso!');
    await loadData(); // Recarrega
  }

  // Ações de Gerenciamento
  async function handleDelete(rowNumber: number) {
    if (!confirm('Deletar este cartão permanentemente?')) return;
    await deleteCardFromSheet(rowNumber);
    await loadData();
  }
</script>

<main class="app-container">
  <div class="content">
    {#if loading}
      <div class="card"><p>Sincronizando...</p></div>
    {:else if activeTab === 'study'}
      <div class="header">
        <select bind:value={selectedTopic} onchange={() => {currentCardIndex = 0; showBack = false;}}>
          {#each topics as topic}
            <option value={topic}>{topic}</option>
          {/each}
        </select>
        <p class="count">{filteredCards.length - currentCardIndex} restantes</p>
      </div>

      {#if currentCard}
        <div class="card reviewer">
          <div class="front"><h2>{currentCard.front}</h2></div>
          {#if showBack}
            <div class="divider"></div>
            <div class="back"><p>{currentCard.back}</p></div>
            <div class="actions">
              <button class="btn-err" onclick={() => handleAnswer(0)}>Errei (1d)</button>
              <button class="btn-hard" onclick={() => handleAnswer(1)}>Difícil</button>
              <button class="btn-good" onclick={() => handleAnswer(2)}>Bom</button>
              <button class="btn-easy" onclick={() => handleAnswer(3)}>Fácil</button>
            </div>
          {:else}
            <button class="btn-show" onclick={() => showBack = true}>Mostrar Resposta</button>
          {/if}
        </div>
      {:else}
        <div class="card"><p>🎉 Parabéns! Você finalizou o tópico: {selectedTopic}.</p></div>
      {/if}

    {:else if activeTab === 'add'}
      <div class="card form">
        <h2>Novo Cartão</h2>
        <input placeholder="Tópico (ex: Inglês)" bind:value={newTopic} />
        <textarea placeholder="Pergunta (Frente)" bind:value={newFront}></textarea>
        <textarea placeholder="Resposta (Verso)" bind:value={newBack}></textarea>
        <button class="btn-save" onclick={handleAdd}>Salvar na Nuvem</button>
      </div>

    {:else if activeTab === 'manage'}
      <div class="list">
        {#each cards as c}
          <div class="list-item">
            <div>
              <strong>[{c.topic}]</strong> {c.front}
            </div>
            <button class="btn-delete" onclick={() => handleDelete(c.rowNumber)}>🗑️</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <nav class="bottom-nav">
    <button class:active={activeTab === 'study'} onclick={() => activeTab = 'study'}>📖 Estudar</button>
    <button class:active={activeTab === 'add'} onclick={() => activeTab = 'add'}>➕ Add</button>
    <button class:active={activeTab === 'manage'} onclick={() => activeTab = 'manage'}>⚙️ Gerenciar</button>
  </nav>
</main>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: #f3f4f6;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    padding-bottom: 80px; /* espaco pra nav */
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .bottom-nav {
    position: fixed;
    bottom: 0; width: 100%;
    background: white;
    display: flex;
    justify-content: space-around;
    padding: 1rem 0;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
  }
  .bottom-nav button {
    background: none; color: #9ca3af;
    border: none; font-size: 1rem; font-weight: bold;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .bottom-nav button.active {
    color: #3b82f6;
  }
  .header { width: 100%; max-width: 400px; display: flex; justify-content: space-between; margin-bottom: 1rem; }
  select { padding: 0.5rem; border-radius: 8px; border: 1px solid #d1d5db; }
  
  .card {
    background: white; padding: 1.5rem; border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); width: 100%; max-width: 400px;
    text-align: center;
  }
  .front h2 { font-size: 1.3rem; color: #1f2937; }
  .divider { height: 1px; background-color: #e5e7eb; margin: 1rem 0; }
  
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 1rem; }
  button { padding: 0.75rem; border: none; border-radius: 8px; font-weight: bold; color: white; cursor: pointer; }
  .btn-show { width: 100%; background-color: #3b82f6; margin-top: 1rem; }
  .btn-err { background-color: #ef4444; } .btn-hard { background-color: #f97316; }
  .btn-good { background-color: #22c55e; } .btn-easy { background-color: #3b82f6; }
  
  /* Form Adicionar */
  .form input, .form textarea { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #d1d5db; border-radius: 8px; box-sizing: border-box; }
  .btn-save { width: 100%; background-color: #10b981; }
  
  /* Listagem */
  .list { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 0.5rem; }
  .list-item { background: white; padding: 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .btn-delete { background-color: #ef4444; padding: 0.5rem; }
</style>
