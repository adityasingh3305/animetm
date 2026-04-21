const starSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#facc15"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const playSVG = `<svg class="play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const FALLBACK_POSTER = 'https://via.placeholder.com/300x450/141414/333?text=No+Image';
const FALLBACK_EPISODE_COUNT = 12;
const FALLBACK_ONGOING_EPISODE_COUNT = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const HERO_ROTATION_MS = 20000;
// We retrieve the stream URL from env or server in a real app,
// but for this client side, we use a placeholder or fetch it
const STREAM_BASE_URL = 'https://megaplay.buzz';
const YOUTUBE_BASE_URL = 'https://www.youtube.com/watch?v=';
let currentWatch = { epPageSize: 100, language: 'sub', episodes: [], epCurrentPage: 0, episodeIndex: 0, id: null, title: '', searchQuery: '', data: null };
function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}
function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, '&#96;');
}
function escapeForInlineJS(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3C')
    .replace(/>/g, '\\x3E');
}
function normalizeId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) ? id : 0;
}
function safeUrl(url, fallback = '') {
  if (!url) return fallback;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (error) {
    return fallback;
  }
  return fallback;
}
function getImageUrl(item) {
  return safeUrl(
    item?.coverImage?.extraLarge ||
    item?.coverImage?.large ||
    item?.image ||
    FALLBACK_POSTER,
    FALLBACK_POSTER
  );
}

// History Manager
const HistoryManager = {
  key: 'animetm_history',
  save(anime, epIndex, time, duration) {
    const history = this.getAll();
    history[anime.id] = {
      id: anime.id,
      title: anime.title?.english || anime.title?.romaji || 'Unknown',
      image: getImageUrl(anime),
      epIndex,
      epLabel: anime.episodes?.[epIndex]?.title || `Episode ${epIndex + 1}`,
      time,
      duration,
      percent: Math.round((time / duration) * 100) || 0,
      updatedAt: Date.now()
    };
    localStorage.setItem(this.key, JSON.stringify(history));
    if (!browseState.active) {
      renderContinueWatching();
    }
  },
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.key)) || {};
    } catch {
      return {};
    }
  },
  clear() {
    localStorage.removeItem(this.key);
    renderContinueWatching();
  }
};
function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}
function getTypeLabel(item) {
  return item?.format || 'TV';
}
function getEpisodeCount(item) {
  if (item?.nextAiringEpisode?.episode) return (item.nextAiringEpisode.episode - 1) + ' Ep';
  if (item?.episodes) return item.episodes + ' Ep';
  return 'Ongoing';
}
function isJapaneseAnime(anime) {
  // This is a stub used in previous logic that was not fully implemented
  return anime?.origin === 'JP' || true;
}
function createSkeletonSlides(count, type = 'card') {
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
function renderTop10Card(item, index) {
  const rank = String(index + 1).padStart(2, '0');
  const img = getImageUrl(item);
  const title = item?.title?.english || item?.title?.romaji || 'Unknown';
  const eps = getEpisodeCount(item);
  const id = normalizeId(item.id);
  const safeTitle = escapeHTML(title);
  return `
    <div class="swiper-slide">
      <a href="#" class="trending-card" data-id="${id}" onclick="openAnimeDetail(event, '${id}')">
        <div class="top10-rank">${rank}</div>
        <div class="top10-poster">
          <img src="${escapeAttr(img)}" alt="${safeTitle}" loading="lazy">
          <div class="poster-overlay">
            <div class="poster-play-btn">${playSVG}</div>
            <div class="poster-gradient"></div>
          </div>
        </div>
        <div class="top10-info">
          <h4 class="top10-name" title="${escapeAttr(title)}">${safeTitle}</h4>
          <span class="top10-eps">${escapeHTML(eps)}</span>
        </div>
      </a>
    </div>`;
}
function renderAnimeCard(item, showNewEp = false) {
  const img = getImageUrl(item);
  const title = item?.title?.english || item?.title?.romaji || 'Unknown';
  const type = getTypeLabel(item);
  const eps = getEpisodeCount(item);
  const id = normalizeId(item.id);
  const score = item?.averageScore ? (item.averageScore / 10).toFixed(1) : 'N/A';
  const safeTitle = escapeHTML(title);
  let badgeHTML = `<div class="card-quality">HD</div>`;
  if (showNewEp) {
    badgeHTML += `<div class="card-new-ep">${escapeHTML(eps)}</div>`;
  } else {
    badgeHTML += `<div class="card-type">${escapeHTML(type)}</div>`;
  }
  return `
    <div class="swiper-slide">
      <a href="#" class="anime-card" data-id="${id}" onclick="openAnimeDetail(event, '${id}')">
        <div class="card-poster">
          <img src="${escapeAttr(img)}" alt="${safeTitle}" loading="lazy">
          <div class="card-overlay">${playSVG}</div>
          ${badgeHTML}
        </div>
        <div class="card-info">
          <h4 class="card-title">${safeTitle}</h4>
          <div class="card-meta">
            <span class="card-sub">&#11088; ${score}</span>
            <span class="card-eps">${eps}</span>
          </div>
        </div>
      </a>
    </div>`;
}
function renderHero(item) {
  const heroContent = document.getElementById('hero-content');
  const heroBg = document.getElementById('hero-bg');
  if (!heroContent) return;
  const img = safeUrl(item?.bannerImage, getImageUrl(item));
  const posterImg = getImageUrl(item);
  const title = item?.title?.english || item?.title?.romaji || 'Unknown';
  const synopsis = stripTags(item?.description) || 'No description available.';
  const score = item?.averageScore ? (item.averageScore / 10).toFixed(1) : 'N/A';
  const year = item?.seasonYear || '&mdash;';
  const duration = item?.episodes ? `${item.episodes} Ep` : (item?.format === 'MOVIE' ? 'Movie' : 'Ongoing');
  const genreHTML = (item.genres || []).slice(0, 3).map(g => `<span class="cine-meta-text"><span class="cine-delimiter">&middot;</span>${escapeHTML(g)}</span>`).join('');
  const trailerAction = (item.trailer && item.trailer.site === 'youtube' && item.trailer.id)
    ? `window.open('${YOUTUBE_BASE_URL}${encodeURIComponent(item.trailer.id)}', '_blank', 'noopener')`
    : `showModalAlert('No trailer available on AniList')`;
  // Background images removed for AMOLED dark theme
  // Hardcoded Your Name 4K video is used as the background, do not overwrite it.
  const heroId = normalizeId(item.id);
  const safeTitle = escapeForInlineJS(title);

  // use textContent for dynamic text to prevent XSS. For structure, we can still use innerHTML but be very careful.
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
          <span class="cine-delimiter">&middot;</span>
          <span class="cine-meta-text year-val"></span>
          <span class="cine-delimiter">&middot;</span>
          <span class="cine-meta-text duration-val"></span>
          ${genreHTML}
        </div>
        <p class="cine-synopsis"></p>
        <div class="cine-actions">
          <button class="cine-btn cine-btn-play">
            <svg class="cine-play-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>
            <span class="cine-btn-text">Play Episode</span>
          </button>
          <button class="cine-btn cine-btn-glass action-mylist">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cine-icon-sm"><path d="M12 5v14M5 12h14"/></svg>
            <span>My List</span>
          </button>
          <button class="cine-btn cine-btn-glass action-dl">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cine-icon-sm"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x2="12" y1="15" y2="3"></line></svg>
            <span>Download</span>
          </button>
          <button class="cine-btn cine-btn-glass action-col">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cine-icon-sm"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            <span>Collection</span>
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

  // Set safe properties
  heroContent.querySelector('.cine-title').textContent = title;
  heroContent.querySelector('.score-val').textContent = score;
  heroContent.querySelector('.year-val').innerHTML = year;
  heroContent.querySelector('.duration-val').textContent = duration;
  heroContent.querySelector('.cine-synopsis').textContent = synopsis;
  
  const posterImgEl = heroContent.querySelector('.cine-hero-poster');
  posterImgEl.src = safeUrl(posterImg, FALLBACK_POSTER);
  posterImgEl.alt = title;

  heroContent.querySelector('.cine-btn-play').onclick = (e) => openWatchPlayer(e, heroId, title);
  heroContent.querySelector('.action-mylist').onclick = () => showModalAlert('Added to your list!');
  heroContent.querySelector('.action-dl').onclick = () => showModalAlert('Download feature not available.');
  heroContent.querySelector('.action-col').onclick = () => showModalAlert('Added to collection!');
  heroContent.querySelector('.action-trailer').onclick = () => {
    if (item.trailer && item.trailer.site === 'youtube' && item.trailer.id) {
      window.open(`${YOUTUBE_BASE_URL}${encodeURIComponent(item.trailer.id)}`, '_blank', 'noopener');
    } else {
      showModalAlert('No trailer available on AniList');
    }
  };
}
const baseSwiperConfig = {
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
let top10Swiper, trendingSwiper, latestSwiper, continueSwiper;
function initSwipers() {
  top10Swiper = new Swiper('#top10-swiper', {
    ...baseSwiperConfig,
    navigation: { nextEl: '#top10-next', prevEl: '#top10-prev' }
  });
  trendingSwiper = new Swiper('#trending-swiper', {
    ...baseSwiperConfig,
    navigation: { nextEl: '#trending-next', prevEl: '#trending-prev' }
  });
  latestSwiper = new Swiper('#latest-swiper', {
    ...baseSwiperConfig,
    navigation: { nextEl: '#latest-next', prevEl: '#latest-prev' }
  });
  continueSwiper = new Swiper('#continue-swiper', {
    ...baseSwiperConfig,
    navigation: { nextEl: '#continue-next', prevEl: '#continue-prev' }
  });
}

function renderContinueWatching() {
  const section = document.getElementById('continue-section');
  const wrapper = document.getElementById('continue-wrapper');
  if (!section || !wrapper) return;

  // Only show on Home page
  if (browseState.active) {
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
      <div class="continue-card" onclick="openWatchFromHistory('${item.id}', ${item.epIndex}, ${item.time})">
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

  continueSwiper = reinitSwiper(continueSwiper, '#continue-swiper', '#continue-prev', '#continue-next');
}

async function openWatchFromHistory(id, epIndex, startTime) {
  try {
    const anime = await MAL_API.getAnimeDetails(id);
    if (anime) {
      currentWatch.id = id;
      currentWatch.data = anime;
      currentWatch.startTime = startTime;
      openWatchPlayer(null, id, anime.title?.english || anime.title?.romaji, epIndex);
    }
  } catch (err) {
    console.error('Error opening from history:', err);
  }
}

function reinitSwiper(swiperInstance, selector, prev, next) {
  if (swiperInstance) swiperInstance.destroy(true, true);
  return new Swiper(selector, {
    ...baseSwiperConfig,
    navigation: { nextEl: next, prevEl: prev }
  });
}
let heroRotationTimer = null;
let heroCurrentIndex = 0;
let heroItems = [];
function renderHeroDots(items, activeIndex) {
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
      goToHeroSlide(idx);
      resetHeroTimer();
    });
  });
}
function goToHeroSlide(index) {
  heroCurrentIndex = index;
  const heroContent = document.getElementById('hero-content');
  if (heroContent) heroContent.classList.add('hero-fade-out');
  setTimeout(() => {
    if (heroItems[heroCurrentIndex]) renderHero(heroItems[heroCurrentIndex]);
    if (heroContent) heroContent.classList.remove('hero-fade-out');
    renderHeroDots(heroItems, heroCurrentIndex);
  }, 320);
}
function resetHeroTimer() {
  if (heroRotationTimer) clearInterval(heroRotationTimer);
  heroRotationTimer = setInterval(() => {
    if (!heroItems || heroItems.length === 0) return;
    const next = (heroCurrentIndex + 1) % heroItems.length;
    goToHeroSlide(next);
  }, HERO_ROTATION_MS);
}
function startHeroRotation(items) {
  heroItems = items;
  heroCurrentIndex = 0;
  renderHeroDots(items, 0);
  const heroEl = document.getElementById('hero');
  if (heroEl) {
    heroEl.addEventListener('mouseenter', () => { if (heroRotationTimer) clearInterval(heroRotationTimer); });
    heroEl.addEventListener('mouseleave', resetHeroTimer);
  }
  resetHeroTimer();
}
function stopHeroRotation() {
  if (heroRotationTimer) {
    clearInterval(heroRotationTimer);
    heroRotationTimer = null;
  }
}
window.addEventListener('beforeunload', stopHeroRotation);
window.addEventListener('pagehide', stopHeroRotation);
async function loadAllData() {
  const top10Wrapper = document.getElementById('top10-wrapper');
  const trendingWrapper = document.getElementById('trending-wrapper');
  const latestWrapper = document.getElementById('latest-wrapper');
  
  if (top10Wrapper) top10Wrapper.innerHTML = createSkeletonSlides(10, 'top10');
  if (trendingWrapper) trendingWrapper.innerHTML = createSkeletonSlides(10, 'card');
  if (latestWrapper) latestWrapper.innerHTML = createSkeletonSlides(10, 'card');
  
  initSwipers();

  fetchSpotlight().then(spotlight => {
    if (spotlight && spotlight.length > 0) {
      renderHero(spotlight[0]);
      if (top10Wrapper) top10Wrapper.innerHTML = spotlight.map((a, i) => renderTop10Card(a, i)).join('');
      top10Swiper = reinitSwiper(top10Swiper, '#top10-swiper', '#top10-prev', '#top10-next');
      startHeroRotation(spotlight);
    }
  }).catch(err => console.warn('Spotlight error:', err));

  fetchTrendingAnime(1).then(trending => {
    if (trending && trending.length > 0) {
      if (trendingWrapper) trendingWrapper.innerHTML = trending.map(a => renderAnimeCard(a)).join('');
      trendingSwiper = reinitSwiper(trendingSwiper, '#trending-swiper', '#trending-prev', '#trending-next');
    }
  }).catch(err => console.warn('Trending error:', err));

  fetchRecentEpisodes(1).then(recent => {
    if (recent && recent.length > 0) {
      if (latestWrapper) latestWrapper.innerHTML = recent.map(a => renderAnimeCard(a, true)).join('');
      latestSwiper = reinitSwiper(latestSwiper, '#latest-swiper', '#latest-prev', '#latest-next');
    }
  }).catch(err => console.warn('Recent error:', err));
}
const detailModal = document.getElementById('detail-modal');
const detailContent = document.getElementById('detail-content');
const detailClose = document.getElementById('detail-close');
async function openAnimeDetail(event, id) {
  if (event) event.preventDefault();
  updateRoute(`anime/${id}`);
  if (detailModal) detailModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (detailContent) detailContent.innerHTML = `<div class="detail-loading"><div class="spinner"></div><p>Loading...</p></div>`;
  try {
    const anime = await fetchAnimeInfo(normalizeId(id));
    if (!anime) throw new Error('No data');
    const title = anime?.title?.english || anime?.title?.romaji || '';
    history.replaceState(null, '', `#anime/${slugify(title)}`);
    renderDetailModal(anime);
  } catch (err) {
    if (detailContent) detailContent.innerHTML = `<div class="detail-loading"><p>Failed to load details.</p></div>`;
  }
}
function renderDetailModal(item) {
  if (!detailContent) return;
  const img = getImageUrl(item);
  const title = item?.title?.english || item?.title?.romaji || 'Unknown';
  const synopsis = stripTags(item?.description) || 'No description available.';
  const id = normalizeId(item.id);
  const score = item?.averageScore ? (item.averageScore / 10).toFixed(1) : '&mdash;';
  const type = getTypeLabel(item);
  const status = item?.status ? item.status.charAt(0) + item.status.slice(1).toLowerCase() : '&mdash;';
  const episodes = item?.episodes ? `${item.episodes} Episodes` : (item?.nextAiringEpisode ? `${item.nextAiringEpisode.episode - 1} Episodes` : 'Ongoing');
  const year = item?.seasonYear || '&mdash;';
  const genres = (item.genres || []).slice(0, 5);
  const genreHTML = genres.map(g => `<span class="dm2-genre">${escapeHTML(g.toUpperCase())}</span>`).join('');
  const safeTitle = escapeForInlineJS(title);
  detailContent.innerHTML = `
    <div class="dm2-card">
      <!-- Left: Poster -->
      <div class="dm2-poster">
        <img src="${escapeAttr(img)}" alt="${escapeHTML(title)}" loading="lazy">
      </div>
      <!-- Right: Info -->
      <div class="dm2-info">
        <h2 class="dm2-title">${escapeHTML(title)}</h2>
        <!-- Meta row -->
        <div class="dm2-meta-row">
          ${score !== '&mdash;' ? `<span class="dm2-score-badge">&#11088; ${score}</span>` : ''}
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
        <button class="dm2-watch-btn" onclick="closeDetailModal(); openWatchPlayer(null, '${id}', '${safeTitle}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Watch Now
        </button>
      </div>
    </div>`;
}
function closeDetailModal() {
  if (detailContent) {
    const trailerIframe = detailContent.querySelector('.dm-player-iframe-wrap iframe');
    if (trailerIframe) trailerIframe.src = '';
  }
  if (detailModal) detailModal.classList.remove('active');
  if (window.location.hash.startsWith('#anime/')) {
    history.pushState(null, '', window.location.pathname);
  }
  document.body.style.overflow = '';
}
if (detailClose) detailClose.addEventListener('click', closeDetailModal);

async function openWatchPlayer(event, id, title, initialEpisodeIndex = 0) {
  if (event) event.preventDefault();
  history.replaceState(null, '', `#watch/${slugify(title)}`);
  currentWatch.id = normalizeId(id);
  currentWatch.title = stripTags(title) || 'Unknown';
  currentWatch.searchQuery = '';
  currentWatch.epCurrentPage = 0;
  
  const watchEpSearchInput = document.getElementById('ws-ep-search-input');
  if (watchEpSearchInput) watchEpSearchInput.value = '';
  
  const watchModal = document.getElementById('watch-modal');
  if (watchModal) watchModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  const watchTitle = document.getElementById('watch-title');
  if (watchTitle) watchTitle.textContent = currentWatch.title;
  
  const watchSeasonsBlock = document.getElementById('watch-seasons-block');
  const watchSeasonsGrid = document.getElementById('watch-seasons-grid');
  if (watchSeasonsBlock) watchSeasonsBlock.style.display = 'none';
  
  const watchEpList = document.getElementById('ws-ep-list');
  if (watchEpList) watchEpList.innerHTML = `<div class="detail-loading"><div class="spinner"></div></div>`;
  try {
    const anime = await fetchAnimeInfo(normalizeId(id));
    currentWatch.data = anime;
    if (anime) renderWatchSidebarAbout(anime);
    let epList = await fetchAnimeEpisodes(normalizeId(id));
    if (!epList || epList.length === 0) {
      let total = anime?.episodes;
      if (!total && anime?.nextAiringEpisode?.episode) total = anime.nextAiringEpisode.episode - 1;
      if (!total) total = FALLBACK_EPISODE_COUNT;
      epList = Array.from({ length: total }, (_, i) => ({
        id: i + 1,
        title: `Episode ${i + 1}`
      }));
    }
    currentWatch.episodes = epList;
    currentWatch.episodeIndex = initialEpisodeIndex;
    renderWatchSidebarEpisodes();
    loadEpisode(initialEpisodeIndex);
    const seasons = await fetchAnimeSeasons(normalizeId(id)) || [];
    let allSeasons = [...seasons];
    const activeIncluded = allSeasons.some(s => s.id == id);
    if (!activeIncluded && anime) allSeasons.push(anime);
    allSeasons = allSeasons.filter(s => s.status !== 'NOT_YET_RELEASED');
    allSeasons.sort((a, b) => {
      const ay = a?.startDate?.year || a?.seasonYear || 9999;
      const by = b?.startDate?.year || b?.seasonYear || 9999;
      if (ay !== by) return ay - by;
      const am = a?.startDate?.month || 0;
      const bm = b?.startDate?.month || 0;
      if (am !== bm) return am - bm;
      const ad = a?.startDate?.day || 0;
      const bd = b?.startDate?.day || 0;
      if (ad !== bd) return ad - bd;
      return (a.id || 0) - (b.id || 0);
    });
    if (watchSeasonsBlock && watchSeasonsGrid && allSeasons.length > 0) {
      watchSeasonsBlock.style.display = 'block';
      watchSeasonsGrid.innerHTML = allSeasons.map((s, idx) => {
        const seasonNum = idx + 1;
        const sTitle = s?.title?.english || s?.title?.romaji || `S${seasonNum}`;
        const img = safeUrl(s?.coverImage?.large, getImageUrl(s));
        const isActive = (s.id == id);
        const releaseYear = s?.startDate?.year || s?.seasonYear || '';
        return `
          <div class="season-card ${isActive ? 'active' : ''}" style="background-image: url('${escapeForInlineJS(img || '')}')" onclick="closeWatchPlayer(); openAnimeDetail(event, '${normalizeId(s.id)}')">
            <div class="season-gradient"></div>
            <div class="season-info">
              <h4>${escapeHTML(sTitle)}</h4>
              <div class="season-ep-row">
                <span class="season-ep-badge ${isActive ? 'active' : ''}">${escapeHTML(releaseYear)}</span>
                ${isActive ? '<span class="season-now-playing">&#9654; Playing</span>' : ''}
              </div>
            </div>
          </div>`;
      }).join('');
    } else if (watchSeasonsBlock) {
      watchSeasonsBlock.style.display = 'none';
    }
  } catch (err) {
    console.error('Watch load error:', err);
    if (watchEpList) watchEpList.innerHTML = `<div class="detail-loading"><p>Streaming unavailable.</p></div>`;
  }
}
function renderWatchSidebarAbout(anime) {
  const watchSidebarPanel = document.getElementById('ws-panel-about');
  if (!watchSidebarPanel) return;
  const title = anime?.title?.english || anime?.title?.romaji || 'Unknown';
  const synopsis = stripTags(anime?.description) || 'No synopsis available.';
  const type = getTypeLabel(anime);
  const status = anime.status || '—';
  const genresHTML = (anime.genres || []).map(g => `<span class="meta-badge">${escapeHTML(g)}</span>`).join('');
  const duration = anime.duration ? anime.duration + 'm' : '—';
  const season = anime.seasonYear || '—';
  const jpTitle = anime?.title?.native || anime?.title?.romaji || '—';
  const score = anime.meanScore || anime.averageScore || 'N/A';
  const episodes = anime.episodes || '—';
  const img = getImageUrl(anime);

  watchSidebarPanel.innerHTML = `
    <div class="watch-about-container">
      <div class="watch-about-poster">
        <img src="${escapeAttr(img)}" alt="${escapeHTML(title)}" loading="lazy">
      </div>
      <div class="watch-about-titles">
        <h3 class="watch-about-title">${escapeHTML(title)}</h3>
        ${jpTitle !== '—' ? `<h4 class="watch-about-subtitle">${escapeHTML(jpTitle)}</h4>` : ''}
      </div>
      <div class="watch-about-meta">
        <span class="meta-badge">${escapeHTML(type)}</span>
        <span class="meta-dot">&middot;</span>
        <span class="meta-score">&#11088; ${score}</span>
        <span class="meta-dot">&middot;</span>
        <span class="meta-badge">${escapeHTML(episodes)} eps</span>
      </div>
      <div class="watch-about-genres">
        ${genresHTML}
      </div>
      <p class="watch-about-description" onclick="this.classList.toggle('expanded')">
        ${escapeHTML(synopsis)}
      </p>
      <div class="watch-about-grid">
        <div class="grid-item">
          <span class="grid-label">Status</span>
          <span class="grid-value">${escapeHTML(status)}</span>
        </div>
        <div class="grid-item">
          <span class="grid-label">Duration</span>
          <span class="grid-value">${escapeHTML(duration)}</span>
        </div>
        <div class="grid-item">
          <span class="grid-label">Season</span>
          <span class="grid-value">${escapeHTML(season)}</span>
        </div>
        <div class="grid-item">
          <span class="grid-label">Type</span>
          <span class="grid-value">${escapeHTML(type)}</span>
        </div>
      </div>
      <div class="watch-about-actions">
        <button class="about-btn-play" onclick="loadEpisode(0)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Watch Now
        </button>
        <button class="about-btn-bookmark" onclick="toggleBookmark('${anime.id}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
    </div>`;
}
function renderWatchSidebarRangeDropdown(totalFiltered) {
  const rangeEl = document.getElementById('ws-ep-range');
  if (!rangeEl) return;
  if (totalFiltered <= currentWatch.epPageSize) {
    rangeEl.style.display = 'none';
    return;
  }
  rangeEl.style.display = '';
  const totalPages = Math.ceil(totalFiltered / currentWatch.epPageSize);
  let startStr = (currentWatch.epCurrentPage * currentWatch.epPageSize) + 1;
  let endStr = Math.min((currentWatch.epCurrentPage + 1) * currentWatch.epPageSize, totalFiltered);
  const span = rangeEl.querySelector('span');
  if (span) span.textContent = `${String(startStr).padStart(3, '0')}-${String(endStr).padStart(3, '0')}`;
  let listEl = document.getElementById('ws-ep-range-list');
  if (!listEl) {
    listEl = document.createElement('div');
    listEl.id = 'ws-ep-range-list';
    listEl.className = 'ws-ep-range-list';
    Object.assign(listEl.style, {
      display: 'none', position: 'absolute', top: '100%', right: '0',
      background: 'var(--bg-card, #1e1e1e)', border: '1px solid var(--border-color, #333)',
      borderRadius: '6px', zIndex: '10', maxHeight: '250px',
      overflowY: 'auto', minWidth: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      marginTop: '5px'
    });
    rangeEl.style.position = 'relative';
    rangeEl.style.cursor = 'pointer';
    rangeEl.appendChild(listEl);
    rangeEl.addEventListener('click', (e) => {
      if (e.target.closest('#ws-ep-range-list')) return;
      listEl.style.display = listEl.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (!rangeEl.contains(e.target)) listEl.style.display = 'none';
    });
  }
  listEl.style.display = 'none';
  let listHTML = '';
  for (let i = 0; i < totalPages; i++) {
    let s = (i * currentWatch.epPageSize) + 1;
    let e = Math.min((i + 1) * currentWatch.epPageSize, totalFiltered);
    const isActive = i === currentWatch.epCurrentPage;
    listHTML += `<div class="ws-ep-range-item" data-page="${i}" style="padding:8px 12px; cursor:pointer; color:${isActive ? 'var(--primary)' : 'inherit'}; border-bottom:1px solid var(--border-color, #333); transition:background 0.2s;" onmouseover="this.style.background='var(--hover-bg, #333)'" onmouseout="this.style.background='transparent'">${String(s).padStart(3, '0')}-${String(e).padStart(3, '0')}</div>`;
  }
  listEl.innerHTML = listHTML;
  listEl.querySelectorAll('.ws-ep-range-item').forEach(item => {
    item.addEventListener('click', (e) => {
      currentWatch.epCurrentPage = parseInt(e.currentTarget.dataset.page);
      listEl.style.display = 'none';
      renderWatchSidebarEpisodes();
    });
  });
}
function renderWatchSidebarEpisodes() {
  const watchEpList = document.getElementById('ws-ep-list');
  if (!watchEpList) return;
  let episodes = currentWatch.episodes;
  if (currentWatch.searchQuery) {
    const q = currentWatch.searchQuery.toLowerCase();
    episodes = episodes.filter(ep => {
      const epNum = String(ep.id);
      const epTitle = (ep.title || '').toLowerCase();
      return epNum.includes(q) || epTitle.includes(q);
    });
  }
  const totalEps = episodes.length;
  let startIdx = currentWatch.epCurrentPage * currentWatch.epPageSize;
  let endIdx = startIdx + currentWatch.epPageSize;
  if (startIdx >= totalEps) {
    currentWatch.epCurrentPage = 0;
    startIdx = 0;
    endIdx = currentWatch.epPageSize;
  }
  const pageEpisodes = episodes.slice(startIdx, endIdx);
  watchEpList.innerHTML = pageEpisodes.length > 0 ? pageEpisodes.map((ep) => {
    const originalIndex = currentWatch.episodes.indexOf(ep);
    const isActive = originalIndex === currentWatch.episodeIndex ? 'active' : '';
    const epNum = ep.id;
    const epTitle = ep.title || `Episode ${epNum}`;
    return `
      <div class="ws-ep-item ${isActive}" data-ep="${epNum}" onclick="loadEpisode(${originalIndex})">
        <span class="ws-ep-num">${String(epNum).padStart(2, '0')}</span>
        <div class="ws-ep-info">
          <span class="ws-ep-title">${escapeHTML(epTitle)}</span>
        </div>
      </div>`;
  }).join('') : '<div style="padding:20px; text-align:center; color:#aaa; font-size:14px;">No episodes found.</div>';
  renderWatchSidebarRangeDropdown(totalEps);
}
async function loadEpisode(index) {
  currentWatch.episodeIndex = index;
  const ep = currentWatch.episodes[index];
  if (!ep) return;
  const epNum = ep.id || (index + 1);
  const epFullTitle = ep.title || `Episode ${epNum}`;
  
  const watchEpLabel = document.getElementById('watch-ep-label');
  if (watchEpLabel) watchEpLabel.textContent = epFullTitle;
  
  const currentEpAlert = document.getElementById('watch-current-ep-alert');
  if (currentEpAlert) currentEpAlert.textContent = `You are watching ${epFullTitle}`;
  document.querySelectorAll('.ws-ep-item').forEach((item, i) => item.classList.toggle('active', i === index));
  // Clean up any existing iframe
  const oldIframe = document.getElementById('player-iframe');
  if (oldIframe) { oldIframe.src = ''; oldIframe.remove(); }
  const playerRoot = document.getElementById('artplayer');
  if (!playerRoot) return;
  playerRoot.innerHTML = `<div class="detail-loading"><div class="spinner"></div></div>`;

  try {
    // MegaPlay supports MAL IDs directly: /stream/mal/{mal-id}/{ep-num}/{language}
    const malId = currentWatch.id;
    const lang = currentWatch.language || 'sub';
    const params = new URLSearchParams();
    if (playerControls.autoPlay) params.set('autoPlay', '1');
    if (playerControls.autoSkip) params.set('autoSkip', '1');
    const qs = params.toString();
    const embedUrl = `${STREAM_BASE_URL}/stream/mal/${malId}/${epNum}/${lang}${qs ? '?' + qs : ''}`;

    playerRoot.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.id = 'player-iframe';
    iframe.src = embedUrl;
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');
    iframe.allowFullscreen = true;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-presentation allow-fullscreen';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    playerRoot.appendChild(iframe);
  } catch (err) {
    console.error('Playback error:', err);
    if (playerRoot) playerRoot.innerHTML = `<div class="detail-loading"><p>Failed to load stream. Please try again.</p></div>`;
  }
}
let playerControls = {
  autoNext: true,
  autoPlay: false,
  autoSkip: false
};
window.addEventListener('message', e => {
  try {
    // MegaPlay sends either an object or a JSON string
    let data = e.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (typeof data !== 'object' || !data) return;

    // Progress tracking (watching-log event)
    if (data.type === 'watching-log') {
      const { currentTime, duration } = data;
      if (currentTime && duration && currentWatch.data) {
        HistoryManager.save(currentWatch.data, currentWatch.episodeIndex, currentTime, duration);
      }
    }

    // Progress tracking (time event from megacloud channel)
    if (data.channel === 'megacloud' && data.event === 'time') {
      const { time, duration } = data;
      if (time && duration && currentWatch.data) {
        HistoryManager.save(currentWatch.data, currentWatch.episodeIndex, time, duration);
      }
    }

    // Episode complete — auto-next
    if (data.event === 'complete' || (data.channel === 'megacloud' && data.event === 'complete')) {
      if (playerControls.autoNext && currentWatch.episodes.length) {
        const nextIndex = currentWatch.episodeIndex + 1;
        if (nextIndex < currentWatch.episodes.length) loadEpisode(nextIndex);
      }
    }
  } catch (err) {
    console.warn('postMessage parse error:', err);
  }
});
document.addEventListener('wheel', (e) => {
  const horizontalSelectors = ['.player-controls-bar', '.watch-seasons-grid', '.relations-grid', '.ws-tabs'];
  const targetElement = e.target.closest(horizontalSelectors.join(', '));
  if (targetElement && e.deltaY !== 0) {
    const atLeftEdge = targetElement.scrollLeft <= 0 && e.deltaY < 0;
    const atRightEdge = targetElement.scrollLeft + targetElement.clientWidth >= targetElement.scrollWidth - 1 && e.deltaY > 0;
    if (!atLeftEdge && !atRightEdge) {
      e.preventDefault();
      targetElement.scrollBy({
        left: e.deltaY < 0 ? -120 : 120,
        behavior: 'smooth'
      });
    }
  }
}, { passive: false });
const langSub = document.getElementById('lang-sub');
const langDub = document.getElementById('lang-dub');
if (langSub) {
  langSub.addEventListener('click', () => {
    langSub.classList.add('active');
    if (langDub) langDub.classList.remove('active');
    currentWatch.language = 'sub';
    loadEpisode(currentWatch.episodeIndex);
  });
}
if (langDub) {
  langDub.addEventListener('click', () => {
    langDub.classList.add('active');
    if (langSub) langSub.classList.remove('active');
    currentWatch.language = 'dub';
    loadEpisode(currentWatch.episodeIndex);
  });
}
const ctrlFocus = document.getElementById('ctrl-focus');
const ctrlAutoNext = document.getElementById('ctrl-autonext');
const ctrlAutoPlay = document.getElementById('ctrl-autoplay');
const ctrlAutoSkip = document.getElementById('ctrl-autoskip');
const ctrlSkipTime = document.getElementById('ctrl-skiptime');
const ctrlPrev = document.getElementById('ctrl-prev');
const ctrlNext = document.getElementById('ctrl-next');
const ctrlBookmark = document.getElementById('ctrl-bookmark');
if (ctrlFocus) {
  ctrlFocus.addEventListener('click', () => {
    document.body.classList.toggle('focus-mode');
    ctrlFocus.classList.toggle('active');
  });
}
function toggleControl(el, key) {
  if (!el) return;
  playerControls[key] = !playerControls[key];
  el.classList.toggle('active', playerControls[key]);
  if (key === 'autoPlay' || key === 'autoSkip') {
    loadEpisode(currentWatch.episodeIndex);
  }
}
if (ctrlAutoNext) {
  ctrlAutoNext.classList.toggle('active', playerControls.autoNext);
  ctrlAutoNext.addEventListener('click', () => toggleControl(ctrlAutoNext, 'autoNext'));
}
if (ctrlAutoPlay) ctrlAutoPlay.addEventListener('click', () => toggleControl(ctrlAutoPlay, 'autoPlay'));
if (ctrlAutoSkip) ctrlAutoSkip.addEventListener('click', () => toggleControl(ctrlAutoSkip, 'autoSkip'));
if (ctrlSkipTime) {
  ctrlSkipTime.addEventListener('click', () => {
    showModalAlert("Skiptime editor is not supported for embedded videos.");
  });
}
if (ctrlPrev) {
  ctrlPrev.addEventListener('click', () => {
    if (currentWatch.episodeIndex > 0) loadEpisode(currentWatch.episodeIndex - 1);
  });
}
if (ctrlNext) {
  ctrlNext.addEventListener('click', () => {
    if (currentWatch.episodeIndex < currentWatch.episodes.length - 1) loadEpisode(currentWatch.episodeIndex + 1);
  });
}
let bookmarks = JSON.parse(localStorage.getItem('animetm_bookmarks') || '[]');
if (ctrlBookmark) {
  ctrlBookmark.addEventListener('click', () => {
    const isBookmarked = bookmarks.includes(currentWatch.id);
    if (isBookmarked) {
      bookmarks = bookmarks.filter(id => id !== currentWatch.id);
      ctrlBookmark.classList.remove('active');
    } else {
      bookmarks.push(currentWatch.id);
      ctrlBookmark.classList.add('active');
    }
    localStorage.setItem('animetm_bookmarks', JSON.stringify(bookmarks));
  });
}
function closeWatchPlayer() {
  const playerIframe = document.getElementById('player-iframe');
  if (playerIframe) { playerIframe.src = ''; playerIframe.remove(); }
  const watchModal = document.getElementById('watch-modal');
  if (watchModal) watchModal.classList.remove('active');
  if (window.location.hash.startsWith('#watch/')) {
    history.pushState(null, '', window.location.pathname);
  }
  document.body.style.overflow = '';
  document.body.classList.remove('focus-mode');
  const artplayer = document.getElementById('artplayer');
  if (artplayer) artplayer.innerHTML = '';
  if (typeof closeSearch === 'function') closeSearch();
  if (typeof closeDetailModal === 'function') closeDetailModal();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const watchCloseBtn = document.getElementById('watch-close');
if (watchCloseBtn) {
  watchCloseBtn.addEventListener('click', closeWatchPlayer);
}
const searchOverlay = document.getElementById('search-overlay');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchBtn = document.getElementById('search-btn');
const searchCloseBtn = document.getElementById('search-close');
function openSearch() {
  searchOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(() => searchInput.focus(), 300);
}
function closeSearch() {
  searchOverlay.classList.remove('active');
  document.body.style.overflow = '';
}
if (searchBtn) searchBtn.addEventListener('click', openSearch);
if (searchCloseBtn) searchCloseBtn.addEventListener('click', closeSearch);
let searchTimeout = null;
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      searchResults.innerHTML = '<p class="search-hint">Start typing</p>';
      return;
    }
    searchResults.innerHTML = `<div class="search-loading"><div class="spinner"></div></div>`;
    searchTimeout = setTimeout(async () => {
      try {
        const results = await searchAnime(query, 1);
        if (results.length === 0) {
          searchResults.innerHTML = '<p class="search-hint">No results</p>';
          return;
        }
        searchResults.innerHTML = results.map(item => {
          const id = normalizeId(item.id);
          const title = item?.title?.english || item?.title?.romaji || 'Unknown';
          const score = item?.averageScore ? (item.averageScore / 10).toFixed(1) : 'N/A';
          const year = item.seasonYear || '';
          return `
          <div class="search-result-item" onclick="closeSearch(); openAnimeDetail(event, '${id}')">
            <div class="search-result-poster"><img src="${escapeAttr(getImageUrl(item))}" alt="${escapeHTML(title)}" loading="lazy"></div>
            <div class="search-result-info">
              <div class="search-result-title">${escapeHTML(title)}</div>
              <div class="search-result-meta">
                <span>${escapeHTML(year)}</span>
                <span class="ms-auto" style="font-size:10px; color:var(--primary)">⭐ ${score}</span>
              </div>
            </div>
          </div>`;
        }).join('');
      } catch (err) { searchResults.innerHTML = '<p class="search-hint">Error</p>'; }
    }, 500);
  });
}
function handleRouting() {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('anime/')) {
    const id = hash.split('/')[1];
    if (id && !isNaN(id)) {
      openAnimeDetail(null, id);
      return;
    }
  } else if (hash.startsWith('watch/')) {
    const parts = hash.split('/');
    const id = parts[1];
    if (id && !isNaN(id)) {
      openWatchPlayer(null, id, '');
      return;
    }
  } else if (hash === 'watchlist') {
    showBrowse('watchlist');
    return;
  } else if (CATEGORY_META[hash]) {
    showBrowse(hash);
    return;
  }
  closeDetailModal();
  closeWatchPlayer();
  closeSearch();
  showHome();
}
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
function updateRoute(path, title = '') {
  const slug = slugify(title);
  const fullPath = slug ? `${path}/${slug}` : path;
  history.pushState(null, '', `#${fullPath}`);
}
window.addEventListener('hashchange', handleRouting);
window.addEventListener('popstate', handleRouting);
document.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  handleRouting();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSearch();
    closeDetailModal();
    closeWatchPlayer();
  }
});
const HOME_SECTIONS = ['hero', 'continue-section', 'top10-section', 'trending-section', 'latest-section'];
const BROWSE_SECTION = document.getElementById('browse-section');
const BROWSE_GRID = document.getElementById('browse-grid');
const BROWSE_TITLE = document.getElementById('browse-title');
const BROWSE_LOADER = document.getElementById('browse-loader');
const BROWSE_SENTINEL = document.getElementById('browse-sentinel');
const CATEGORY_META = {
  movie: { label: 'Movies', sub: 'Top anime movies ranked by popularity on AniList' },
  tv: { label: 'TV Series', sub: 'Top TV anime ranked by popularity on AniList' },
  airing: { label: 'Top Airing', sub: 'Currently airing anime sorted by score' },
  bypopularity: { label: 'Most Popular', sub: 'All-time most popular anime on AniList' },
};
let browseState = {
  active: false,
  category: '',
  page: 1,
  loading: false,
  hasNextPage: true,
};
let browseObserver = null;
function renderBrowseCard(item, rank) {
  const id = normalizeId(item.id);
  const img = getImageUrl(item);
  const title = item?.title?.english || item?.title?.romaji || 'Unknown';
  const type = getTypeLabel(item);
  const score = item?.averageScore ? `⭐ ${(item.averageScore / 10).toFixed(1)}` : '';
  return `
    <div class="browse-card" onclick="openAnimeDetail(event, '${id}')">
      <div class="browse-card-poster">
        <img src="${escapeAttr(img)}" alt="${escapeHTML(title)}" loading="lazy">
        <div class="browse-card-overlay">${playSVG}</div>
        <div class="browse-card-badge">${escapeHTML(type)}</div>
        ${score ? `<div class="browse-card-score-badge">${escapeHTML(score)}</div>` : ''}
      </div>
      <div class="browse-card-info">
        <div class="browse-card-title" title="${escapeAttr(title)}">${escapeHTML(title)}</div>
        <div class="browse-card-meta">
          ${escapeHTML(getEpisodeCount(item))}
        </div>
      </div>
    </div>`;
}
async function loadBrowsePage() {
  if (browseState.loading || !browseState.hasNextPage) return;
  browseState.loading = true;
  const grid = document.getElementById('browse-grid');
  const loader = document.getElementById('browse-loader');
  if (loader) loader.style.display = 'flex';
  try {
    const { results, hasNextPage } = await fetchBrowse(browseState.category, browseState.page);
    browseState.hasNextPage = hasNextPage;
    if (results.length > 0 && grid) {
      const offset = (browseState.page - 1) * 24;
      grid.insertAdjacentHTML('beforeend', results.map((item, i) => renderBrowseCard(item, offset + i + 1)).join(''));
      browseState.page++;
    }
  } catch (e) {
    console.error('Browse load error:', e);
  }
  if (loader) loader.style.display = browseState.hasNextPage ? 'flex' : 'none';
  browseState.loading = false;
}

async function loadWatchlist() {
  if (browseState.loading) return;
  browseState.loading = true;
  const grid = document.getElementById('browse-grid');
  const loader = document.getElementById('browse-loader');
  if (loader) loader.style.display = 'flex';
  try {
    const watchlistIds = JSON.parse(localStorage.getItem('animetm_bookmarks') || '[]');
    if (watchlistIds.length === 0) {
      if (grid) grid.innerHTML = `
        <div class="watchlist-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          <p>Your watchlist is empty. Go bookmark some anime!</p>
          <a href="#" class="btn-home" onclick="showHome(); return false;">Browse Home</a>
        </div>`;
      browseState.hasNextPage = false;
    } else {
      const results = await fetchMultipleAnime(watchlistIds);
      if (grid) {
        grid.innerHTML = results.map((item, i) => renderBrowseCard(item, i + 1)).join('');
      }
      browseState.hasNextPage = false;
    }
  } catch (e) {
    console.error('Watchlist load error:', e);
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; padding: 100px 20px; text-align: center; color: #aaa; font-size: 16px;">Error loading watchlist.</div>';
  }
  if (loader) loader.style.display = 'none';
  browseState.loading = false;
}

function showBrowse(category) {
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.category === category);
  });
  HOME_SECTIONS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (BROWSE_SECTION) BROWSE_SECTION.style.display = 'block';
  if (BROWSE_GRID) BROWSE_GRID.innerHTML = '';

  if (category === 'watchlist') {
    if (BROWSE_SECTION) {
      BROWSE_SECTION.innerHTML = `
        <div class="browse-page-hero">
          <div class="homewrapper">
            <h1>My Watchlist</h1>
            <p>Your bookmarked anime series and movies</p>
          </div>
        </div>
        <div class="homewrapper">
          <div class="browse-grid" id="browse-grid"></div>
          <div class="browse-loader" id="browse-loader" style="display:flex;">
            <div class="spinner"></div><p>Loading...</p>
          </div>
          <div id="browse-sentinel" style="height:1px;"></div>
        </div>`;
    }
    browseState = { active: true, category, page: 1, loading: false, hasNextPage: false };
    if (browseObserver) browseObserver.disconnect();
    loadWatchlist();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const meta = CATEGORY_META[category] || { label: category, sub: '' };
  if (BROWSE_SECTION) {
    BROWSE_SECTION.innerHTML = `
      <div class="browse-page-hero">
        <div class="homewrapper">
          <h1>${escapeHTML(meta.label)}</h1>
          <p>${escapeHTML(meta.sub)}</p>
        </div>
      </div>
      <div class="homewrapper">
        <div class="browse-grid" id="browse-grid"></div>
        <div class="browse-loader" id="browse-loader" style="display:flex;">
          <div class="spinner"></div><p>Loading...</p>
        </div>
        <div id="browse-sentinel" style="height:1px;"></div>
      </div>`;
  }
  browseState = { active: true, category, page: 1, loading: false, hasNextPage: true };
  if (browseObserver) browseObserver.disconnect();
  browseObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadBrowsePage();
  }, { rootMargin: '200px' });
  const sentinel = document.getElementById('browse-sentinel');
  if (sentinel) browseObserver.observe(sentinel);
  loadBrowsePage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showHome() {
  HOME_SECTIONS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
  });
  const browseSection = document.getElementById('browse-section');
  if (browseSection) browseSection.style.display = 'none';
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.category === 'home');
  });
  renderContinueWatching();
  if (browseObserver) { browseObserver.disconnect(); browseObserver = null; }
  browseState.active = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const cat = link.dataset.category;
    if (cat === 'home') {
      history.pushState(null, '', window.location.pathname);
      showHome();
    } else {
      updateRoute(cat);
      showBrowse(cat);
    }
  });
});
const logoEl = document.getElementById('logo');
if (logoEl) logoEl.addEventListener('click', e => { e.preventDefault(); showHome(); });

// Mobile Navigation Toggle
const menuBtn = document.getElementById('menu-btn');
const mobileNavMenu = document.getElementById('mobile-nav-menu');

if (menuBtn && mobileNavMenu) {
  menuBtn.addEventListener('click', () => {
    mobileNavMenu.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!menuBtn.contains(e.target) && !mobileNavMenu.contains(e.target)) {
      mobileNavMenu.classList.remove('active');
    }
  });

  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileNavMenu.classList.remove('active');
    });
  });
}

// View All Buttons Routing
const viewAllTrending = document.getElementById('view-all-trending');
const viewAllLatest = document.getElementById('view-all-latest');

if (viewAllTrending) {
  viewAllTrending.addEventListener('click', (e) => {
    e.preventDefault();
    updateRoute('bypopularity');
    showBrowse('bypopularity');
  });
}

if (viewAllLatest) {
  viewAllLatest.addEventListener('click', (e) => {
    e.preventDefault();
    updateRoute('airing');
    showBrowse('airing');
  });
}

function showModalAlert(message) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const modal = document.createElement('div');
  modal.style.backgroundColor = '#1a1a1a';
  modal.style.padding = '24px 32px';
  modal.style.borderRadius = '12px';
  modal.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
  modal.style.color = '#fff';
  modal.style.maxWidth = '400px';
  modal.style.textAlign = 'center';

  const text = document.createElement('p');
  text.textContent = message;
  text.style.marginBottom = '20px';
  text.style.fontSize = '16px';
  modal.appendChild(text);

  const btn = document.createElement('button');
  btn.textContent = 'OK';
  btn.style.backgroundColor = 'var(--primary)';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.padding = '8px 24px';
  btn.style.borderRadius = '6px';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = 'bold';
  btn.onclick = () => overlay.remove();
  modal.appendChild(btn);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

const clearHistoryBtn = document.getElementById('clear-history');
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Are you sure you want to clear your watching history?')) {
      HistoryManager.clear();
    }
  });
}

