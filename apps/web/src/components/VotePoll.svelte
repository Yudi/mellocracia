<script lang="ts">
  import { onMount } from 'svelte';
  import type { PollResponse } from '@mellocracia/contracts';
  import Icon from './Icon.svelte';
  import TallyMark from './TallyMark.svelte';
  import TurnstileWidget from './TurnstileWidget.svelte';
  import { api, describeApiError, isDuplicateVoteError, isExpiredError, isRateLimitError, ApiClientError } from '../lib/api';

  export let token: string;

  let poll: PollResponse | null = null;
  let loading = true;
  let loadError = '';
  let selectedOptionId = '';
  let turnstileToken: string | undefined;
  let turnstileResetKey = 0;
  let submitting = false;
  let submitted = false;
  let submitError = '';
  let duplicate = false;
  let expired = false;

  onMount(() => {
    void loadPoll();
  });

  async function loadPoll() {
    loading = true;
    loadError = '';
    expired = false;

    try {
      poll = await api.getPoll(token);
    } catch (error) {
      loadError = describeApiError(error, 'Este link não pôde ser carregado.');
      expired = isExpiredError(error) || (error instanceof ApiClientError && error.status === 410);
    } finally {
      loading = false;
    }
  }

  async function submitVote() {
    if (!selectedOptionId || submitting || submitted) return;
    submitting = true;
    submitError = '';
    duplicate = false;

    try {
      await api.castVote(token, {
        optionId: selectedOptionId,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      submitted = true;
    } catch (error) {
      duplicate = isDuplicateVoteError(error) || (error instanceof ApiClientError && ['VOTE_EXISTS', 'ALREADY_SUBMITTED'].includes(error.code));
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
{:else if poll && submitted}
  <section class="state-panel vote-success" aria-labelledby="vote-success-title">
    <span class="state-mark" aria-hidden="true"><Icon name="check" size={29} strokeWidth={2.6} /></span>
    <h1 id="vote-success-title" class="display-title">Valeu. A mesa já <strong>contou seu voto.</strong></h1>
    <p>O resultado fica com quem criou a votação. Você não precisa fazer mais nada por aqui.</p>
    <a class="button" href="https://mello.yudi.com.br/" target="_blank" rel="noreferrer">Voltar ao Mello Games <Icon name="external" size={17} /></a>
  </section>
{:else if poll}
  <section class="poll-shell" aria-labelledby="poll-title">
    <div class="poll-heading">
      <div>
        <h1 id="poll-title" class="display-title">{poll.title}</h1>
      </div>
      <p class="expiry-note"><Icon name="clock" size={19} /> encerra em<br /><strong>{formatDate(poll.expiresAt)}</strong></p>
    </div>

    {#if duplicate}
      <div class="notice error" role="alert"><Icon name="x" size={18} /><div><strong>Este voto já foi contado.</strong>{submitError}</div></div>
    {:else if expired}
      <div class="notice error" role="alert"><Icon name="clock" size={18} /><div><strong>Esta votação encerrou.</strong> O prazo acabou enquanto você votava.</div></div>
    {:else if submitError}
      <div class="notice error" role="alert"><Icon name="x" size={18} /><div><strong>Não deu para registrar ainda.</strong>{submitError}</div></div>
    {/if}

    <form class="ballot-form" onsubmit={(event) => { event.preventDefault(); void submitVote(); }}>
      <fieldset>
        <legend class="ballot-legend">Escolha um jogo</legend>
        <div class="ballot-grid">
          {#each poll.options as option, index (option.id)}
            <label class:selected={selectedOptionId === option.id} class="ballot-option">
              <input type="radio" name="poll-option" value={option.id} checked={selectedOptionId === option.id} onchange={() => (selectedOptionId = option.id)} />
              <span class="ballot-cover">
                {#if option.featureImage}<img src={option.featureImage} alt={option.featureImageAlt || option.title} loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="cover-fallback" aria-hidden="true">{option.title.slice(0, 1)}</span>{/if}
                <span class="ballot-index">{String(index + 1).padStart(2, '0')}</span>
                <span class="ballot-check" aria-hidden="true">{#if selectedOptionId === option.id}<TallyMark size={25} />{/if}</span>
              </span>
              <span class="ballot-copy"><strong>{option.title}</strong>{#if option.excerpt}<span>{option.excerpt}</span>{/if}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#if import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
        <TurnstileWidget onToken={(value) => (turnstileToken = value)} resetKey={turnstileResetKey} />
      {/if}

      <div class="ballot-submit-row">
        <p class="ballot-privacy">Um voto por navegador.</p>
        <button class="button primary ballot-submit" type="submit" disabled={!selectedOptionId || submitting || expired}>
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

  .ballot-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 17px;
  }

  .ballot-option {
    display: block;
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

  .ballot-copy span {
    display: -webkit-box;
    max-height: 37px;
    margin-top: 7px;
    overflow: hidden;
    color: var(--ink-soft);
    font-size: 0.78rem;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
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

    .ballot-option {
      display: grid;
      grid-template-columns: 122px 1fr;
    }

    .ballot-cover {
      aspect-ratio: 1 / 1;
    }

    .ballot-copy {
      align-self: center;
      padding: 15px;
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
