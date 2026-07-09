<script lang="ts">
  import { EDITAL } from '../lib/edital';

  interface FlashcardBase {
    id: string;
    front: string;
    back: string;
    topic: string;
    interval: number;
    ease: number;
    nextReview: string;
    rowNumber: number;
  }

  let { onSave, isSaving, showToast } = $props<{ 
    onSave: (cardsToAdd: FlashcardBase[]) => void, 
    isSaving: boolean,
    showToast: (msg: string) => void
  }>();

  let addMode = $state<'single'|'errorBook'|'bulk'>('single');
  let newFront = $state('');
  let newBack = $state('');
  let errorQuestion = $state('');
  let errorMistake = $state('');
  let errorTheory = $state('');
  let bulkText = $state('');
  let createReversed = $state(false);
  let selectedArea = $state('');
  let selectedDiscipline = $state('');
  let selectedTopicName = $state('');

  let availableDisciplines = $derived(
    EDITAL.find(a => a.name === selectedArea)?.disciplines || []
  );
  let availableTopics = $derived(
    availableDisciplines.find(d => d.name === selectedDiscipline)?.topics || []
  );

  function submit() {
    if (isSaving) return;
    if (!selectedArea || !selectedDiscipline || !selectedTopicName) {
      showToast("Selecione o tópico do edital!");
      return;
    }
    
    const topicPath = `${selectedArea} > ${selectedDiscipline} > ${selectedTopicName}`;
    const cardsToAdd: FlashcardBase[] = [];

    if (addMode === 'single') {
      if (!newFront || !newBack) {
        showToast("Preencha Frente e Verso!");
        return;
      }
      cardsToAdd.push({
        id: "temp-" + Date.now() + Math.random(),
        front: newFront, back: newBack, topic: topicPath,
        interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: -1
      });
      if (createReversed) {
        cardsToAdd.push({
          id: "temp-" + Date.now() + Math.random(),
          front: newBack, back: newFront, topic: topicPath,
          interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: -1
        });
      }
    } else if (addMode === 'errorBook') {
      if (!errorQuestion || !errorMistake || !errorTheory) {
        showToast("Preencha todos os campos do Caderno de Erros!");
        return;
      }
      const backContent = `**Onde eu errei:**\n${errorMistake}\n\n**Teoria / Justificativa:**\n${errorTheory}`;
      cardsToAdd.push({
        id: "temp-" + Date.now() + Math.random(),
        front: errorQuestion, back: backContent, topic: topicPath,
        interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: -1
      });
    } else {
      if (!bulkText) {
        showToast("Cole o texto para adição em lote!");
        return;
      }
      const lines = bulkText.split('\n');
      for (const line of lines) {
        if (line.includes('===')) {
          const [f, b] = line.split('===');
          if (f.trim() && b.trim()) {
            cardsToAdd.push({
              id: "temp-" + Date.now() + Math.random(),
              front: f.trim(), back: b.trim(), topic: topicPath,
              interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: -1
            });
            if (createReversed) {
              cardsToAdd.push({
                id: "temp-" + Date.now() + Math.random(),
                front: b.trim(), back: f.trim(), topic: topicPath,
                interval: 0, ease: 2.5, nextReview: new Date().toISOString(), rowNumber: -1
              });
            }
          }
        }
      }
      if (cardsToAdd.length === 0) {
        showToast("Nenhum cartão válido encontrado (use ===)");
        return;
      }
    }

    onSave(cardsToAdd);
    
    // Clear forms after save
    newFront = ''; newBack = ''; bulkText = '';
    errorQuestion = ''; errorMistake = ''; errorTheory = '';
  }
</script>

<div class="card form-container" style="padding-bottom: 2rem;">
  <h3 class="section-title">Novo Cartão</h3>

  <label>Selecione a Matéria</label>
  <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem;">
    <select class="input" style="margin-bottom:0;" bind:value={selectedArea} onchange={() => { selectedDiscipline = ''; selectedTopicName = ''; }}>
      <option value="">1. Área / Banca...</option>
      {#each EDITAL as area}
        <option value={area.name}>{area.name}</option>
      {/each}
    </select>

    {#if selectedArea}
      <select class="input" style="margin-bottom:0;" bind:value={selectedDiscipline} onchange={() => { selectedTopicName = ''; }}>
        <option value="">2. Disciplina...</option>
        {#each availableDisciplines as disc}
          <option value={disc.name}>{disc.name} ({disc.questions}q)</option>
        {/each}
      </select>
    {/if}

    {#if selectedDiscipline}
      <select class="input" style="margin-bottom:0;" bind:value={selectedTopicName}>
        <option value="">3. Tópico Específico...</option>
        {#each availableTopics as topic}
          <option value={topic.name}>{topic.name}</option>
        {/each}
      </select>
    {/if}
  </div>

  <!-- Segmented Control Redesign -->
  <div class="segmented-control">
    <button class:active={addMode === 'single'} onclick={() => addMode = 'single'}>Básico</button>
    <button class:active={addMode === 'errorBook'} onclick={() => addMode = 'errorBook'}>Caderno Erros</button>
    <button class:active={addMode === 'bulk'} onclick={() => addMode = 'bulk'}>Em Lote</button>
  </div>

  <div class="form-body">
    {#if addMode === 'single'}
      <label style="display: flex; align-items: center; justify-content: space-between;">
        <span>Pergunta (Frente)</span>
        <button class="cloze-btn" onclick={() => newFront += '{{}}'} title="Adicionar lacuna (Cloze)">[..] Ocultar Palavra</button>
      </label>
      <textarea class="input" placeholder="Digite a pergunta... (use {{palavra}} para ocultar)" bind:value={newFront}></textarea>

      <label>Resposta (Verso)</label>
      <textarea class="input" placeholder="Digite a resposta..." bind:value={newBack}></textarea>
      
    {:else if addMode === 'errorBook'}
      <label>Enunciado da Questão</label>
      <textarea class="input" style="height: 100px" placeholder="Qual a taxa básica de juros?" bind:value={errorQuestion}></textarea>

      <label style="color: var(--err-text)">Onde escorreguei (A Pegadinha)</label>
      <textarea class="input error-input" placeholder="Achei que era a TJLP..." bind:value={errorMistake}></textarea>

      <label style="color: var(--ok-text)">Teoria / Justificativa</label>
      <textarea class="input success-input" placeholder="A taxa básica de juros é a Selic. A TJLP é de longo prazo." bind:value={errorTheory}></textarea>
      
    {:else}
      <label>Cartões (Formato: Pergunta === Resposta)</label>
      <textarea class="input" style="height: 150px" placeholder="Ex:\nO que é a Selic? === Taxa básica de juros\nCapital da França === Paris" bind:value={bulkText}></textarea>
    {/if}

    {#if addMode === 'single' || addMode === 'bulk'}
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={createReversed} class="hidden-checkbox">
        <div class="checkbox-box"></div>
        <span>Criar Cartão Reverso (Verso ➔ Frente)</span>
      </label>
    {/if}

    <button class="btn-primary" style="margin-top: 1.5rem;" onclick={submit} disabled={isSaving}>
      {isSaving ? 'Salvando...' : 'Salvar na Nuvem'}
    </button>
  </div>
</div>

<style>
  .segmented-control {
    display: flex;
    background: var(--bg-input);
    padding: 6px;
    border-radius: 14px;
    margin-bottom: 1.5rem;
  }
  .segmented-control button {
    flex: 1;
    background: transparent;
    border: none;
    padding: 10px 0;
    border-radius: 10px;
    color: var(--text-secondary);
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .segmented-control button.active {
    background: var(--bg-card);
    color: var(--text-primary);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  
  .error-input { border-color: rgba(239, 68, 68, 0.3); height: 80px; }
  .error-input:focus { border-color: var(--err); box-shadow: 0 0 0 3px var(--err-bg); }
  
  .success-input { border-color: rgba(16, 185, 129, 0.3); height: 100px; }
  .success-input:focus { border-color: var(--ok); box-shadow: 0 0 0 3px var(--ok-bg); }

  .cloze-btn {
    background: var(--accent-glow);
    color: var(--accent-text);
    border: none;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.2s;
  }
  .cloze-btn:active { background: var(--accent); color: #fff; }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    font-size: 0.85rem;
    margin-top: 1rem;
    text-transform: none; /* Override global label uppercase */
    letter-spacing: normal;
    font-weight: 600;
    color: var(--text-primary);
  }
  .hidden-checkbox { display: none !important; }
  .checkbox-box {
    width: 22px; height: 22px;
    border-radius: 6px;
    border: 2px solid var(--bg-input-border);
    background: var(--bg-input);
    transition: all 0.2s;
    position: relative;
    flex-shrink: 0;
  }
  .hidden-checkbox:checked + .checkbox-box {
    background: var(--accent);
    border-color: var(--accent);
  }
  .hidden-checkbox:checked + .checkbox-box::after {
    content: '';
    position: absolute;
    left: 6px; top: 2px;
    width: 5px; height: 10px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .form-body {
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
</style>
