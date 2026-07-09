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
  <div class="action-header">
    <div class="search-bar">
      <Search size={18} color="var(--text-muted)" />
      <input class="input search-input" placeholder="Buscar cartões..." bind:value={searchQuery} />
    </div>
    
    <div class="action-buttons">
      <label class="btn-icon" title="Importar">
        <input type="file" accept=".json,.csv,.txt,.tsv" style="display: none;" onchange={handleImport} />
        <Upload size={18} />
      </label>
      <button class="btn-icon" onclick={exportData} title="Exportar Backup">
        <Download size={18} />
      </button>
    </div>
  </div>

  {#if filteredManageCards.length === 0}
    <div class="card center-col empty-state">
      <Search size={40} color="var(--text-muted)" style="opacity: 0.5; margin-bottom: 10px;" />
      <p class="text-muted" style="font-weight: 500;">Nenhum cartão encontrado.</p>
    </div>
  {/if}

  <div class="cards-list">
    {#each filteredManageCards as c (c.id)}
      <div class="card list-item" class:paused={c.interval === -1}>
        <div class="item-info">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <span class="topic-tag">{getDisciplineFromPath(c.topic)} {c.interval === -1 ? '(Pausado)' : ''}</span>
            <div class="item-actions">
              <button class="action-btn" onclick={() => toggleSuspend(c)} title={c.interval === -1 ? 'Retomar' : 'Pausar'}>
                {#if c.interval === -1}<PlayCircle size={15}/>{:else}<PauseCircle size={15}/>{/if}
              </button>
              <button class="action-btn" onclick={() => openEditModal(c)}><Edit2 size={15}/></button>
              <button class="action-btn danger" onclick={() => handleDelete(c.rowNumber, c.id)}><Trash2 size={15}/></button>
            </div>
          </div>
          <span class="item-front">{c.front}</span>
          <div class="item-stats">
            <span class="stat-pill"><Clock size={12}/> {c.interval === -1 ? 'PAUSADO' : c.interval + 'd'}</span>
            <span class="stat-pill"><Calendar size={12}/> {c.interval === -1 ? '--' : formatDate(c.nextReview)}</span>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .action-header {
    display: flex; gap: 10px; margin-bottom: 1rem; align-items: center;
  }
  .search-bar {
    flex: 1;
    display: flex; align-items: center; gap: 8px;
    background: var(--bg-card);
    border: 1px solid var(--bg-card-border);
    border-radius: 12px;
    padding: 0 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.02);
    transition: all 0.2s;
  }
  .search-bar:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }
  .search-input {
    border: none !important;
    background: transparent !important;
    margin-bottom: 0 !important;
    padding: 12px 0 !important;
    box-shadow: none !important;
    font-size: 0.95rem;
  }
  .action-buttons {
    display: flex; gap: 8px;
  }
  .btn-icon {
    background: var(--bg-card);
    border: 1px solid var(--bg-card-border);
    color: var(--accent);
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0,0,0,0.02);
    transition: transform 0.15s, opacity 0.15s;
  }
  .btn-icon:active { transform: scale(0.95); opacity: 0.8; }
  
  .empty-state { min-height: 200px; border-style: dashed; }
  
  .cards-list {
    display: flex; flex-direction: column; gap: 12px;
    padding-bottom: 80px; /* Space for bottom nav */
  }
  
  .list-item {
    padding: 16px;
    margin-bottom: 0;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .list-item:active { transform: scale(0.98); }
  .list-item.paused {
    opacity: 0.7;
    background: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px);
  }
  
  .item-info { display: flex; flex-direction: column; gap: 4px; }
  .topic-tag {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--accent); font-weight: 800;
  }
  .item-front {
    font-weight: 600; font-size: 1.05rem; line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px;
  }
  .item-stats {
    display: flex; gap: 8px; margin-top: 4px;
  }
  .stat-pill {
    display: flex; align-items: center; gap: 4px;
    font-size: 0.7rem; font-weight: 600; color: var(--text-secondary);
    background: var(--bg-input); padding: 4px 10px; border-radius: 20px;
  }
  
  .item-actions {
    display: flex; gap: 4px;
  }
  .action-btn {
    background: transparent; border: none; cursor: pointer;
    padding: 6px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-secondary); transition: background 0.15s, color 0.15s;
  }
  .action-btn:active { background: var(--bg-input); }
  .action-btn.danger:active { color: var(--err); background: var(--err-bg); }
</style>
