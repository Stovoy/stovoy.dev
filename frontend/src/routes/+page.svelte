<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    isCodeViewerOpen,
    registerCodeFiles,
    setCodeViewerOpen,
    setUseInlineCodeTrigger
  } from '$lib/stores/codeFiles';

  const commandSegments = [
    { text: 'stovoy', class: 'cmd-user' },
    { text: '@devbox', class: 'cmd-host' },
    { text: ' ~ ', class: 'cmd-path' },
    { text: '$ ', class: 'cmd-prompt' },
    { text: 'whoami', class: 'cmd-cmd' }
  ];

  const commandStr = commandSegments.map((s) => s.text).join('');

  const projects = [
    {
      name: 'evades.io',
      href: 'https://evades.io',
      desc: 'A live multiplayer browser game rebuilt with an ECS architecture for 2025.'
    },
    {
      name: 'moire-simulator',
      href: '/projects/moire-simulator',
      desc: 'An interactive WebGPU moire simulator with deep controls for interference, color, warp, and animation.'
    },
    {
      name: 'snake',
      href: '/game/snake',
      desc: 'A polished snake mini-game with neon canvas visuals and responsive controls.'
    }
  ];

  let typed = '';
  let cursorVisible = true;
  let showRest = false;

  let revealedSections: Record<string, boolean> = {};

  type BlogItem = {
    title: string;
    date: string;
    slug: string;
    excerpt: string;
  };

  const mods = import.meta.glob('content/*.md', {
    eager: true,
    query: '?raw',
    import: 'default'
  }) as Record<string, string>;

  let blogs: BlogItem[] = Object.entries(mods)
    .map(([path, text]) => {
      const lines = text.split(/\r?\n/);
      let title = '';
      let date = '';
      let excerpt = '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!title && line.startsWith('#')) {
          title = line.replace(/^#+/, '').trim();
          continue;
        }
        if (!date && line.toLowerCase().startsWith('date:')) {
          date = line.split(':', 2)[1]?.trim() ?? '';
          continue;
        }
        if (!excerpt && line && !line.startsWith('#') && !line.toLowerCase().startsWith('date:')) {
          excerpt = line;
        }
        if (title && date && excerpt) break;
      }

      const slug = path.substring(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
      return { title, date, slug, excerpt };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  let fadeDuration = 500;

  function segmentsForTyped(t: string) {
    const result: { text: string; class: string }[] = [];
    let offset = 0;
    for (const seg of commandSegments) {
      const end = Math.min(offset + seg.text.length, t.length);
      if (offset < t.length) {
        const part = t.slice(offset, end);
        if (part) result.push({ text: part, class: seg.class });
      }
      offset += seg.text.length;
    }
    return result;
  }

  function revealAll() {
    revealedSections = {
      'projects-section': true,
      'blog-section': true,
      'contact-section': true
    };
  }

  let segments: { text: string; class: string }[] = [];

  onMount(() => {
    registerCodeFiles(['frontend/src/routes/+page.svelte']);
    setUseInlineCodeTrigger(true);

    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const instant = searchParams?.get('instant') === '1';

    if (instant) {
      typed = commandStr;
      segments = commandSegments;
      showRest = true;
      fadeDuration = 0;
      cursorVisible = false;
      revealAll();
      return () => {
        setUseInlineCodeTrigger(false);
      };
    }

    let index = 0;
    const typingInterval = window.setInterval(() => {
      if (index < commandStr.length) {
        typed = commandStr.slice(0, index + 1);
        segments = segmentsForTyped(typed);
        index += 1;
      } else {
        window.clearInterval(typingInterval);
        window.setTimeout(() => {
          showRest = true;
          // Auto-reveal all sections after a brief delay
          window.setTimeout(() => revealAll(), 600);
        }, 200);
      }
    }, 70);

    const cursorInterval = window.setInterval(() => {
      cursorVisible = !cursorVisible;
    }, 400);

    return () => {
      window.clearInterval(typingInterval);
      window.clearInterval(cursorInterval);
      setUseInlineCodeTrigger(false);
    };
  });

</script>

<div class="terminal-stage">
  <div class="terminal-window">
    <!-- Terminal chrome bar -->
    <div class="terminal-chrome">
      <div class="chrome-left">
        <div class="chrome-dots">
          <span class="dot dot-red" aria-hidden="true"></span>
          <span class="dot dot-yellow" aria-hidden="true"></span>
          <span class="dot dot-green" aria-hidden="true"></span>
        </div>
        <span class="chrome-title">stovoy@devbox: ~</span>
      </div>
      <div class="chrome-right">
        <button class="chrome-src-btn" type="button" on:click={() => setCodeViewerOpen(!$isCodeViewerOpen)}>
          <span class="chrome-src-icon">&lt;/&gt;</span>
          <span class="chrome-src-label">{$isCodeViewerOpen ? 'close' : 'source'}</span>
        </button>
      </div>
    </div>

    <!-- Terminal body -->
    <div class="terminal-body">
      <!-- Initial command typing -->
      <div class="prompt-line">
        {#each segments as seg, idx (idx)}
          <span class={seg.class}>{seg.text}</span>
        {/each}
        {#if !showRest}
          {#if cursorVisible}<span class="cursor">|</span>{/if}
        {/if}
      </div>

      {#if showRest}
        <div transition:fade={{ duration: fadeDuration }}>
          <!-- whoami output -->
          <section class="output-section" id="whoami-section">
            <div class="whoami-block">
              <p class="whoami-name">Steve <span class="whoami-handle">(stovoy)</span></p>
              <p class="whoami-line">Engineer and game builder.</p>
              <p class="whoami-line">Creator of <a href="https://evades.io" target="_blank" rel="noopener noreferrer">Evades.io</a> and long-time systems-focused programmer.</p>
              <p class="whoami-line">Safety Engineer at OpenAI, focused on reliable and secure systems.</p>
              <p class="whoami-sub">Currently building game tech, tools, and automation workflows.</p>
            </div>
          </section>

          <!-- Projects section -->
          {#if revealedSections['projects-section']}
            <section class="output-section" id="projects-section" in:fly={{ y: 16, duration: 350, easing: cubicOut }}>
              <div class="section-cmd">
                <span class="cmd-prompt">$&nbsp;</span><span class="cmd-cmd">ls projects</span>
              </div>
              <div class="card-grid">
                {#each projects as project, i (project.name)}
                  <a
                    class="project-card"
                    href={project.href}
                    target={project.href.startsWith('http') ? '_blank' : undefined}
                    rel={project.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    in:fly={{ y: 12, duration: 300, delay: i * 80, easing: cubicOut }}>
                    <div class="card-header">
                      <span class="card-name">{project.name}</span>
                      <span class="card-arrow">&rarr;</span>
                    </div>
                    <p class="card-desc">{project.desc}</p>
                  </a>
                {/each}
              </div>
            </section>
          {/if}

          <!-- Blog section -->
          {#if blogs.length && revealedSections['blog-section']}
            <section class="output-section" id="blog-section" in:fly={{ y: 16, duration: 350, easing: cubicOut }}>
              <div class="section-cmd">
                <span class="cmd-prompt">$&nbsp;</span><span class="cmd-cmd">ls blog</span>
              </div>
              <div class="blog-list">
                {#each blogs.slice(0, 5) as blog, i (blog.slug)}
                  <a class="blog-row" href={`/blog/${blog.slug}`} in:fly={{ y: 10, duration: 280, delay: i * 60, easing: cubicOut }}>
                    <div class="blog-row-main">
                      <span class="blog-title">{blog.title}</span>
                      <span class="blog-excerpt">{blog.excerpt}</span>
                    </div>
                    <span class="blog-date">{blog.date}</span>
                  </a>
                {/each}
                {#if blogs.length > 5}
                  <a href="/blog" class="blog-row blog-row-more">
                    <span class="blog-row-main">
                      <span class="blog-title">view all posts &rarr;</span>
                    </span>
                  </a>
                {/if}
              </div>
            </section>
          {/if}

          <!-- Contact section -->
          {#if revealedSections['contact-section']}
            <section class="output-section" id="contact-section" in:fly={{ y: 16, duration: 350, easing: cubicOut }}>
              <div class="section-cmd">
                <span class="cmd-prompt">$&nbsp;</span><span class="cmd-cmd">contact</span>
              </div>
              <div class="contact-grid">
                <a class="contact-card" href="https://github.com/stovoy" target="_blank" rel="noopener noreferrer" in:fly={{ x: -12, duration: 280, easing: cubicOut }}>
                  <span class="contact-label">github</span>
                  <span class="contact-desc">Code, experiments, open source.</span>
                </a>
                <a class="contact-card" href="https://twitch.tv/stovoy" target="_blank" rel="noopener noreferrer" in:fly={{ x: -12, duration: 280, delay: 60, easing: cubicOut }}>
                  <span class="contact-label">twitch</span>
                  <span class="contact-desc">Live coding and game-dev.</span>
                </a>
              </div>
            </section>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* ── Stage ─────────────────────────────────────────────── */
  .terminal-stage {
    display: flex;
    justify-content: center;
    padding: clamp(0.5rem, 2vw, 2rem) 0;
    min-height: calc(100vh - 4rem);
  }

  /* ── Terminal window ───────────────────────────────────── */
  .terminal-window {
    width: min(960px, 100%);
    border-radius: 12px;
    border: 1px solid var(--surface1);
    background: var(--mantle);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.03),
      0 0 80px rgba(137, 180, 250, 0.03);
    overflow: hidden;
  }

  /* ── Chrome bar ────────────────────────────────────────── */
  .terminal-chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.9rem;
    background: var(--crust);
    border-bottom: 1px solid var(--surface0);
  }

  .chrome-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }

  .chrome-dots {
    display: flex;
    gap: 6px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .dot-red { background: #f38ba8; }
  .dot-yellow { background: #f9e2af; }
  .dot-green { background: #a6e3a1; }

  .chrome-title {
    color: var(--overlay1);
    font-size: 0.78rem;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chrome-right {
    flex-shrink: 0;
  }

  .chrome-src-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid var(--surface1);
    background: transparent;
    color: var(--overlay1);
    border-radius: 5px;
    padding: 0.25rem 0.6rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chrome-src-btn:hover {
    color: var(--sky);
    border-color: var(--surface2);
    background: rgba(137, 220, 235, 0.05);
  }

  .chrome-src-icon {
    font-size: 0.68rem;
    opacity: 0.8;
  }

  /* ── Terminal body ─────────────────────────────────────── */
  .terminal-body {
    padding: clamp(0.9rem, 2vw, 1.4rem);
  }

  .prompt-line {
    font-size: 0.95rem;
    line-height: 1.5;
  }

  /* ── Output sections ───────────────────────────────────── */
  .output-section {
    margin-top: 1.4rem;
    padding-top: 0.6rem;
  }

  .output-section + .output-section {
    border-top: 1px solid rgba(69, 71, 90, 0.4);
  }

  /* ── whoami ────────────────────────────────────────────── */
  .whoami-block {
    margin-top: 0.5rem;
    line-height: 1.7;
  }

  .whoami-block p {
    margin: 0.15rem 0;
  }

  .whoami-name {
    color: var(--text);
    font-size: 1rem;
    font-weight: 600;
  }

  .whoami-handle {
    color: var(--overlay1);
    font-weight: 400;
  }

  .whoami-line {
    color: var(--subtext0);
    font-size: 0.88rem;
  }

  .whoami-sub {
    color: var(--overlay1);
    font-size: 0.84rem;
    margin-top: 0.4rem !important;
  }

  /* ── Section command headers ────────────────────────────── */
  .section-cmd {
    font-size: 0.88rem;
    margin-bottom: 0.7rem;
    opacity: 0.7;
  }

  /* ── Project cards ─────────────────────────────────────── */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.6rem;
  }

  .project-card {
    display: block;
    padding: 0.85rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--surface1);
    background: rgba(49, 50, 68, 0.25);
    text-decoration: none;
    color: var(--text);
    transition: all 0.2s ease;
  }

  .project-card:hover {
    border-color: var(--surface2);
    background: rgba(49, 50, 68, 0.45);
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2), 0 0 30px rgba(137, 220, 235, 0.04);
    text-decoration: none;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .card-name {
    color: var(--sky);
    font-size: 0.92rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .card-arrow {
    color: var(--overlay0);
    font-size: 0.85rem;
    transition: transform 0.2s ease, color 0.2s ease;
  }

  .project-card:hover .card-arrow {
    transform: translateX(3px);
    color: var(--sky);
  }

  .card-desc {
    color: var(--subtext0);
    font-size: 0.78rem;
    line-height: 1.5;
    margin: 0;
  }

  /* ── Blog list ─────────────────────────────────────────── */
  .blog-list {
    display: grid;
    gap: 0.35rem;
  }

  .blog-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.75rem;
    border-radius: 6px;
    border: 1px solid transparent;
    text-decoration: none;
    color: var(--text);
    transition: all 0.15s ease;
  }

  .blog-row:hover {
    background: rgba(49, 50, 68, 0.3);
    border-color: var(--surface1);
    text-decoration: none;
  }

  .blog-row-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .blog-title {
    color: var(--blue);
    font-size: 0.88rem;
    font-weight: 500;
  }

  .blog-excerpt {
    color: var(--overlay1);
    font-size: 0.76rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .blog-date {
    color: var(--overlay0);
    font-size: 0.72rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .blog-row-more .blog-title {
    color: var(--overlay1);
    font-size: 0.8rem;
  }

  .blog-row-more:hover .blog-title {
    color: var(--subtext1);
  }

  /* ── Contact ───────────────────────────────────────────── */
  .contact-grid {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .contact-card {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.65rem 0.9rem;
    border-radius: 6px;
    border: 1px solid var(--surface1);
    background: rgba(49, 50, 68, 0.2);
    text-decoration: none;
    color: var(--text);
    transition: all 0.15s ease;
    min-width: 160px;
  }

  .contact-card:hover {
    border-color: var(--surface2);
    background: rgba(49, 50, 68, 0.4);
    text-decoration: none;
  }

  .contact-label {
    color: var(--mauve);
    font-size: 0.88rem;
    font-weight: 600;
  }

  .contact-desc {
    color: var(--overlay1);
    font-size: 0.72rem;
  }

  /* ── Responsive ────────────────────────────────────────── */
  @media (max-width: 640px) {
    .terminal-stage {
      padding: 0.25rem 0;
      min-height: auto;
    }

    .terminal-window {
      border-radius: 8px;
    }

    .chrome-title {
      display: none;
    }

    .terminal-body {
      padding: 0.75rem;
    }

    .prompt-line {
      font-size: 0.82rem;
    }

    .card-grid {
      grid-template-columns: 1fr;
    }

    .blog-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.2rem;
    }

    .blog-excerpt {
      white-space: normal;
    }

    .contact-grid {
      flex-direction: column;
    }

    .contact-card {
      min-width: 0;
    }
  }
</style>
