<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { writable } from 'svelte/store';
  import { fade } from 'svelte/transition';

  import {
    codeFiles,
    isCodeViewerOpen,
    setCodeViewerOpen,
    useInlineCodeTrigger
  } from '$lib/stores/codeFiles';

  export let files: string[] | undefined = undefined;

  let fileList: string[] = [];

  const selectedIndexStore = writable(0);
  const contentsStore = writable<Record<string, string>>({});

  function toggle() {
    setCodeViewerOpen(!$isCodeViewerOpen);
  }

  function close() {
    setCodeViewerOpen(false);
  }

  function detectLanguageFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'svelte': 'javascript',
      'rs': 'rust',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'scss': 'css',
      'json': 'json',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml',
      'toml': 'toml',
      'xml': 'xml',
      'sh': 'bash',
      'bash': 'bash'
    };
    return languageMap[ext || ''] || 'plaintext';
  }

  let highlighterPromise: Promise<void> | null = null;

  function ensureHighlighter(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if ((window as any).Prism || (window as any).hljs) return Promise.resolve();

    if (highlighterPromise) return highlighterPromise;

    highlighterPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/highlight.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
    });

    return highlighterPromise;
  }

  function applyHighlighting() {
    if (typeof window === 'undefined') return;
    if ((window as any).Prism) {
      (window as any).Prism.highlightAll();
    } else if ((window as any).hljs) {
      (window as any).hljs.highlightAll();
    }
  }

  async function loadContents(list: string[]) {
    if (list.length === 0) return;

    const entries: Record<string, string> = {};
    await Promise.all(
      list.map(async (path) => {
        try {
          const res = await fetch(`/source/${path}`);
          if (res.ok) {
            entries[path] = await res.text();
          } else {
            entries[path] = `Failed to load ${path}: ${res.statusText}`;
          }
        } catch {
          entries[path] = `Error loading ${path}`;
        }
      })
    );
    contentsStore.set(entries);

    await tick();
    await ensureHighlighter();
    applyHighlighting();
  }

  function switchToTab(index: number) {
    if (index >= 0 && index < fileList.length) {
      selectedIndexStore.set(index);
      (async () => {
        await tick();
        await ensureHighlighter();
        applyHighlighting();
      })();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && $isCodeViewerOpen) {
      close();
    }
  }

  let codeFilesUnsubscribe: (() => void) | null = null;

  export function isViewerOpen() {
    return $isCodeViewerOpen;
  }

  onMount(() => {
    let initialFiles: string[] | undefined = files;

    if (!initialFiles && typeof window !== 'undefined') {
      if (window.location.hash.startsWith('#src=')) {
        initialFiles = [decodeURIComponent(window.location.hash.slice(5))];
      }
    }

    if (initialFiles && initialFiles.length > 0) {
      fileList = [...initialFiles];
      loadContents(fileList);
    }

    codeFilesUnsubscribe = codeFiles.subscribe((list) => {
      if (list && list.length > 0) {
        fileList = [...list];
        selectedIndexStore.set(0);
        loadContents(fileList);
      }
    });

    window.addEventListener('keydown', handleKeydown);

    return () => {
      if (codeFilesUnsubscribe) {
        codeFilesUnsubscribe();
      }
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  afterNavigate(() => {
    close();
  });

  $: currentFile = fileList[$selectedIndexStore];
  $: currentContent = $contentsStore[currentFile] || '';
  $: currentLanguage = currentFile ? detectLanguageFromPath(currentFile) : 'plaintext';

  $: if (currentContent) {
    (async () => {
      await tick();
      await ensureHighlighter();
      applyHighlighting();
    })();
  }

  $: if ($isCodeViewerOpen) {
    (async () => {
      await tick();
      await ensureHighlighter();
      applyHighlighting();
    })();
  }
</script>

<!-- Floating trigger button (for non-inline pages) -->
{#if fileList.length > 0 && !$useInlineCodeTrigger}
  <button
    on:click={toggle}
    class="code-viewer-button"
    style="position: fixed; top: 1rem; right: 1rem; z-index: 50;">
    {#if $isCodeViewerOpen}
      ESC close
    {:else}
      &lt;/&gt; source
    {/if}
  </button>
{/if}

{#if $isCodeViewerOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="cv-overlay" on:click={close} transition:fade={{ duration: 200 }}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="cv-modal" on:click|stopPropagation>
      <!-- Chrome bar -->
      <div class="code-viewer-chrome">
        <div class="code-viewer-chrome-left">
          <div class="code-viewer-chrome-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span class="code-viewer-chrome-title">
            {currentFile || 'source'}
          </span>
        </div>
        <button class="code-viewer-close-btn" type="button" on:click={close}>
          ESC
        </button>
      </div>

      <!-- Tabs (multi-file) -->
      {#if fileList.length > 1}
        <div class="code-viewer-tabs">
          {#each fileList as path, idx (path)}
            <button
              class="code-viewer-tab"
              class:active={$selectedIndexStore === idx}
              on:click={() => switchToTab(idx)}
              title={path}
              type="button">
              {path.split('/').pop()}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Code content -->
      <div class="code-viewer-content">
        {#if fileList.length > 0 && currentContent}
          {#key currentFile}
            <pre class="code-viewer-pre language-{currentLanguage}"><code class="code-viewer-code language-{currentLanguage}">{currentContent}</code></pre>
          {/key}
        {:else}
          <div class="cv-empty">
            <p class="cv-empty-title">No source loaded</p>
            <p class="cv-empty-hint">Navigate to a page with source files or append <code>#src=path/to/file</code> to the URL.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .cv-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    background: rgba(17, 17, 27, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(0.5rem, 2vw, 2rem);
  }

  .cv-modal {
    width: 100%;
    max-width: 1000px;
    height: 100%;
    max-height: 90vh;
    background: linear-gradient(180deg, rgba(30, 30, 46, 0.98), rgba(24, 24, 37, 0.99));
    border: 1px solid var(--surface1);
    border-radius: 12px;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.04),
      0 24px 80px rgba(0, 0, 0, 0.65),
      0 0 60px rgba(137, 180, 250, 0.05);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: cv-slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes cv-slideIn {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .cv-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 2rem;
    text-align: center;
  }

  .cv-empty-title {
    color: var(--overlay1);
    font-size: 0.95rem;
    margin: 0;
  }

  .cv-empty-hint {
    color: var(--overlay0);
    font-size: 0.78rem;
    margin: 0.5rem 0 0;
  }

  .cv-empty-hint code {
    background: rgba(49, 50, 68, 0.5);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-size: 0.74rem;
  }

  /* Mobile */
  @media (max-width: 640px) {
    .cv-overlay {
      padding: 0;
    }

    .cv-modal {
      max-height: 100vh;
      border-radius: 0;
      border: none;
    }
  }
</style>
