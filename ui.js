// ============================================================
//  AnimeTM — UI Components & Rendering
// ============================================================

import {
  starSVG, playSVG, FALLBACK_POSTER,
  escapeHTML, escapeAttr, escapeForInlineJS,
  normalizeId, safeUrl, getImageUrl,
  truncate, getTypeLabel, getEpisodeCount, getTitleSafe, getTitle, getTitleAttr,
  slugify, YOUTUBE_BASE_URL, stripTags
} from './utils.js';

import { HistoryManager } from './history.js';

// ─── Swiper Config ───────────────────────────────────────────
export const baseSwiperConfig = {
  slidesPerView: 2.1,
  spaceBetween: 16,
  grabCursor: true,
  simulateTouch: true,
  allowTouchMove: true,
  touchRatio: 1,
  freeMode: {
    enabled: true,
    sticky: false
  },
  mousewheel: {
    forceToAxis: true,
  },
  speed: 600,
  observer: true,
  observeParents: true,
  breakpoints: {
    480: { slidesPerView: 2.8, spaceBetween: 16 },
    768: { slidesPerView: 3.8, spaceBetween: 24 },
    1024: { slidesPerView: 4.8, spaceBetween: 24 },
    1280: { slidesPerView: 5.8, spaceBetween: 24 },
    1500: { slidesPerView: 6.8, spaceBetween: 24 }
  }
};

// ─── Skeletons ───────────────────────────────────────────────
export function createSkeletonSlides(count, type = 'card') {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="swiper-slide">
        <div class="${type === 'top10' ? 'top10-card' : 'anime-card'}">
          <div class="skeleton skeleton-poster"></div>
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-text-sm"></div>
        </div>
      </div>`;
  }
  return html;
}

// ─── Cards ───────────────────────────────────────────────────
export function renderTop10Card(item, index) {
  const rank = String(index + 1).padStart(2, '0');
  const img = getImageUrl(item);
  const safeTitle = getTitleSafe(item);
  const titleAttr = getTitleAttr(item);
  const eps = getEpisodeCount(item);
  const id = normalizeId(item.id);
  return `
    <div class="swiper-slide">
      <a href="#" class="trending-card" data-action="open-anime" data-id="${id}">
        <div class="top10-media">
          <div class="top10-rank">${rank}</div>
          <div class="top10-poster">
            <img src="${escapeAttr(img)}" alt="${safeTitle}" loading="lazy">
            <div class="poster-overlay">
              <div class="poster-play-btn">${playSVG}</div>
              <div class="poster-gradient"></div>
            </div>
          </div>
        </div>
        <div class="top10-info">
          <h4 class="top10-name" title="${titleAttr}">${safeTitle}</h4>
          <span class="top10-eps">${escapeHTML(eps)}</span>
        </div>
      </a>
    </div>`;
}

export function renderAnimeCard(item, showNewEp = false) {
  const img = getImageUrl(item);
  const safeTitle = getTitleSafe(item);
  const type = getTypeLabel(item);
  const eps = getEpisodeCount(item);
  const id = normalizeId(item.id);
  const score = item?.averageScore ? (item.averageScore / 10).toFixed(1) : 'N/A';
  let badgeHTML = `<div class="card-quality">HD</div>`;
  if (showNewEp) {
    badgeHTML += `<div class="card-new-ep">${escapeHTML(eps)}</div>`;
  } else {
    badgeHTML += `<div class="card-type">${escapeHTML(type)}</div>`;
  }
  return `
    <div class="swiper-slide">
      <a href="#" class="anime-card" data-action="open-anime" data-id="${id}">
        <div class="card-poster">
          <img src="${escapeAttr(img)}" alt="${safeTitle}" loading="lazy">
          <div class="card-overlay">${playSVG}</div>
          ${badgeHTML}
        </div>
        <div class="card-info">
          <h4 class="card-title">${safeTitle}</h4>
          <div class="card-meta">
            <span class="card-sub">&#11088; ${escapeHTML(score)}</span>
            <span class="card-eps">${eps}</span>
          </div>
        </div>
      </a>
    </div>`;
}

// ─── Hero ────────────────────────────────────────────────────
export function renderHero(item) {
  const heroContent = document.getElementById('hero-content');
  if (!heroContent) return;
  const img = safeUrl(item?.bannerImage, getImageUrl(item));
  const posterImg = getImageUrl(item);
  const title = getTitle(item);
  const synopsis = (stripTags(item?.description) || 'No description available.').replace(/\s+/g, ' ');
  const score = item?.averageScore ? (item.averageScore / 10).toFixed(1) : 'N/A';
  const year = item?.seasonYear || '\u2014';
  const duration = item?.episodes ? `${item.episodes} Ep` : (item?.format === 'MOVIE' ? 'Movie' : 'Ongoing');
  const genreHTML = (item.genres || []).slice(0, 3).map(g => `<span class="cine-meta-text"><span class="cine-delimiter">\u00b7</span>${escapeHTML(g)}</span>`).join('');
  const heroId = normalizeId(item.id);
  const safeTitle = escapeForInlineJS(title);

  const heroHTML = `
    <div class="cine-hero-container">
      <div class="cine-hero-info">
        <div class="cine-hero-logo">
          <h1 class="cine-title"></h1>
        </div>
        <div class="cine-meta-row">
          <span class="cine-meta-score">
            <svg xmlns="http://www.w3.org/2000/svg" fill="#e8b647" viewBox="0 0 24 24" class="cine-star"><path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"/></svg>
            <span class="score-val"></span>
          </span>
          <span class="cine-delimiter">\u00b7</span>
          <span class="cine-meta-text year-val"></span>
          <span class="cine-delimiter">\u00b7</span>
          <span class="cine-meta-text duration-val"></span>
          ${genreHTML}
        </div>
        <p class="cine-synopsis"></p>
        <div class="cine-actions">
          <button class="cine-btn cine-btn-play">
            <svg class="cine-play-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>
            <span class="cine-btn-text">Play Episode</span>
          </button>

          <button class="cine-btn cine-btn-glass action-trailer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cine-icon-sm"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
            <span>Trailer</span>
          </button>
        </div>
      </div>
      <div class="cine-hero-poster-wrapper">
        <div class="cine-hero-poster-card">
          <img class="cine-hero-poster">
        </div>
      </div>
    </div>`;

  heroContent.innerHTML = heroHTML;

  // Set safe textContent for all dynamic values to prevent XSS
  const titleEl = heroContent.querySelector('.cine-title');
  if (titleEl) titleEl.textContent = title;

  const scoreEl = heroContent.querySelector('.score-val');
  if (scoreEl) scoreEl.textContent = score;

  const yearEl = heroContent.querySelector('.year-val');
  if (yearEl) yearEl.textContent = year;

  const durationEl = heroContent.querySelector('.duration-val');
  if (durationEl) durationEl.textContent = duration;

  const synopsisEl = heroContent.querySelector('.cine-synopsis');
  if (synopsisEl) synopsisEl.textContent = synopsis;

  const posterImgEl = heroContent.querySelector('.cine-hero-poster');
  if (posterImgEl) {
    posterImgEl.src = safeUrl(posterImg, FALLBACK_POSTER);
    posterImgEl.alt = title;
  }

  // Backdrop poster behind the hero content
  const heroBg = document.getElementById('hero-bg');
  if (heroBg) {
    let bgImg = heroBg.querySelector('.hero-background-poster');
    if (!bgImg) {
      bgImg = document.createElement('img');
      bgImg.className = 'hero-background-poster';
      bgImg.alt = '';
      bgImg.setAttribute('aria-hidden', 'true');
      heroBg.prepend(bgImg);
    }
    bgImg.src = safeUrl(img, FALLBACK_POSTER);
  }

  // Wire up buttons
  const playBtn = heroContent.querySelector('.cine-btn-play');
  if (playBtn) playBtn.addEventListener('click', (e) => window.openWatchPlayer(e, heroId, title));

  const trailerBtn = heroContent.querySelector('.action-trailer');
  if (trailerBtn) {
    trailerBtn.addEventListener('click', () => {
      if (item.trailer && item.trailer.site === 'youtube' && item.trailer.id) {
        window.open(`${YOUTUBE_BASE_URL}${encodeURIComponent(item.trailer.id)}`, '_blank', 'noopener');
      } else {
        window.showModalAlert('No trailer available on MyAnimeList');
      }
    });
  }
}

// ─── Continue Watching ───────────────────────────────────────
export function renderContinueWatching() {
  const section = document.getElementById('continue-section');
  const wrapper = document.getElementById('continue-wrapper');
  if (!section || !wrapper) return;

  // Only show on Home page
  if (window.__browseState?.active) {
    section.style.display = 'none';
    return;
  }

  const history = Object.values(HistoryManager.getAll())
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  wrapper.innerHTML = history.map(item => `
    <div class="swiper-slide">
      <div class="continue-card" data-action="open-watch-from-history" data-id="${escapeAttr(item.id)}" data-ep-index="${Number(item.epIndex) || 0}" data-time="${Number(item.time) || 0}">
        <div class="continue-poster">
          <img src="${escapeAttr(item.image)}" alt="${escapeHTML(item.title)}" loading="lazy">
          <div class="continue-overlay">
            <div class="continue-play-btn">${playSVG}</div>
          </div>
          <div class="continue-progress-container">
            <div class="continue-progress-bar" style="width: ${item.percent}%"></div>
          </div>
        </div>
        <div class="continue-info">
          <span class="continue-name">${escapeHTML(item.title)}</span>
          <span class="continue-ep">${escapeHTML(item.epLabel)}</span>
        </div>
      </div>
    </div>
  `).join('');

  window.__reinitContinueSwiper?.();
}

// ─── Detail Modal ────────────────────────────────────────────
export function renderDetailModal(item, activeTab = 'overview') {
  const detailContent = document.getElementById('detail-content');
  if (!detailContent) return;
  const img = getImageUrl(item);
  const backgroundImg = safeUrl(item?.bannerImage, img);
  const safeTitle = getTitleSafe(item);
  const titleAttr = getTitleAttr(item);
  const synopsis = stripTags(item?.description) || 'No description available.';
  const id = normalizeId(item.id);
  const score = item?.averageScore ? (item.averageScore / 10).toFixed(1) : '\u2014';
  const type = getTypeLabel(item);
  const status = item?.status ? item.status.charAt(0) + item.status.slice(1).toLowerCase() : '\u2014';
  const episodes = item?.episodes ? `${item.episodes} Episodes` : (item?.nextAiringEpisode ? `${item.nextAiringEpisode.episode - 1} Episodes` : 'Ongoing');
  const year = item?.seasonYear || '\u2014';
  const genres = (item.genres || []).slice(0, 5);
  const genreHTML = genres.map(g => `<span class="dm2-genre">${escapeHTML(g)}</span>`).join('');
  detailContent.innerHTML = `
    <div class="detail-tabs" role="tablist" aria-label="Anime details">
      ${renderDetailTabs(activeTab)}
    </div>
    <section class="detail-tab-panel${activeTab === 'overview' ? ' active' : ''}" role="tabpanel" id="detail-panel-overview" aria-labelledby="detail-tab-overview" data-detail-panel="overview">
    <div class="dm2-card">
      <!-- AniZip fanart backdrop, with poster fallback -->
      <img class="dm2-bg-img" src="${escapeAttr(backgroundImg)}" alt="" aria-hidden="true">
      <div class="dm2-bg-overlay"></div>
      <!-- Left: Poster -->
      <div class="dm2-poster">
        <img src="${escapeAttr(img)}" alt="${titleAttr}" loading="lazy">
      </div>
      <!-- Right: Info -->
      <div class="dm2-info">
        <h2 class="dm2-title">${safeTitle}</h2>
        <!-- Meta row -->
        <div class="dm2-meta-row">
          ${score !== '\u2014' ? `<span class="dm2-score-badge">&#11088; ${escapeHTML(score)}</span>` : ''}
          <span class="dm2-meta-tag">${escapeHTML(type)}</span>
          <span class="dm2-meta-tag">${escapeHTML(status)}</span>
          <span class="dm2-meta-tag">${escapeHTML(episodes)}</span>
          <span class="dm2-meta-tag">${escapeHTML(year)}</span>
        </div>
        <!-- Genre pills -->
        <div class="dm2-genres">${genreHTML}</div>
        <!-- Description -->
        <p class="dm2-desc">${synopsis.length > 300 ? synopsis.substring(0, 300) + '...' : synopsis}</p>
        <!-- CTA -->
         <button class="dm2-watch-btn" data-action="watch-now" data-id="${id}" data-title="${titleAttr}">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
           Watch Now
         </button>
      </div>
    </div>
    </section>
    <section class="detail-tab-panel${activeTab === 'related' ? ' active' : ''}" role="tabpanel" id="detail-panel-related" aria-labelledby="detail-tab-related" data-detail-panel="related">
      <div class="related-series-panel" id="detail-related-panel">
        <div class="detail-loading"><div class="spinner"></div><p>Loading release order...</p></div>
      </div>
    </section>`;

  const tabButtons = Array.from(detailContent.querySelectorAll('[data-detail-tab]'));
  const selectTab = (tab) => {
    const selected = tab.dataset.detailTab;
    tabButtons.forEach(button => {
      const active = button === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.setAttribute('tabindex', active ? '0' : '-1');
    });
    detailContent.querySelectorAll('[data-detail-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.detailPanel === selected);
    });
    if (selected === 'related') revealCurrentRelease();
  };
  tabButtons.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      const last = tabButtons.length - 1;
      let target = null;
      if (event.key === 'ArrowRight') target = tabButtons[index === last ? 0 : index + 1];
      else if (event.key === 'ArrowLeft') target = tabButtons[index === 0 ? last : index - 1];
      else if (event.key === 'Home') target = tabButtons[0];
      else if (event.key === 'End') target = tabButtons[last];
      if (!target) return;
      event.preventDefault();
      selectTab(target);
      target.focus();
    });
  });
}

function renderDetailTabs(activeTab) {
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'related', label: 'Full Release Order' }
  ].map(({ id, label }) => {
    const active = id === activeTab;
    return `<button class="detail-tab${active ? ' active' : ''}" type="button" role="tab" id="detail-tab-${id}" aria-controls="detail-panel-${id}" aria-selected="${active}" tabindex="${active ? '0' : '-1'}" data-detail-tab="${id}">${label}</button>`;
  }).join('');
}

function isRelatedSpecial(item) {
  const type = String(item?.type || '').toUpperCase();
  const title = String(item?.title || '').toUpperCase();
  if (['MUSIC', 'PV', 'CM', 'TV SPECIAL', 'SPECIAL'].includes(type)) return true;
  return /\b(?:PV|CM)\b/.test(title)
    || /\bTV SPECIAL\b/.test(title)
    || /\bSPECIAL\b/.test(title);
}

function getVisibleRelatedItems(items, hideSpecials, currentId) {
  if (!Array.isArray(items)) return [];
  if (!hideSpecials) return items;
  return items.filter(item => item.id === currentId || !isRelatedSpecial(item));
}

function formatReleaseDate(value) {
  if (!value) return 'Release date TBA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

function formatRelatedEpisodes(item) {
  if (String(item?.type || '').toUpperCase() === 'MOVIE') return 'Movie';
  if (Number.isInteger(item?.episodes) && item.episodes > 0) return `${item.episodes} eps`;
  return 'Episodes TBA';
}

function revealCurrentRelease() {
  const panel = document.getElementById('detail-related-panel');
  if (!panel || !panel.closest('.detail-tab-panel')?.classList.contains('active')) return;
  const currentRow = panel.querySelector('.related-order-item.current');
  if (!currentRow) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  currentRow.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
}

export function renderRelatedSeries(payload, currentId, state = 'ready') {
  const panel = document.getElementById('detail-related-panel');
  if (!panel) return;
  panel.__relatedPayload = payload;
  panel.__relatedCurrentId = normalizeId(currentId);

  if (state === 'loading') {
    panel.innerHTML = `<div class="detail-loading"><div class="spinner"></div><p>Loading release order...</p></div>`;
    return;
  }
  if (state === 'error' || !payload) {
    panel.innerHTML = `<div class="related-empty related-error"><strong>Release order unavailable</strong><span>We couldn't load connected anime right now. Try again later.</span></div>`;
    return;
  }

  const currentAnimeId = panel.__relatedCurrentId;
  const hideSpecials = panel.dataset.hideSpecials === 'true';
  const visibleItems = getVisibleRelatedItems(payload.items, hideSpecials, currentAnimeId);
  const hasOtherItems = visibleItems.some(item => item.id !== currentAnimeId);
  const listHTML = visibleItems.map((item, index) => {
    const isCurrent = item.id === currentAnimeId;
    const title = item.title || 'Unknown';
    const image = safeUrl(item.imageUrl, FALLBACK_POSTER);
    const relation = item.relation || 'Related';
    const content = `
      <span class="related-order-number">${String(index + 1).padStart(2, '0')}</span>
      <img class="related-order-image" src="${escapeAttr(image)}" alt="" loading="lazy">
      <span class="related-order-main">
        <strong class="related-order-title">${escapeHTML(title)}</strong>
        ${item.englishTitle && item.englishTitle !== title ? `<span class="related-order-alt-title">${escapeHTML(item.englishTitle)}</span>` : ''}
        <span class="related-order-meta">
          <span>${escapeHTML(item.type || 'ANIME')}</span>
          <span>${escapeHTML(formatRelatedEpisodes(item))}</span>
          <span>${escapeHTML(formatReleaseDate(item.airedFrom))}</span>
        </span>
      </span>
      ${isCurrent ? '<span class="related-order-current">Selected</span>' : `<span class="related-order-relation">${escapeHTML(relation)}</span>`}`;
    return isCurrent
      ? `<div class="related-order-item current" aria-current="true">${content}</div>`
      : `<button class="related-order-item" type="button" data-action="open-anime" data-id="${normalizeId(item.id)}">${content}</button>`;
  }).join('');

  panel.innerHTML = `
    <div class="related-series-header">
      <div>
        <span class="related-series-kicker">Watch order</span>
        <h3>${escapeHTML(payload.title || 'Full Release Order')}</h3>
        <p>${visibleItems.length} release${visibleItems.length === 1 ? '' : 's'} in chronological order</p>
      </div>
      <label class="related-special-toggle">
        <input type="checkbox" data-hide-specials ${hideSpecials ? 'checked' : ''}>
        <span>Hide Specials</span>
      </label>
    </div>
    ${hasOtherItems
      ? `<div class="related-order-list">${listHTML}</div>`
      : hideSpecials && visibleItems.length < (payload.items || []).length
        ? `<div class="related-empty"><strong>Only specials found</strong><span>Untick "Hide Specials" to see this title's specials and side stories.</span></div>`
        : `<div class="related-empty"><strong>No connected releases found</strong><span>This title does not have additional prequels, sequels, or related anime in the provider data.</span></div>`}
  `;

  panel.querySelector('[data-hide-specials]')?.addEventListener('change', event => {
    const checked = event.target.checked;
    panel.dataset.hideSpecials = checked ? 'true' : 'false';
    renderRelatedSeries(panel.__relatedPayload, panel.__relatedCurrentId);
    const nextToggle = panel.querySelector('[data-hide-specials]');
    if (nextToggle) {
      nextToggle.checked = checked;
      nextToggle.focus();
    }
  });

  revealCurrentRelease();
}

// ─── Browse Card ─────────────────────────────────────────────
export function renderBrowseCard(item, rank) {
  const id = normalizeId(item.id);
  const img = getImageUrl(item);
  const safeTitle = getTitleSafe(item);
  const titleAttr = getTitleAttr(item);
  const type = getTypeLabel(item);
  const score = item?.averageScore
    ? `<span class="browse-card-score"><svg class="browse-score-icon" viewBox="0 0 24 24" fill="#e8b647" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>${(item.averageScore / 10).toFixed(1)}</span>`
    : '';
  return `
    <div class="browse-card" data-action="open-anime" data-id="${id}">
      <div class="browse-card-poster">
        <img src="${escapeAttr(img)}" alt="${titleAttr}" loading="lazy">
        <div class="browse-card-overlay">${playSVG}</div>
        <div class="browse-card-badge">${escapeHTML(type)}</div>
        ${score ? `<div class="browse-card-score-badge">${score}</div>` : ''}
      </div>
      <div class="browse-card-info">
        <div class="browse-card-title" title="${titleAttr}">${safeTitle}</div>
        <div class="browse-card-meta">
          ${escapeHTML(getEpisodeCount(item))}
        </div>
      </div>
    </div>`;
}

// ─── Swiper Helpers ──────────────────────────────────────────
export function reinitSwiper(swiperInstance, selector, prev, next) {
  if (swiperInstance) swiperInstance.destroy(true, true);
  return new Swiper(selector, {
    ...baseSwiperConfig,
    navigation: { nextEl: next, prevEl: prev }
  });
}

// ─── Hero Dots ───────────────────────────────────────────────
export function renderHeroDots(items, activeIndex) {
  const heroEl = document.getElementById('hero');
  let dotsEl = document.getElementById('hero-dots');
  if (!dotsEl) {
    dotsEl = document.createElement('div');
    dotsEl.id = 'hero-dots';
    dotsEl.className = 'hero-dots';
    heroEl.appendChild(dotsEl);
  }
  dotsEl.innerHTML = items.map((_, i) =>
    `<button class="hero-dot ${i === activeIndex ? 'active' : ''}" data-index="${i}" aria-label="Slide ${i + 1}"></button>`
  ).join('');
  dotsEl.querySelectorAll('.hero-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      window.goToHeroSlide(idx);
      window.resetHeroTimer();
    });
  });
}
