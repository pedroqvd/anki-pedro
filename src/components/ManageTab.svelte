<script lang="ts">
  import { Search, Upload, Download, Edit2, Trash2, Clock, Calendar, PauseCircle, PlayCircle } from "lucide-svelte";

  // Since we only need the type, not the implementation
  interface Flashcard {
    id: string;
    topic: string;
    front: string;
    back: string;
    interval: number;
    repetition: number;
    efactor: number;
    nextReview: string;
    rowNumber: number;
  }

  let { 
    filteredManageCards, 
    searchQuery = $bindable(),
    handleImport,
    exportData,
    toggleSuspend,
    handleDelete,
    openEditModal
  } = $props<{
    filteredManageCards: Flashcard[],
    searchQuery: string,
    handleImport: (e: Event) => void,
    exportData: () => void,
    toggleSuspend: (c: Flashcard) => void,
    handleDelete: (row: number, id: string) => void,
    openEditModal: (c: Flashcard) => void
  }>();

  function formatDate(iso: string) {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth()+1}`;
  }
  function getDisciplineFromPath(path: string) {
    return path.split('/')[0] || path;
  }
</script>

<div class="list-container">
  <div style="display: flex; gap: 10px; margin-bottom: 0.5rem;">
    <div class="search-bar" style="flex: 1">
      <Search size={18}/>
      <input class="input search-input" placeholder="Buscar..." bind:value={searchQuery} />
    </div>
    <label class="btn-icon" title="Importar JSON ou TSV/TXT (Padrão do Anki)" style="background: var(--bg-card); border: 1px solid var(--bg-card-border); cursor: pointer; display: flex; align-items: center; justify-content: center;">
      <input type="file" accept=".json,.csv,.txt,.tsv" style="display: none;" onchange={handleImport} />
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
    <div class="card list-item" style={c.interval === -1 ? 'opacity: 0.6; background: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px);' : ''}>
      <div class="item-info">
        <span class="topic-tag">{getDisciplineFromPath(c.topic)} {c.interval === -1 ? '(Pausado)' : ''}</span>
        <span class="item-front">{c.front}</span>
        <div class="item-stats">
          <span><Clock size={12}/> {c.interval === -1 ? 'PAUSADO' : c.interval + 'd'}</span>
          <span><Calendar size={12}/> {c.interval === -1 ? '--' : formatDate(c.nextReview)}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick={() => toggleSuspend(c)} title={c.interval === -1 ? 'Retomar' : 'Pausar'}>
          {#if c.interval === -1}<PlayCircle size={16}/>{:else}<PauseCircle size={16}/>{/if}
        </button>
        <button class="btn-icon" onclick={() => openEditModal(c)}><Edit2 size={16}/></button>
        <button class="btn-icon btn-icon-danger" onclick={() => handleDelete(c.rowNumber, c.id)}><Trash2 size={16}/></button>
      </div>
    </div>
  {/each}
</div>
