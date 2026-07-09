<script lang="ts">
  import { onMount } from "svelte";
  import { fetchCardsFromSheet, updateCardInSheet, type Flashcard } from "./lib/googleSheets";
  import { calculateNextReview, type Grade } from "./lib/scheduler";

  let cards = $state<Flashcard[]>([]);
  let currentCardIndex = $state(0);
  let showBack = $state(false);
  let loading = $state(true);

  // Derived state to get the current card
  let currentCard = $derived(cards[currentCardIndex]);

  onMount(async () => {
    // Busca as cartas simuladas (ou do Google Sheets futuramente)
    cards = await fetchCardsFromSheet();
    loading = false;
  });

  async function handleAnswer(grade: Grade) {
    if (!currentCard) return;

    // 1. Calcula o espaçamento novo usando nosso scheduler (SM-2)
    const { interval, ease, nextReview } = calculateNextReview({
      interval: currentCard.interval,
      ease: currentCard.ease,
      nextReview: new Date(currentCard.nextReview)
    }, grade);

    // 2. Atualiza a carta na memória
    currentCard.interval = interval;
    currentCard.ease = ease;
    currentCard.nextReview = nextReview.toISOString();

    // 3. Manda salvar no Google Sheets
    await updateCardInSheet(currentCard);

    // 4. Passa para o próximo cartão e esconde o verso
    showBack = false;
    currentCardIndex++;
  }
</script>

<main class="container">
  {#if loading}
    <div class="card"><p>Sincronizando com Google Sheets...</p></div>
  {:else if currentCard}
    <div class="card reviewer">
      <div class="front">
        <h2>{currentCard.front}</h2>
      </div>

      {#if showBack}
        <div class="divider"></div>
        <div class="back">
          <p>{currentCard.back}</p>
        </div>
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
    <div class="card"><p>🎉 Parabéns! Nenhuma revisão pendente para hoje.</p></div>
  {/if}
</main>

<style>
  .container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background-color: #f3f4f6;
    padding: 1rem;
  }
  .card {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    text-align: center;
    width: 100%;
    max-width: 400px;
  }
  .front h2 {
    font-size: 1.5rem;
    color: #1f2937;
  }
  .divider {
    height: 1px;
    background-color: #e5e7eb;
    margin: 1.5rem 0;
  }
  .back p {
    font-size: 1.125rem;
    color: #4b5563;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    margin-top: 2rem;
  }
  button {
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
    color: white;
  }
  button:active {
    opacity: 0.8;
  }
  .btn-show {
    width: 100%;
    margin-top: 1.5rem;
    background-color: #3b82f6;
  }
  .btn-err { background-color: #ef4444; }
  .btn-hard { background-color: #f97316; }
  .btn-good { background-color: #22c55e; }
  .btn-easy { background-color: #3b82f6; }
</style>
