<script lang="ts">
  import SnakeGame from '$lib/components/SnakeGame.svelte';
  import { registerCodeFiles } from '$lib/stores/codeFiles';

  registerCodeFiles([
    'frontend/src/routes/game/snake/+page.svelte',
    'frontend/src/lib/components/SnakeGame.svelte'
  ]);
</script>

<div class="snake-page">
  <div class="snake-chrome">
    <a href="/?instant=1" class="snake-back-btn">
      <span class="snake-back-arrow">&larr;</span>
      <span>back</span>
    </a>
    <span class="snake-title">snake</span>
  </div>
  <SnakeGame />
</div>

<style>
  .snake-page {
    max-width: 860px;
    margin: 0 auto;
  }

  .snake-chrome {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .snake-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid var(--surface1);
    background: transparent;
    color: var(--overlay1);
    border-radius: 5px;
    padding: 0.25rem 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .snake-back-btn:hover {
    color: var(--sky);
    border-color: var(--surface2);
    background: rgba(137, 220, 235, 0.05);
    text-decoration: none;
    text-shadow: none;
  }

  .snake-back-arrow {
    font-size: 0.78rem;
  }

  .snake-title {
    color: var(--overlay1);
    font-size: 0.78rem;
    letter-spacing: 0.02em;
  }
</style>
