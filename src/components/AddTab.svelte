<script lang="ts">
  import { EDITAL } from '../lib/edital';
  import { createWorker } from 'tesseract.js';

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

  let addMode = $state<'single'|'errorBook'|'bulk'|'scanner'>('single');
  let newFront = $state('');
  let newBack = $state('');
  let errorQuestion = $state('');
  let errorMistake = $state('');
  let errorTheory = $state('');
  let bulkText = $state('');
  let createReversed = $state(false);
  
  let ocrProgress = $state(0);
  let isScanning = $state(false);
  let selectedArea = $state('');
  let selectedDiscipline = $state('');
  let selectedTopicName = $state('');

  let availableDisciplines = $derived(
    EDITAL.find(a => a.name === selectedArea)?.disciplines || []
  );
  let availableTopics = $derived(
    availableDisciplines.find(d => d.name === selectedDiscipline)?.topics || []
  );

  async function handleImageUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await processImage(file);
  }

  async function handlePaste(e: ClipboardEvent) {
    if (addMode !== 'scanner') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) await processImage(file);
        break;
      }
    }
  }

  async function processImage(file: File) {
    isScanning = true;
    ocrProgress = 0;
    try {
      const worker = await createWorker('por', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            ocrProgress = Math.round(m.progress * 100);
          }
        }
      });
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      bulkText = parseOcrText(text);
      addMode = 'bulk';
      showToast("Leitura concluída! Revise o texto.");
    } catch (err) {
      console.error(err);
      showToast("Erro ao processar a imagem.");
    } finally {
      isScanning = false;
    }
  }

  function parseOcrText(rawText: string) {
    // 1. Limpeza de "ruído" do Tesseract (ex: barras e underlines)
    let text = rawText.replace(/[\|\_]/g, '');

    // 2. Reconexão Inteligente de Frases (Remove quebras de linha fantasmas do OCR)
    let lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let cleanLines: string[] = [];
    
    const isAlt = (l: string) => /^[a-eA-E][\.\)\-]\s/.test(l);
    const isQStart = (l: string) => /^(QUESTÃO\s*\d+|Q\s*\d+|\d+[\.\-\)]\s)/i.test(l);
    
    for (let i = 0; i < lines.length; i++) {
      let current = lines[i];
      if (i > 0 && !isAlt(current) && !isQStart(current)) {
        let prev = cleanLines[cleanLines.length - 1];
        // Une se a linha anterior não for terminada por pontuação final ou não for alternativa
        if (!isAlt(prev) && !isQStart(prev) && !/[.:!?]$/.test(prev)) {
          cleanLines[cleanLines.length - 1] = prev + ' ' + current;
          continue;
        }
      }
      cleanLines.push(current);
    }
    
    text = cleanLines.join('\n');

    // 3. Fatiamento Automático de Múltiplas Questões na mesma Imagem
    const qSplitter = /(QUESTÃO\s*\d+|Q\s*\d+|\d+[\.\-\)]\s)/i;
    let parts = text.split(qSplitter).filter(p => p.trim().length > 0);
    
    let bulkOutput: string[] = [];
    
    if (parts.length === 1) {
      bulkOutput.push(formatCard(parts[0]));
    } else {
      let currentCard = '';
      for (let i = 0; i < parts.length; i++) {
        let p = parts[i];
        if (qSplitter.test(p)) {
          if (currentCard) bulkOutput.push(formatCard(currentCard));
          currentCard = `**${p.trim()}**\n`;
        } else {
          currentCard += p.trim();
        }
      }
      if (currentCard) bulkOutput.push(formatCard(currentCard));
    }

    return bulkOutput.join('\n\n\n');
  }

  function formatCard(content: string) {
    // Assegura que cada alternativa (a,b,c...) caia em uma nova linha
    content = content.replace(/\s+([a-eA-E][\.\)]\s)/g, '\n$1');
    
    // Ajusta espaços e padroniza
    content = content.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');

    // Mini-IA: Detecta se é prova estilo Múltipla Escolha ou CESPE (Certo/Errado)
    let hasAlternatives = /^[a-eA-E][\.\)]\s/m.test(content);
    let back = hasAlternatives ? '**Gabarito:** [Letra]' : '**Gabarito:** [ CERTO / ERRADO ]\n\n**Justificativa:**';
    
    return `${content}\n===\n${back}`;
  }

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

<svelte:window onpaste={handlePaste} />

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
    <button class:active={addMode === 'errorBook'} onclick={() => addMode = 'errorBook'}>Erros</button>
    <button class:active={addMode === 'bulk'} onclick={() => addMode = 'bulk'}>Lote</button>
    <button class:active={addMode === 'scanner'} onclick={() => addMode = 'scanner'}>Scanner IA</button>
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
      
    {:else if addMode === 'scanner'}
      <div class="scanner-dropzone">
        {#if isScanning}
          <div class="scanner-progress">
            <div class="spinner"></div>
            <p>Lendo imagem... {ocrProgress}%</p>
          </div>
        {:else}
          <p style="margin-bottom: 10px; color: var(--text-secondary); font-weight: 500;">
            Dê <strong>Ctrl + V</strong> para colar um print da questão, ou envie uma imagem:
          </p>
          <label class="btn-primary" style="display: inline-block; text-align: center; cursor: pointer; padding: 10px 20px;">
            Selecionar Imagem
            <input type="file" accept="image/*" style="display: none;" onchange={handleImageUpload} />
          </label>
        {/if}
      </div>
      
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

  .scanner-dropzone {
    border: 2px dashed var(--bg-card-border);
    border-radius: 16px;
    padding: 40px 20px;
    text-align: center;
    background: rgba(0,0,0,0.02);
    transition: background 0.3s, border-color 0.3s;
  }
  .scanner-dropzone:hover {
    border-color: var(--accent);
    background: var(--accent-glow);
  }
  .scanner-progress {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    color: var(--accent); font-weight: 600;
  }

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
