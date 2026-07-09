<script lang="ts">
  import { calculateNextReview, type Grade } from '../lib/scheduler';
  import { getDisciplineFromPath } from '../lib/edital';
  import type { Flashcard } from '../lib/googleSheets';
  import { marked } from 'marked';
  import { Zap, Timer, RotateCcw, Volume2, Sparkles } from 'lucide-svelte';

  let { 
    cards = $bindable(), 
    onAnswer, 
    onUndo, 
    showToast 
  } = $props<{
    cards: Flashcard[];
    onAnswer: (card: Flashcard, grade: Grade) => void;
    onUndo: (oldCard: Flashcard) => void;
    showToast: (msg: string) => void;
  }>();

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
  
  $effect(() => {
    if (currentCardIndex >= filteredCards.length && filteredCards.length > 0) {
      currentCardIndex = Math.max(0, filteredCards.length - 1);
    }
  });
  
  let currentCard = $derived(filteredCards[currentCardIndex]);

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
          showToast("🍅 Pomodoro concluído! Hora de uma pausa.");
          // Play sound
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log(e));
        }
      }, 1000);
    }
  }

  function resetPomodoro() {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
    pomodoroActive = false;
    pomodoroTime = 25 * 60;
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

  function getProjectedInterval(grade: Grade): string {
    if (!currentCard) return '';
    const res = calculateNextReview({
      interval: currentCard.interval,
      ease: currentCard.ease,
      nextReview: new Date(currentCard.nextReview)
    }, grade);
    
    if (res.interval === 0) return '<1d';
    return `${res.interval}d`;
  }

  async function handleAnswer(grade: Grade) {
    if (!currentCard) return;
    
    lastAnswered = { cardIndex: currentCardIndex, oldState: { ...currentCard } };

    const { interval, ease, nextReview } = calculateNextReview({
      interval: currentCard.interval,
      ease: currentCard.ease,
      nextReview: new Date(currentCard.nextReview)
    }, grade);

    // Update locally instantly for UI responsiveness
    let cardRef = cards.find(c => c.id === currentCard.id);
    if (cardRef) {
      cardRef.interval = interval;
      cardRef.ease = ease;
      cardRef.nextReview = nextReview.toISOString();
    }

    showBack = false;
    currentCardIndex++;
    
    onAnswer(cardRef!, grade);
    
    if (currentCardIndex >= filteredCards.length) {
      showToast("Revisões concluídas! 🎉");
    }
  }

  async function undoLastAnswer() {
    if (!lastAnswered) return;
    const { cardIndex, oldState } = lastAnswered;
    
    let cardRef = cards.find(c => c.id === oldState.id);
    if (cardRef) {
      Object.assign(cardRef, oldState);
    }
    
    currentCardIndex = cardIndex;
    showBack = false;
    
    onUndo(oldState);
    lastAnswered = null;
  }

  // ================= Atalhos de Teclado =================
  function handleKeydown(e: KeyboardEvent) {
    if (activeElementIsInput()) return; // não disparar se tiver digitando no input de busca

    if (!showBack) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        showBack = true;
      }
    } else {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleAnswer(2); // Bom
      } else if (e.key === '1') {
        handleAnswer(0); // Errei
      } else if (e.key === '2') {
        handleAnswer(1); // Difícil
      } else if (e.key === '3') {
        handleAnswer(2); // Bom
      } else if (e.key === '4') {
        handleAnswer(3); // Fácil
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoLastAnswer();
      }
    }
  }

  function activeElementIsInput() {
    const active = document.activeElement;
    return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
  }
</script>

<svelte:window onkeydown={handleKeydown} />

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

<div style="display:flex; justify-content:center; gap: 10px; margin-bottom: 25px;">
  <button class="pomodoro-pill" class:active={pomodoroActive} onclick={togglePomodoro}>
    <Timer size={16}/> {pomodoroFormatted}
  </button>
  {#if pomodoroTime !== 25 * 60}
    <button class="btn-icon" style="background: var(--bg-card);" onclick={resetPomodoro} title="Resetar Pomodoro"><RotateCcw size={16}/></button>
  {/if}
</div>

{#if currentCard}
  <div class="scene">
    <div class="flashcard" class:is-flipped={showBack} ontouchstart={handleTouchStart} ontouchmove={handleTouchMove} ontouchend={handleTouchEnd} style={showBack && swipeOffset !== 0 ? `transform: rotateY(180deg) translateX(${swipeOffset}px) rotate(${swipeOffset/15}deg); transition: none;` : ''}>
      
      <!-- FRENTE -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="card-face card-front card" onclick={() => showBack = true} style="cursor: pointer;">
        <span class="topic-tag">{getDisciplineFromPath(currentCard.topic)}</span>
        <div class="card-question">
          {#if currentCard.front.match(/^[a-eA-E]\) /mi)}
            {@html marked.parse(currentCard.front).replace(/([a-eA-E]\) .*)/gi, '<div class="alt-bubble">$1</div>')}
          {:else}
            {@html marked.parse(currentCard.front.replace(/\{\{(.*?)\}\}/g, '<span class="cloze-blank">[...]</span>'))}
          {/if}
        </div>
        
        <button class="btn-icon tts-btn" onclick={(e) => { e.stopPropagation(); readText(currentCard.front.replace(/\{\{(.*?)\}\}/g, '')); }} title="Ouvir Pergunta">
          <Volume2 size={20}/>
        </button>
        
        <div class="card-footer-hint">
          <p class="text-muted text-sm">Toque no botão para revelar a resposta</p>
          <button class="btn-reveal" onclick={() => showBack = true}>Mostrar Resposta</button>
        </div>
      </div>

      <!-- VERSO -->
      <div class="card-face card-back card">
        <div class="card-answer">
          {#if currentCard.front.includes('{{')}
            <div class="cloze-reveal">
              {@html marked.parse(currentCard.front.replace(/\{\{(.*?)\}\}/g, '<span class="cloze-highlight">$1</span>'))}
            </div>
            <hr class="divider" />
          {/if}
          {@html marked.parse(currentCard.back)}
        </div>
        
        <button class="btn-icon tts-btn" onclick={(e) => { e.stopPropagation(); readText(currentCard.back); }} title="Ouvir Resposta">
          <Volume2 size={20}/>
        </button>
        
        <div class="grade-grid">
          <button class="btn-grade btn-err" onclick={() => handleAnswer(0)}>
            <span>Errei</span>
            <small>{getProjectedInterval(0)}</small>
          </button>
          <button class="btn-grade btn-hard" onclick={() => handleAnswer(1)}>
            <span>Difícil</span>
            <small>{getProjectedInterval(1)}</small>
          </button>
          <button class="btn-grade btn-good" onclick={() => handleAnswer(2)}>
            <span>Bom</span>
            <small>{getProjectedInterval(2)}</small>
          </button>
          <button class="btn-grade btn-easy" onclick={() => handleAnswer(3)}>
            <span>Fácil</span>
            <small>{getProjectedInterval(3)}</small>
          </button>
        </div>
        
        {#if lastAnswered}
          <div style="display: flex; justify-content: center; margin-top: 15px;">
            <button class="btn-undo" onclick={(e) => { e.stopPropagation(); undoLastAnswer(); }} title="Desfazer nota do último cartão">
              <RotateCcw size={14}/> Desfazer Último
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <div class="card center-col empty-state">
    <Sparkles size={40} color="var(--accent)"/>
    <h3 style="margin: 10px 0 5px 0;">Tudo limpo!</h3>
    <p class="text-muted">Nenhuma revisão pendente para <strong>{selectedTopic}</strong>.</p>
    {#if cards.some(c => c.interval === -1 && (selectedTopic === 'Todos' || getDisciplineFromPath(c.topic) === selectedTopic))}
      <p class="text-muted text-sm" style="color: var(--warn); margin-top: 10px; font-weight: 600;">
        Aviso: Você possui cartões pausados neste filtro.
      </p>
    {/if}
  </div>
{/if}

<style>
  .scene {
    perspective: 1200px;
    width: 100%;
    margin: 0 auto;
  }
  
  .flashcard {
    position: relative;
    width: 100%;
    display: grid;
    transform-style: preserve-3d;
    transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  
  .flashcard.is-flipped {
    transform: rotateY(180deg);
  }
  
  .card-face {
    grid-area: 1 / 1;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.03);
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  
  .card-back {
    transform: rotateY(180deg);
  }

  .topic-tag {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--accent);
    font-weight: 800;
    margin-bottom: 12px;
    align-self: flex-start;
  }

  .card-question {
    font-size: 1.15rem;
    font-weight: 500;
    line-height: 1.6;
    color: var(--text-primary);
    flex-grow: 1;
  }

  .alt-bubble {
    padding: 10px 14px;
    margin: 6px 0;
    border: 1px solid var(--bg-card-border);
    border-radius: 12px;
    background: var(--bg-input);
    font-size: 1rem;
    transition: border-color 0.2s;
  }
  
  .cloze-blank {
    color: var(--accent);
    font-weight: 700;
    background: var(--accent-glow);
    padding: 2px 6px;
    border-radius: 6px;
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .cloze-highlight {
    color: var(--accent);
    font-weight: 700;
    background: rgba(139, 92, 246, 0.15);
    padding: 2px 6px;
    border-radius: 6px;
    border-bottom: 2px solid var(--accent);
  }

  .card-footer-hint {
    margin-top: 30px;
    text-align: center;
  }
  
  .btn-reveal {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 12px 24px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    margin-top: 10px;
    width: 100%;
    box-shadow: 0 4px 15px var(--accent-glow);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .btn-reveal:active { transform: scale(0.98); box-shadow: 0 2px 5px var(--accent-glow); }

  .card-answer {
    font-size: 1.1rem;
    line-height: 1.6;
    color: var(--text-primary);
    flex-grow: 1;
    margin-bottom: 20px;
  }

  .divider {
    border: none;
    height: 1px;
    background: var(--bg-card-border);
    margin: 15px 0;
  }

  .grade-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 10px;
  }

  .btn-grade {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px 4px;
    border: none;
    border-radius: 12px;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: transform 0.15s, filter 0.15s;
    color: white;
  }
  .btn-grade:active { transform: scale(0.92); }
  .btn-grade small {
    font-size: 0.7rem;
    font-weight: 500;
    opacity: 0.9;
    margin-top: 2px;
  }

  .btn-err { background: var(--err); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2); }
  .btn-hard { background: var(--warn); box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2); }
  .btn-good { background: var(--ok); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2); }
  .btn-easy { background: var(--info); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2); }

  .pomodoro-pill {
    background: var(--bg-card);
    color: var(--text-primary);
    border: 1px solid var(--bg-card-border);
    border-radius: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 600;
    padding: 8px 16px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.03);
    transition: all 0.2s;
  }
  .pomodoro-pill.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    box-shadow: 0 4px 15px var(--accent-glow);
  }

  .btn-undo {
    background: var(--bg-input);
    color: var(--text-secondary);
    border: 1px solid var(--bg-card-border);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-undo:hover { background: var(--bg-card-border); color: var(--text-primary); }

  .tts-btn { position: absolute; top: 15px; right: 15px; background: var(--bg-input); }
  
  .empty-state { min-height: 280px; justify-content: center; border-style: dashed; }
</style>
