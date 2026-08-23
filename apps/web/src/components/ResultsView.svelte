<script lang="ts">
  import { onMount } from 'svelte';
  import type { PollResultsResponse } from '@mellocracia/contracts';
  import Icon from './Icon.svelte';
  import TallyMark from './TallyMark.svelte';
  import { api, ApiClientError, describeApiError, isExpiredError } from '../lib/api';

  export let token: string;

  let results: PollResultsResponse | null = null;
  let loading = true;
  let errorMessage = '';
  let expired = false;

  $: rankedOptions = results
    ? [...results.options].sort((left, right) => right.votes - left.votes || right.percentage - left.percentage || left.title.localeCompare(right.title, 'pt-BR'))
    : [];

  onMount(() => {
    void loadResults();
  });

  async function loadResults() {
    loading = true;
    errorMessage = '';
    expired = false;

    try {
      results = await api.getResults(token);
    } catch (error) {
      errorMessage = describeApiError(error, 'Os resultados não puderam ser carregados agora.');
      expired = isExpiredError(error) || (error instanceof ApiClientError && error.status === 410);
    } finally {
      loading = false;
    }
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function percentage(value: number): string {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
  }
</script>

{#if loading}
  <div class="loading-state results-loading" aria-live="polite"><div><div class="loading-mark" aria-hidden="true"></div><p>Contando os votos…</p></div></div>
{:else if errorMessage}
  <section class="state-panel" aria-labelledby="results-error-title">
    <span class="state-mark error-mark" aria-hidden="true"><Icon name={expired ? 'clock' : 'x'} size={27} /></span>
    <h1 id="results-error-title" class="display-title">{expired ? 'Esta votação já foi recolhida.' : 'Não deu para abrir os resultados.'}</h1>
    <p>{expired ? 'O prazo desta votação terminou.' : errorMessage}</p>
    {#if !expired}<button class="button cobalt" type="button" onclick={loadResults}>Tentar novamente <Icon name="refresh" size={18} /></button>{/if}
  </section>
{:else if results}
  <section class="results-shell" aria-labelledby="results-title">
    <div class="results-heading">
      <div>
        <h1 id="results-title" class="display-title">{results.title}</h1>
        <p class="results-meta">{results.totalVotes} {results.totalVotes === 1 ? 'voto contado' : 'votos contados'} · esta cédula expira em {formatDate(results.expiresAt)}</p>
      </div>
      <button class="button small" type="button" onclick={loadResults} disabled={loading}><Icon name="refresh" size={17} /> Atualizar</button>
    </div>

    {#if results.totalVotes === 0}
      <div class="empty-tally"><span class="tally-dash" aria-hidden="true"></span><h2>Ainda não há votos.</h2><p>Compartilhe o link de votação e volte aqui para acompanhar a mesa.</p></div>
    {:else}
      <ol class="tally-list" aria-label="Resultados por jogo">
        {#each rankedOptions as option, index (option.id)}
          <li class="tally-row">
            <div class="tally-cover">
              {#if option.featureImage}<img src={option.featureImage} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="cover-fallback" aria-hidden="true">{option.title.slice(0, 1)}</span>{/if}
            </div>
            <div class="tally-main">
              <div class="tally-label-row"><span class="tally-position"><TallyMark size={24} /><span>{String(index + 1).padStart(2, '0')}</span></span><strong>{option.title}</strong><span class="tally-number">{option.votes} {option.votes === 1 ? 'voto' : 'votos'} · {percentage(option.percentage)}%</span></div>
              <div class="tally-track" aria-hidden="true"><span style={`--tally-scale: ${Math.max(0, Math.min(100, option.percentage)) / 100}`}></span></div>
            </div>
          </li>
        {/each}
      </ol>
    {/if}

    <div class="results-footer"><span>Este link mostra apenas os resultados.</span><a href="/">Criar outra votação <Icon name="arrow-right" size={16} /></a></div>
  </section>
{/if}

<style>
  .results-loading {
    min-height: 390px;
  }

  .state-panel {
    max-width: 780px;
    margin: 22px auto 0;
    border-top: 2px solid var(--ink);
    padding: 30px 0 14px;
  }

  .state-panel .display-title {
    max-width: 15ch;
  }

  .state-panel > p:not(.section-label) {
    max-width: 48ch;
    margin: 18px 0 22px;
    color: var(--ink-soft);
    line-height: 1.55;
  }

  .state-mark {
    display: grid;
    place-items: center;
    width: 55px;
    height: 55px;
    margin-bottom: 24px;
    border: 2px solid var(--ink);
    background: var(--citrus);
    transform: rotate(-3deg);
  }

  .error-mark {
    background: var(--paper-bright);
    color: var(--signal);
  }

  .results-shell {
    max-width: 1020px;
    margin: 0 auto;
  }

  .results-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 28px;
  }

  .results-heading .display-title {
    max-width: 16ch;
  }

  .results-meta {
    margin: 17px 0 0;
    color: var(--ink-soft);
    font-size: 0.86rem;
  }

  .empty-tally {
    display: grid;
    place-items: center;
    min-height: 300px;
    border-bottom: 2px solid var(--ink);
    text-align: center;
  }

  .tally-dash {
    display: block;
    width: 60px;
    height: 8px;
    margin-bottom: 14px;
    background: var(--signal);
  }

  .empty-tally h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 2rem;
  }

  .empty-tally p {
    margin: 8px 0 0;
    color: var(--ink-soft);
  }

  .tally-list {
    margin: 31px 0 0;
    padding: 0;
    list-style: none;
  }

  .tally-row {
    display: grid;
    grid-template-columns: 84px 1fr;
    gap: 18px;
    align-items: center;
    min-height: 101px;
    border-bottom: 1px solid var(--line);
    padding: 12px 0;
  }

  .tally-cover {
    width: 84px;
    height: 76px;
    overflow: hidden;
    border: 2px solid var(--ink);
    background: var(--paper-dim);
  }

  .tally-cover img,
  .tally-cover .cover-fallback {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tally-cover .cover-fallback {
    display: grid;
    place-items: center;
    background: var(--cobalt-deep);
    color: white;
    font-family: var(--font-display);
    font-size: 2.6rem;
    font-weight: 800;
  }

  .tally-label-row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: baseline;
  }

  .tally-position {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--signal);
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 800;
  }

  .tally-position span {
    color: var(--ink-soft);
  }

  .tally-label-row strong {
    font-family: var(--font-display);
    font-size: 1.45rem;
    letter-spacing: 0.01em;
    line-height: 1;
  }

  .tally-number {
    color: var(--ink-soft);
    font-size: 0.82rem;
    white-space: nowrap;
  }

  .tally-track {
    height: 14px;
    margin-top: 12px;
    border: 1px solid var(--line);
    background: var(--paper-dim);
  }

  .tally-track span {
    display: block;
    height: 100%;
    min-width: 3px;
    background: var(--cobalt);
    transform: scaleX(var(--tally-scale, 0));
    transform-origin: left center;
    transition: transform 450ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .results-footer {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    margin-top: 24px;
    color: var(--ink-soft);
    font-size: 0.82rem;
  }

  .results-footer span,
  .results-footer a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .results-footer a {
    color: var(--ink);
    font-weight: 800;
    text-underline-offset: 4px;
  }

  @media (max-width: 620px) {
    .results-heading {
      display: block;
    }

    .results-heading .button {
      margin-top: 18px;
    }

    .tally-row {
      grid-template-columns: 63px 1fr;
      gap: 11px;
      min-height: 88px;
    }

    .tally-cover {
      width: 63px;
      height: 64px;
    }

    .tally-label-row {
      grid-template-columns: 28px 1fr;
      gap: 5px;
    }

    .tally-label-row strong {
      font-size: 1.2rem;
    }

    .tally-number {
      grid-column: 2;
      font-size: 0.74rem;
    }

    .tally-track {
      height: 11px;
      margin-top: 9px;
    }

    .results-footer {
      display: block;
    }

    .results-footer a {
      margin-top: 12px;
    }
  }
</style>
