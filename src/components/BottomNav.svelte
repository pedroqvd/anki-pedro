<script lang="ts">
  import { LayoutDashboard, BookOpen, PlusCircle, ListFilter } from 'lucide-svelte';
  
  let { activeTab = $bindable() } = $props<{ activeTab: string }>();
</script>

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
    <ListFilter size={22}/><span>Gerenciar</span>
  </button>
</nav>
