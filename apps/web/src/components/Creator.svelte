<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    CatalogItem,
    CatalogResponse,
    CreatePollResponse,
  } from '@mellocracia/contracts';
  import { POLL_LIMITS } from '@mellocracia/contracts';
  import Icon from './Icon.svelte';
  import TallyMark from './TallyMark.svelte';
  import TurnstileWidget from './TurnstileWidget.svelte';
  import { api, describeApiError, isRateLimitError } from '../lib/api';

  type DurationHours = 24 | 72 | 168 | 336;
  type CopyTarget = 'vote' | 'results';

  let items: CatalogItem[] = [];
  let filteredItems: CatalogItem[] = [];
  let selectedItems: CatalogItem[] = [];
  let loading = true;
  let errorMessage = '';
  let catalogStale = false;
  let query = '';
  let title = '';
  let durationHours: DurationHours = 72;
  let turnstileToken: string | undefined;
  let turnstileResetKey = 0;
  let creating = false;
  let createError = '';
  let createdPoll: CreatePollResponse | null = null;
  let copiedTarget: CopyTarget | null = null;
  let copyError = '';

  $: filteredItems = items.filter((item) => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalizedQuery) return true;
    return `${item.title} ${item.excerpt}`
      .toLocaleLowerCase('pt-BR')
      .includes(normalizedQuery);
  });

  $: selectedItems = items.filter((item) => selectedIds.includes(item.id));
  $: canCreate =
    selectedItems.length >= POLL_LIMITS.minOptions &&
    title.trim().length > 0 &&
    !creating;
  $: allVisibleSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedIds.includes(item.id));

  let selectedIds: string[] = [];

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  onMount(() => {
    void loadCatalog();
  });

  async function loadCatalog() {
    loading = true;
    errorMessage = '';

    try {
      const response: CatalogResponse = await api.getCatalog();
      items = response.items;
      catalogStale = response.stale;
    } catch (error) {
      errorMessage = describeApiError(
        error,
        'O catálogo não pôde ser carregado agora.',
      );
    } finally {
      loading = false;
    }
  }

  function toggleItem(id: string) {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((selectedId) => selectedId !== id)
      : [...selectedIds, id];
  }

  function toggleVisibleItems() {
    if (allVisibleSelected) {
      const visibleIds = new Set(filteredItems.map((item) => item.id));
      selectedIds = selectedIds.filter((id) => !visibleIds.has(id));
      return;
    }

    const nextIds = new Set(selectedIds);
    filteredItems.forEach((item) => nextIds.add(item.id));
    selectedIds = [...nextIds];
  }

  function clearSelection() {
    selectedIds = [];
  }

  function removeItem(id: string) {
    selectedIds = selectedIds.filter((selectedId) => selectedId !== id);
  }

  function updateQuery(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
  }

  function updateTitle(event: Event) {
    title = (event.currentTarget as HTMLInputElement).value;
  }

  async function createPoll() {
    if (!canCreate) return;
    creating = true;
    createError = '';
    copyError = '';

    try {
      createdPoll = await api.createPoll({
        title: title.trim(),
        durationHours,
        optionPostIds: selectedIds,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      createError = describeApiError(
        error,
        'Não foi possível criar a votação.',
      );
      turnstileResetKey += 1;
      turnstileToken = undefined;
      if (isRateLimitError(error)) {
        createError +=
          ' A criação tem um limite por endereço para proteger o serviço.';
      }
    } finally {
      creating = false;
    }
  }

  function absoluteUrl(value: string): string {
    return new URL(value, window.location.origin).toString();
  }

  async function copyLink(target: CopyTarget, value: string) {
    copyError = '';
    try {
      await navigator.clipboard.writeText(absoluteUrl(value));
      copiedTarget = target;
      window.setTimeout(() => {
        if (copiedTarget === target) copiedTarget = null;
      }, 2200);
    } catch {
      copyError =
        'Não foi possível copiar automaticamente. Selecione o link para copiar manualmente.';
    }
  }

  function newPoll() {
    createdPoll = null;
    copiedTarget = null;
    copyError = '';
    createError = '';
    selectedIds = [];
    title = '';
    query = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
</script>

{#if createdPoll}
  <section class="success-panel" aria-labelledby="success-title">
    <div class="success-heading">
      <span class="success-stamp" aria-hidden="true"
        ><Icon name="check" size={27} strokeWidth={2.5} /></span
      >
      <div>
        <h1 id="success-title" class="display-title">
          Agora é só <strong>compartilhar.</strong>
        </h1>
        <p class="page-intro-copy">
          Os links expiram em {formatDate(createdPoll.expiresAt)}. Guarde o link
          de resultados separado do link de votação.
        </p>
      </div>
    </div>

    <div class="share-list">
      <div class="share-row">
        <div>
          <span class="share-label">Link para votar</span>
          <a href={createdPoll.voteUrl} target="_blank" rel="noreferrer"
            >{absoluteUrl(createdPoll.voteUrl)}</a
          >
        </div>
        <div class="share-actions">
          <a
            class="button small"
            href={createdPoll.voteUrl}
            target="_blank"
            rel="noreferrer">Abrir <Icon name="external" size={16} /></a
          >
          <button
            class="button small primary"
            type="button"
            onclick={() => copyLink('vote', createdPoll?.voteUrl ?? '')}
          >
            <Icon name="copy" size={16} />
            {copiedTarget === 'vote' ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
      <div class="share-row">
        <div>
          <span class="share-label">Link secreto de resultados</span>
          <a href={createdPoll.resultsUrl} target="_blank" rel="noreferrer"
            >{absoluteUrl(createdPoll.resultsUrl)}</a
          >
        </div>
        <div class="share-actions">
          <a
            class="button small"
            href={createdPoll.resultsUrl}
            target="_blank"
            rel="noreferrer"
            >Ver resultados <Icon name="external" size={16} /></a
          >
          <button
            class="button small primary"
            type="button"
            onclick={() => copyLink('results', createdPoll?.resultsUrl ?? '')}
          >
            <Icon name="copy" size={16} />
            {copiedTarget === 'results' ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>

    {#if copyError}
      <p class="notice error" role="alert">
        <Icon name="x" size={18} />
        {copyError}
      </p>
    {/if}
    <div class="success-footer">
      <span
        >{createdPoll.optionCount} opções incluídas · expira em {formatDate(
          createdPoll.expiresAt,
        )}</span
      >
      <button class="button cobalt" type="button" onclick={newPoll}
        >Montar outra votação <Icon name="arrow-right" size={18} /></button
      >
    </div>
  </section>
{:else}
  <section class="page-intro creator-intro" aria-labelledby="creator-title">
    <div>
      <h1 id="creator-title" class="display-title">
        Monte a cédula dos <strong>próximos jogos.</strong>
      </h1>
      <p class="page-intro-copy">
        Escolha os jogos, dê um nome para a votação e mande o link para a mesa.
      </p>
    </div>
    <a
      class="source-link"
      href="https://mello.yudi.com.br/"
      target="_blank"
      rel="noreferrer"
      >Conheça o Mello Games <Icon name="external" size={16} /></a
    >
  </section>

  {#if errorMessage}
    <div class="notice error" role="alert">
      <Icon name="x" size={18} />
      <div>
        <strong>Catálogo indisponível</strong>{errorMessage}
        <button class="plain-link" type="button" onclick={loadCatalog}
          >Tentar novamente</button
        >
      </div>
    </div>
  {:else if loading}
    <div class="loading-state" aria-live="polite">
      <div>
        <div class="loading-mark" aria-hidden="true"></div>
        <p>Buscando os jogos do Mello Games…</p>
      </div>
    </div>
  {:else if items.length === 0}
    <div class="empty-state">
      <div>
        <p>
          Nenhum jogo apareceu no catálogo agora. Tente recarregar em alguns
          instantes.
        </p>
        <button class="button cobalt" type="button" onclick={loadCatalog}
          >Recarregar catálogo</button
        >
      </div>
    </div>
  {:else}
    <section class="catalog-section" aria-labelledby="catalog-title">
      <div class="catalog-toolbar">
        <div>
          <p class="section-label" id="catalog-title">Escolha os jogos</p>
          <p class="catalog-count">
            <strong>{items.length}</strong>
            {items.length === 1
              ? 'jogo no catálogo'
              : 'jogos no catálogo'}{query
              ? ` · ${filteredItems.length} visíveis`
              : ''}
          </p>
        </div>
        <div class="catalog-actions">
          <label class="search-field">
            <span class="visually-hidden">Buscar jogo por nome</span>
            <Icon name="search" size={21} />
            <input
              type="search"
              value={query}
              oninput={updateQuery}
              placeholder="Buscar jogo por nome…"
              autocomplete="off"
            />
          </label>
          <button
            class="select-all"
            type="button"
            onclick={toggleVisibleItems}
            aria-pressed={allVisibleSelected}
          >
            <span
              class:checked={allVisibleSelected}
              class="checkbox-mark"
              aria-hidden="true"
              >{#if allVisibleSelected}<Icon
                  name="check"
                  size={18}
                  strokeWidth={2.8}
                />{/if}</span
            >
            {allVisibleSelected ? 'Limpar visíveis' : 'Selecionar visíveis'}
          </button>
        </div>
      </div>

      {#if catalogStale}
        <p class="catalog-stale" role="status">
          Mostrando uma cópia recente do catálogo enquanto atualizamos a fonte.
        </p>
      {/if}

      {#if filteredItems.length === 0}
        <div class="empty-state catalog-empty">
          <div>
            <p>Nenhum jogo corresponde a “{query}”.</p>
            <button
              class="button small"
              type="button"
              onclick={() => (query = '')}>Limpar busca</button
            >
          </div>
        </div>
      {:else}
        <div class="cover-wall">
          {#each filteredItems as item, index (item.id)}
            <article
              class:selected={selectedIds.includes(item.id)}
              class="cover-placard"
            >
              <button
                class="cover-button"
                type="button"
                onclick={() => toggleItem(item.id)}
                aria-pressed={selectedIds.includes(item.id)}
                aria-label={`${selectedIds.includes(item.id) ? 'Remover' : 'Adicionar'} ${item.title}`}
              >
                <span class="cover-image-wrap">
                  {#if item.featureImage}
                    <img
                      src={item.featureImage}
                      alt={item.featureImageAlt || item.title}
                      loading={index < 5 ? 'eager' : 'lazy'}
                      fetchpriority={index === 0 ? 'high' : 'auto'}
                      referrerpolicy="no-referrer"
                    />
                  {:else}
                    <span class="cover-fallback" aria-hidden="true"
                      >{item.title.slice(0, 1)}</span
                    >
                  {/if}
                  <span class="selection-mark" aria-hidden="true"
                    >{#if selectedIds.includes(item.id)}<TallyMark
                        size={24}
                      />{/if}</span
                  >
                </span>
                <span class="placard-meta">
                  <span class="placard-title">{item.title}</span>
                  <span class="placard-number"
                    >{String(index + 1).padStart(4, '0')}</span
                  >
                </span>
              </button>
              <a
                class="placard-source"
                href={item.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Abrir ${item.title} no Mello Games`}
                ><Icon name="external" size={14} /></a
              >
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="action-dock" aria-labelledby="dock-title">
      <div class="dock-selected">
        <div class="dock-heading-row">
          <div>
            <p class="dock-label" id="dock-title">
              Selecionados <span class="dock-count">{selectedItems.length}</span
              >
            </p>
            {#if selectedItems.length < POLL_LIMITS.minOptions}
              <p class="dock-hint">
                Escolha pelo menos {POLL_LIMITS.minOptions} jogos para continuar.
              </p>
            {:else}
              <p class="dock-hint">Você pode escolher quantos jogos quiser.</p>
            {/if}
          </div>
          {#if selectedItems.length > 0}<button
              class="dock-clear"
              type="button"
              onclick={clearSelection}>Limpar seleção</button
            >{/if}
        </div>
        {#if selectedItems.length > 0}
          <div class="selected-slips" aria-label="Jogos escolhidos">
            {#each selectedItems.slice(0, 8) as item (item.id)}
              <button
                class="selected-slip"
                type="button"
                onclick={() => removeItem(item.id)}
                aria-label={`Remover ${item.title}`}
              >
                {#if item.featureImage}<img
                    src={item.featureImage}
                    alt=""
                    loading="lazy"
                    referrerpolicy="no-referrer"
                  />{:else}<span class="slip-fallback" aria-hidden="true"
                    >{item.title.slice(0, 1)}</span
                  >{/if}
                <span>{item.title}</span><span
                  class="slip-remove"
                  aria-hidden="true"><Icon name="x" size={13} /></span
                >
              </button>
            {/each}
            {#if selectedItems.length > 8}<span class="more-slips"
                >+ {selectedItems.length - 8} outros</span
              >{/if}
          </div>
        {:else}
          <p class="dock-empty">
            A cédula está em branco. Clique nos placares acima para adicionar
            opções.
          </p>
        {/if}
      </div>

      <div class="dock-form">
        <div class="dock-form-fields">
          <label>
            <span class="dock-label">Título da votação</span>
            <input
              class="dock-title-input"
              type="text"
              value={title}
              oninput={updateTitle}
              maxlength={POLL_LIMITS.maxTitleLength}
              placeholder="O que vamos jogar no sábado?"
            />
            <span class="dock-input-meta"
              >{title.length}/{POLL_LIMITS.maxTitleLength}</span
            >
          </label>
          <fieldset class="duration-fieldset">
            <legend class="dock-label">Expira em</legend>
            <div class="duration-options">
              <label class:active={durationHours === 24} class="duration-option"
                ><input
                  type="radio"
                  name="duration"
                  value="24"
                  checked={durationHours === 24}
                  onchange={() => (durationHours = 24)}
                /><Icon name="clock" size={19} /><span>24 horas</span></label
              >
              <label class:active={durationHours === 72} class="duration-option"
                ><input
                  type="radio"
                  name="duration"
                  value="72"
                  checked={durationHours === 72}
                  onchange={() => (durationHours = 72)}
                /><Icon name="calendar" size={19} /><span>3 dias</span></label
              >
              <label
                class:active={durationHours === 168}
                class="duration-option"
                ><input
                  type="radio"
                  name="duration"
                  value="168"
                  checked={durationHours === 168}
                  onchange={() => (durationHours = 168)}
                /><Icon name="calendar" size={19} /><span>7 dias</span></label
              >
              <label
                class:active={durationHours === 336}
                class="duration-option"
                ><input
                  type="radio"
                  name="duration"
                  value="336"
                  checked={durationHours === 336}
                  onchange={() => (durationHours = 336)}
                /><Icon name="calendar" size={19} /><span>14 dias</span></label
              >
            </div>
          </fieldset>
          {#if turnstileToken || import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
            <TurnstileWidget
              onToken={(token) => (turnstileToken = token)}
              resetKey={turnstileResetKey}
            />
          {/if}
        </div>
        <div class="dock-submit">
          <button
            class="create-button"
            type="button"
            onclick={createPoll}
            disabled={!canCreate}
          >
            {#if creating}<span class="button-loader" aria-hidden="true"></span>
              Criando…{:else}Criar votação <Icon
                name="arrow-right"
                size={25}
                strokeWidth={2.3}
              />{/if}
          </button>
        </div>
      </div>
    </section>

    <div class="mobile-action-strip" aria-live="polite">
      <span
        ><strong>{selectedItems.length}</strong>
        {selectedItems.length === 1 ? 'escolhido' : 'escolhidos'}</span
      >
      <button type="button" onclick={createPoll} disabled={!canCreate}>
        {creating ? 'Criando…' : 'Criar votação'}
        <Icon name="arrow-right" size={18} />
      </button>
    </div>

    {#if createError}
      <p class="notice error create-error" role="alert">
        <Icon name="x" size={18} /> <span>{createError}</span>
      </p>
    {/if}
  {/if}
{/if}

<style>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .creator-intro {
    min-height: 245px;
  }

  .creator-intro .source-link {
    margin-bottom: 10px;
  }

  .catalog-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
    padding: 16px 0 17px;
    border-top: 2px solid var(--ink);
    border-bottom: 2px solid var(--ink);
  }

  .catalog-count {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.88rem;
  }

  .catalog-count strong {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 1.25rem;
  }

  .catalog-actions {
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .search-field {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: min(360px, 37vw);
    min-height: 46px;
    border: 2px solid var(--line);
    border-radius: 5px;
    padding: 0 12px;
    background: var(--paper-bright);
  }

  .search-field:focus-within {
    border-color: var(--cobalt);
    outline: 3px solid rgb(10 70 232 / 0.24);
  }

  .search-field input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font-size: 0.94rem;
  }

  .select-all {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    border: 0;
    background: transparent;
    font-weight: 700;
    white-space: nowrap;
  }

  .checkbox-mark {
    display: inline-grid;
    place-items: center;
    width: 23px;
    height: 23px;
    border: 2px solid var(--ink);
    background: var(--paper-bright);
  }

  .checkbox-mark.checked {
    border-color: var(--cobalt);
    background: var(--cobalt);
    color: white;
  }

  .catalog-stale {
    margin: 12px 0 -4px;
    color: var(--ink-soft);
    font-size: 0.78rem;
  }

  .cover-wall {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 18px 20px;
    padding: 18px 0 28px;
  }

  .cover-placard {
    position: relative;
    min-width: 0;
    border: 2px solid var(--ink);
    border-radius: 0;
    background: var(--paper-bright);
    box-shadow: var(--shadow-small);
    overflow: hidden;
    clip-path: polygon(
      0 0,
      calc(100% - 10px) 0,
      100% 10px,
      100% 100%,
      10px 100%,
      0 calc(100% - 10px)
    );
    transition:
      transform 180ms ease,
      box-shadow 180ms ease;
  }

  .cover-placard:hover,
  .cover-placard.selected {
    transform: translateY(-4px);
    box-shadow: 0 15px 28px rgb(10 70 232 / 0.2);
  }

  .cover-placard.selected {
    border-color: var(--cobalt);
  }

  .cover-button {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
  }

  .cover-image-wrap {
    position: relative;
    display: block;
    aspect-ratio: 1.16 / 1;
    overflow: hidden;
    background: var(--paper-dim);
  }

  .cover-image-wrap img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .cover-placard:hover .cover-image-wrap img,
  .cover-placard.selected .cover-image-wrap img {
    transform: scale(1.045);
  }

  .cover-fallback,
  .slip-fallback {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    background: var(--cobalt-deep);
    color: white;
    font-family: var(--font-display);
    font-size: 4rem;
    font-weight: 800;
  }

  .selection-mark {
    position: absolute;
    top: 9px;
    right: 9px;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 2px solid var(--ink);
    background: var(--citrus);
    opacity: 0;
    transform: scale(0.8) rotate(-3deg);
    transition:
      opacity 160ms ease,
      transform 160ms ease;
  }

  .cover-placard.selected .selection-mark {
    opacity: 1;
    transform: scale(1) rotate(3deg);
  }

  .placard-meta {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    min-height: 55px;
    padding-left: 12px;
  }

  .placard-title {
    padding: 9px 42px 9px 0;
    font-family: var(--font-display);
    font-size: 1.12rem;
    font-weight: 800;
    letter-spacing: 0.01em;
    line-height: 1;
  }

  .placard-number {
    align-self: stretch;
    display: grid;
    place-items: center;
    border-left: 1px dotted var(--line);
    padding: 0 5px;
    color: var(--ink-soft);
    font-family: var(--font-display);
    font-size: 0.76rem;
    writing-mode: vertical-rl;
  }

  .placard-source {
    position: absolute;
    right: 30px;
    bottom: 5px;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    color: var(--ink-soft);
  }

  .placard-source:hover {
    color: var(--cobalt);
  }

  .catalog-empty {
    min-height: 180px;
    margin-top: 16px;
  }

  .catalog-empty .button {
    margin-top: 14px;
  }

  .action-dock {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(520px, 1.45fr);
    gap: 28px;
    margin: 4px -30px 0;
    border-top: 2px solid var(--citrus);
    border-bottom: 2px solid var(--citrus);
    padding: 23px 30px 25px;
    background: var(--cobalt);
    color: white;
    box-shadow: var(--shadow-paper);
    position: sticky;
    bottom: 0;
    z-index: 4;
    clip-path: polygon(
      10px 0,
      calc(100% - 10px) 0,
      100% 10px,
      100% calc(100% - 10px),
      calc(100% - 10px) 100%,
      10px 100%,
      0 calc(100% - 10px),
      0 10px
    );
  }

  .dock-heading-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .dock-label {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.32rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .dock-count {
    color: var(--citrus);
  }

  .dock-hint,
  .dock-empty {
    margin: 6px 0 0;
    color: rgb(255 255 255 / 0.8);
    font-size: 0.79rem;
    line-height: 1.35;
  }

  .dock-clear {
    align-self: start;
    border: 0;
    border-bottom: 1px solid currentColor;
    padding: 0 0 2px;
    background: transparent;
    color: white;
    font-size: 0.76rem;
    font-weight: 700;
  }

  .selected-slips {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 18px;
  }

  .selected-slip {
    position: relative;
    display: grid;
    grid-template-columns: 32px 1fr;
    align-items: center;
    width: 128px;
    min-height: 52px;
    border: 1px solid var(--ink);
    border-radius: 0;
    padding: 0 16px 0 0;
    overflow: hidden;
    background: var(--paper-bright);
    color: var(--ink);
    text-align: left;
    clip-path: polygon(
      0 0,
      calc(100% - 7px) 0,
      100% 7px,
      100% 100%,
      7px 100%,
      0 calc(100% - 7px)
    );
    animation: slip-to-dock 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .selected-slip img,
  .selected-slip .slip-fallback {
    width: 32px;
    height: 52px;
    object-fit: cover;
  }

  .selected-slip .slip-fallback {
    font-size: 1.35rem;
  }

  .selected-slip > span:not(.slip-remove) {
    display: -webkit-box;
    max-height: 31px;
    padding-left: 7px;
    overflow: hidden;
    font-family: var(--font-display);
    font-size: 0.83rem;
    font-weight: 800;
    line-height: 1;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .slip-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    display: grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: white;
  }

  .more-slips {
    align-self: center;
    font-family: var(--font-display);
    font-weight: 800;
  }

  .dock-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(170px, 0.58fr);
    align-items: end;
    gap: 20px;
  }

  .dock-form-fields {
    min-width: 0;
  }

  .dock-form .dock-label {
    display: block;
    margin-bottom: 7px;
    color: white;
    font-size: 1rem;
  }

  .dock-title-input {
    width: 100%;
    min-height: 44px;
    border: 0;
    border-radius: 5px;
    padding: 9px 12px;
    background: var(--paper-bright);
    color: var(--ink);
    caret-color: var(--signal);
    font-family: var(--font-display);
    font-size: 1.26rem;
    font-weight: 800;
  }

  .dock-input-meta {
    display: block;
    margin-top: 3px;
    color: rgb(255 255 255 / 0.7);
    font-size: 0.72rem;
    text-align: right;
  }

  .duration-fieldset {
    margin: 15px 0 0;
    border: 0;
    padding: 0;
  }

  .duration-options {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .duration-option {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    border: 2px solid transparent;
    border-radius: 4px;
    padding: 7px 10px;
    background: var(--paper-bright);
    color: var(--ink);
    font-size: 0.84rem;
    font-weight: 700;
  }

  .duration-option.active {
    border-color: var(--citrus);
    background: var(--citrus);
  }

  .duration-option input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .duration-option:has(input:focus-visible) {
    outline: 3px solid var(--signal);
    outline-offset: 3px;
  }

  .dock-submit {
    align-self: end;
  }

  .create-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 13px;
    width: 100%;
    min-height: 68px;
    border: 2px solid var(--ink);
    border-radius: 0;
    padding: 12px 15px;
    background: var(--citrus);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 1.7rem;
    font-weight: 900;
    letter-spacing: 0.01em;
    line-height: 0.9;
    transition:
      transform 150ms ease,
      background 150ms ease;
    clip-path: polygon(
      9px 0,
      calc(100% - 9px) 0,
      100% 9px,
      100% calc(100% - 9px),
      calc(100% - 9px) 100%,
      9px 100%,
      0 calc(100% - 9px),
      0 9px
    );
  }

  .create-button:hover:not(:disabled) {
    background: #fff47a;
    transform: translateY(-3px);
  }

  .create-button:disabled {
    background: rgb(255 234 41 / 0.45);
    color: rgb(22 28 34 / 0.65);
  }

  .button-loader {
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 700ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes slip-to-dock {
    from {
      opacity: 0;
      transform: translateY(-18px) scale(0.94) rotate(-2deg);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1) rotate(0);
    }
  }

  .mobile-action-strip {
    display: none;
  }

  .create-error {
    margin-top: 16px;
  }

  .success-panel {
    max-width: 1000px;
    margin: 0 auto;
    border-top: 2px solid var(--ink);
    padding-top: 26px;
  }

  .success-heading {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 20px;
  }

  .success-heading .display-title {
    max-width: 12ch;
  }

  .success-stamp {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border: 2px solid var(--ink);
    background: var(--citrus);
    transform: rotate(-3deg);
  }

  .share-list {
    margin-top: 38px;
    border-top: 2px solid var(--ink);
  }

  .share-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    min-height: 96px;
    border-bottom: 1px solid var(--line);
  }

  .share-row > div:first-child {
    min-width: 0;
  }

  .share-label {
    display: block;
    margin-bottom: 5px;
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .share-row a:not(.button) {
    display: block;
    max-width: 52ch;
    overflow: hidden;
    color: var(--ink-soft);
    font-size: 0.79rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .share-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 7px;
  }

  .success-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: 26px;
    color: var(--ink-soft);
    font-size: 0.83rem;
  }

  @media (max-width: 1150px) {
    .cover-wall {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .action-dock {
      grid-template-columns: minmax(220px, 0.85fr) minmax(470px, 1.15fr);
    }

    .dock-form {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .dock-submit {
      display: block;
    }
  }

  @media (max-width: 800px) {
    .creator-intro {
      min-height: 0;
    }

    .creator-intro .source-link {
      margin-top: 20px;
    }

    .catalog-toolbar {
      display: block;
    }

    .catalog-actions {
      display: grid;
      grid-template-columns: 1fr auto;
      margin-top: 15px;
    }

    .search-field {
      min-width: 0;
    }

    .select-all {
      padding: 0 2px;
      font-size: 0.78rem;
    }

    .cover-wall {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      padding-top: 14px;
      padding-bottom: 94px;
    }

    .cover-placard {
      border-width: 1px;
    }

    .placard-title {
      font-size: 1rem;
    }

    .placard-meta {
      min-height: 52px;
      padding-left: 8px;
    }

    .placard-number {
      font-size: 0.68rem;
    }

    .action-dock {
      display: block;
      margin: 16px -18px 0;
      padding: 19px 18px 20px;
      position: relative;
    }

    .mobile-action-strip {
      position: fixed;
      z-index: 8;
      right: 10px;
      bottom: 10px;
      left: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 58px;
      border: 2px solid var(--ink);
      padding: 7px 7px 7px 14px;
      background: var(--cobalt);
      color: white;
      box-shadow: 0 12px 28px rgb(8 55 182 / 0.28);
      clip-path: polygon(
        8px 0,
        calc(100% - 8px) 0,
        100% 8px,
        100% calc(100% - 8px),
        calc(100% - 8px) 100%,
        8px 100%,
        0 calc(100% - 8px),
        0 8px
      );
    }

    .mobile-action-strip strong {
      color: var(--citrus);
      font-family: var(--font-display);
      font-size: 1.35rem;
    }

    .mobile-action-strip button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 42px;
      border: 2px solid var(--ink);
      padding: 8px 12px;
      background: var(--citrus);
      color: var(--ink);
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 900;
      clip-path: polygon(
        6px 0,
        100% 0,
        100% calc(100% - 6px),
        calc(100% - 6px) 100%,
        0 100%,
        0 6px
      );
    }

    .mobile-action-strip button:disabled {
      background: var(--paper-dim);
      color: var(--ink-soft);
    }

    .selected-slips {
      flex-wrap: nowrap;
      margin-right: -18px;
      padding-bottom: 3px;
      overflow-x: auto;
      scrollbar-color: var(--citrus) transparent;
    }

    .dock-form {
      display: block;
      margin-top: 22px;
    }

    .dock-submit {
      display: block;
      margin-top: 14px;
    }

    .success-heading {
      grid-template-columns: auto 1fr;
      gap: 12px;
    }

    .success-stamp {
      width: 44px;
      height: 44px;
    }

    .share-row,
    .success-footer {
      display: block;
      padding: 17px 0;
    }

    .share-actions {
      margin-top: 13px;
    }

    .success-footer .button {
      width: 100%;
      margin-top: 16px;
    }
  }

  @media (max-width: 430px) {
    .cover-wall {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .catalog-actions {
      grid-template-columns: 1fr;
      gap: 7px;
    }

    .select-all {
      justify-self: start;
    }

    .share-actions .button {
      flex: 1;
      padding-inline: 8px;
      font-size: 0.84rem;
    }
  }
</style>
