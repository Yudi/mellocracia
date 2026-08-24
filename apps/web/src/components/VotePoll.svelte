<script lang="ts">
  import { onMount } from 'svelte';
  import type { PollResponse } from '@mellocracia/contracts';
  import Icon from './Icon.svelte';
  import TallyMark from './TallyMark.svelte';
  import TurnstileWidget from './TurnstileWidget.svelte';
  import { api, describeApiError, isDuplicateVoteError, isExpiredError, isRateLimitError, ApiClientError } from '../lib/api';

  export let token: string;
  export let turnstileSiteKey: string | undefined;

  let poll: PollResponse | null = null;
  let loading = true;
  let loadError = '';
  let selectedOptionIds: string[] = [];
  let turnstileToken: string | undefined;
  let turnstileResetKey = 0;
  let submitting = false;
  let submitted = false;
  let submitError = '';
  let hasVoted = false;
  let expired = false;

  $: resultsPath = `/r/${encodeURIComponent(token)}`;

  onMount(() => {
    void loadPoll();
  });

  async function loadPoll() {
    loading = true;
    loadError = '';
    expired = false;
    hasVoted = false;

    try {
      poll = await api.getPoll(token);
      hasVoted = poll.hasVoted;
    } catch (error) {
      loadError = describeApiError(error, 'Este link não pôde ser carregado.');
      expired = isExpiredError(error) || (error instanceof ApiClientError && error.status === 410);
    } finally {
      loading = false;
    }
  }

  async function submitVote() {
    if (selectedOptionIds.length === 0 || submitting || submitted) return;
    submitting = true;
    submitError = '';

    try {
      await api.castVote(token, {
        optionIds: selectedOptionIds,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      submitted = true;
    } catch (error) {
      hasVoted = isDuplicateVoteError(error) || (error instanceof ApiClientError && ['VOTE_EXISTS', 'ALREADY_SUBMITTED'].includes(error.code));
      expired = isExpiredError(error) || (error instanceof ApiClientError && error.status === 410);
      submitError = describeApiError(error, 'Não foi possível registrar seu voto.');
      turnstileResetKey += 1;
      turnstileToken = undefined;
      if (isRateLimitError(error)) {
        submitError += ' Espere alguns segundos antes de tentar novamente.';
      }
    } finally {
      submitting = false;
    }
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function toggleOption(optionId: string): void {
    selectedOptionIds = selectedOptionIds.includes(optionId)
      ? selectedOptionIds.filter((selectedId) => selectedId !== optionId)
      : [...selectedOptionIds, optionId];
  }
</script>

{#if loading}
  <div class="loading-state poll-loading" aria-live="polite"><div><div class="loading-mark" aria-hidden="true"></div><p>Preparando a cédula…</p></div></div>
{:else if loadError}
  <section class="state-panel" aria-labelledby="poll-error-title">
    <span class="state-mark error-mark" aria-hidden="true"><Icon name={expired ? 'clock' : 'x'} size={27} /></span>
    <h1 id="poll-error-title" class="display-title">{expired ? 'Esta cédula já fechou.' : 'Não encontramos esta votação.'}</h1>
    <p>{expired ? 'O prazo desta votação terminou.' : loadError}</p>
    <a class="button cobalt" href="/">Montar uma nova votação <Icon name="arrow-right" size={18} /></a>
  </section>
{:else if poll && (submitted || hasVoted)}
  <section class="state-panel vote-success" aria-labelledby="vote-success-title">
    <span class="state-mark" aria-hidden="true"><Icon name="check" size={29} strokeWidth={2.6} /></span>
    <h1 id="vote-success-title" class="display-title">{hasVoted && !submitted ? 'Este navegador já ' : 'Valeu. A mesa já '}<strong>{hasVoted && !submitted ? 'votou nesta cédula.' : 'contou seu voto.'}</strong></h1>
    <p>{hasVoted && !submitted ? 'Você já registrou seu voto nesta votação. Acompanhe a contagem da mesa quando quiser.' : 'Seu voto foi registrado. Acompanhe a contagem da mesa quando quiser.'}</p>
    <a class="button primary" href={resultsPath}>Ver resultados <Icon name="arrow-right" size={17} /></a>
  </section>
{:else if poll}
  <section class="poll-shell" aria-labelledby="poll-title">
    <div class="poll-heading">
      <div>
        <h1 id="poll-title" class="display-title">{poll.title}</h1>
      </div>
      <p class="expiry-note"><Icon name="clock" size={19} /> encerra em<br /><strong>{formatDate(poll.expiresAt)}</strong></p>
    </div>

    {#if expired}
      <div class="notice error" role="alert"><Icon name="clock" size={18} /><div><strong>Esta votação encerrou.</strong> O prazo acabou enquanto você votava.</div></div>
    {:else if submitError}
      <div class="notice error" role="alert"><Icon name="x" size={18} /><div><strong>Não deu para registrar ainda.</strong>{submitError}</div></div>
    {/if}

    <form class="ballot-form" onsubmit={(event) => { event.preventDefault(); void submitVote(); }}>
      <fieldset>
        <legend class="ballot-legend">Escolha um ou mais jogos</legend>
        <p class="ballot-selection-note" aria-live="polite">
          {selectedOptionIds.length === 0
            ? 'Marque todos os jogos que você quer jogar.'
            : `${selectedOptionIds.length} ${selectedOptionIds.length === 1 ? 'jogo marcado' : 'jogos marcados'}.`}
        </p>
        <div class="ballot-grid">
          {#each poll.options as option, index (option.id)}
            <article class:selected={selectedOptionIds.includes(option.id)} class="ballot-option">
              <label class="ballot-select">
                <input type="checkbox" name="poll-option" value={option.id} checked={selectedOptionIds.includes(option.id)} onchange={() => toggleOption(option.id)} />
              <span class="ballot-cover">
                {#if option.featureImage}<img src={option.featureImage} alt={option.featureImageAlt || option.title} loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="cover-fallback" aria-hidden="true">{option.title.slice(0, 1)}</span>{/if}
                <span class="ballot-index">{String(index + 1).padStart(2, '0')}</span>
                <span class="ballot-check" aria-hidden="true">{#if selectedOptionIds.includes(option.id)}<TallyMark size={25} />{/if}</span>
              </span>
                <span class="ballot-copy">
                  <strong>{option.title}</strong>
                  {#if option.tags.length > 0}
                    <span class="ballot-tags" aria-label={`Tags: ${option.tags.join(', ')}`}>
                      {#each option.tags as tag (tag)}<span class="ballot-tag">{tag}</span>{/each}
                    </span>
                  {:else}<span class="ballot-untagged">Sem tags</span>{/if}
                </span>
              </label>
              {#if option.sourceUrl}
                <a class="ballot-source" href={option.sourceUrl} target="_blank" rel="noreferrer">Abrir post <Icon name="external" size={16} /></a>
              {/if}
            </article>
          {/each}
        </div>
      </fieldset>

      {#if turnstileSiteKey}
        <TurnstileWidget
          siteKey={turnstileSiteKey}
          onToken={(value) => (turnstileToken = value)}
          resetKey={turnstileResetKey}
        />
      {/if}

      <div class="ballot-submit-row">
        <p class="ballot-privacy">Um voto por navegador. Você pode marcar mais de um jogo.</p>
        <button class="button primary ballot-submit" type="submit" disabled={selectedOptionIds.length === 0 || submitting || expired}>
          {#if submitting}<span class="button-loader" aria-hidden="true"></span> Registrando…{:else}Confirmar voto <Icon name="arrow-right" size={21} />{/if}
        </button>
      </div>
    </form>
  </section>
{/if}

<style>
  .poll-loading {
    min-height: 390px;
  }

  .state-panel {
    max-width: 780px;
    margin: 22px auto 0;
    border-top: 2px solid var(--ink);
    padding: 30px 0 14px;
  }

  .state-panel .display-title {
    max-width: 14ch;
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

  .poll-shell {
    max-width: 1120px;
    margin: 0 auto;
  }

  .poll-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 22px;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 28px;
  }

  .poll-heading .display-title {
    max-width: 16ch;
  }

  .expiry-note {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 0 8px;
    margin: 0 0 5px;
    color: var(--ink-soft);
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .expiry-note svg {
    grid-row: 1 / 3;
    color: var(--cobalt);
  }

  .expiry-note strong {
    color: var(--ink);
    font-size: 0.88rem;
  }

  .ballot-form {
    margin-top: 27px;
  }

  .ballot-form fieldset {
    margin: 0;
    border: 0;
    padding: 0;
  }

  .ballot-legend {
    margin-bottom: 17px;
    font-family: var(--font-display);
    font-size: 1.65rem;
    font-weight: 800;
  }

  .ballot-selection-note {
    margin: -8px 0 17px;
    color: var(--ink-soft);
    font-size: 0.88rem;
    line-height: 1.4;
  }

  .ballot-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 17px;
  }

  .ballot-option {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 2px solid var(--ink);
    border-radius: 0;
    background: var(--paper-bright);
    box-shadow: var(--shadow-small);
    cursor: pointer;
    overflow: hidden;
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  }

  .ballot-select {
    display: block;
    min-width: 0;
    cursor: pointer;
  }

  .ballot-option:hover,
  .ballot-option.selected {
    transform: translateY(-4px);
    border-color: var(--cobalt);
    box-shadow: 0 15px 28px rgb(10 70 232 / 0.2);
  }

  .ballot-option input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .ballot-option:has(input:focus-visible) {
    outline: 3px solid var(--signal);
    outline-offset: 3px;
  }

  .ballot-cover {
    position: relative;
    display: block;
    aspect-ratio: 1.18 / 1;
    overflow: hidden;
    background: var(--paper-dim);
  }

  .ballot-cover img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .ballot-index {
    position: absolute;
    top: 9px;
    left: 9px;
    display: grid;
    place-items: center;
    min-width: 30px;
    min-height: 26px;
    border: 2px solid var(--ink);
    background: var(--citrus);
    font-family: var(--font-display);
    font-weight: 800;
  }

  .ballot-check {
    position: absolute;
    right: 9px;
    bottom: 9px;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 2px solid var(--ink);
    background: var(--citrus);
    opacity: 0;
  }

  .ballot-option.selected .ballot-check {
    opacity: 1;
  }

  .ballot-copy {
    display: block;
    padding: 14px 14px 16px;
  }

  .ballot-copy strong {
    display: block;
    font-family: var(--font-display);
    font-size: 1.32rem;
    font-weight: 800;
    letter-spacing: 0.01em;
    line-height: 1;
  }

  .ballot-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 7px;
  }

  .ballot-tag,
  .ballot-untagged {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 3px 6px;
    color: var(--ink-soft);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.1;
  }

  .ballot-untagged {
    margin-top: 7px;
    border-style: dashed;
    font-weight: 400;
  }

  .ballot-source {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    margin-top: auto;
    border-top: 1px solid var(--line);
    padding: 10px 14px;
    color: var(--ink-soft);
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 800;
    line-height: 1;
    text-decoration: none;
  }

  .ballot-source:hover {
    color: var(--cobalt);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .ballot-submit-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 31px;
    border-top: 2px solid var(--ink);
    padding-top: 18px;
  }

  .ballot-privacy {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.82rem;
  }

  .ballot-submit {
    min-width: 190px;
    min-height: 56px;
    font-size: 1.25rem;
  }

  .button-loader {
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 700ms linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 900px) {
    .ballot-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .poll-heading {
      display: block;
    }

    .expiry-note {
      margin-top: 18px;
    }

    .ballot-grid {
      grid-template-columns: 1fr;
      gap: 13px;
    }

    .ballot-select {
      display: grid;
      grid-template-columns: 122px minmax(0, 1fr);
    }

    .ballot-cover {
      aspect-ratio: 1 / 1;
    }

    .ballot-copy {
      align-self: center;
      padding: 15px;
    }

    .ballot-source {
      margin-left: 122px;
    }

    .ballot-submit-row {
      display: block;
    }

    .ballot-submit {
      width: 100%;
      margin-top: 16px;
    }
  }
</style>
