// ============================================================
//  AnimeTM — Main Application Entry Point (ES Module)
// ============================================================

import {
    HERO_ROTATION_MS, slugify, showModalAlert,
    normalizeId, escapeHTML, escapeAttr, getImageUrl, getTitleSafe, getTitle,
    lockBodyScroll, unlockBodyScroll
} from './utils.js';
import { HistoryManager } from './history.js';
import {
    fetchSpotlight, fetchTrendingAnime, fetchRecentEpisodes,
    searchAnime, fetchBrowse, fetchAnimeInfo, fetchAnimeRelated, fetchMultipleAnime
} from '../mal-api.js';
import {
    createSkeletonSlides, renderTop10Card, renderAnimeCard,
    renderHero, renderContinueWatching, renderDetailModal, renderRelatedSeries,
    renderBrowseCard, reinitSwiper, renderHeroDots, baseSwiperConfig
} from './ui.js';
import {
    currentWatch, playerControls,
    loadEpisode, openWatchPlayer, closeWatchPlayer,
    openWatchFromHistory, toggleBookmark, isBookmarked,
    renderWatchSidebarEpisodes
} from './player.js';
import { INFO_PAGE_META } from './info-pages.js';

// ─── Expose globals for inline onclick handlers ──────────────
window.openAnimeDetail = openAnimeDetail;
window.openWatchPlayer = openWatchPlayer;
window.closeWatchPlayer = closeWatchPlayer;
window.loadEpisode = loadEpisode;
window.openWatchFromHistory = openWatchFromHistory;
window.toggleBookmark = toggleBookmark;
window.showModalAlert = showModalAlert;
window.goToHeroSlide = goToHeroSlide;
window.navigateHero = navigateHero;
window.resetHeroTimer = resetHeroTimer;
window.closeDetailModal = closeDetailModal;
window.closeSearch = closeSearch;
window.showHome = showHome;
window.showBrowse = showBrowse;

// ─── Window state bridges ────────────────────────────────────
window.__browseState = { active: false };
window.__renderContinueWatching = renderContinueWatching;

// ─── Swiper Instances ────────────────────────────────────────
let top10Swiper, trendingSwiper, latestSwiper, continueSwiper;

function createSwiperInstance(selector, prevSelector, nextSelector) {
    return new Swiper(selector, {
        ...baseSwiperConfig,
        navigation: { nextEl: nextSelector, prevEl: prevSelector }
    });
}

function initSwipers() {
    top10Swiper = createSwiperInstance('#top10-swiper', '#top10-prev', '#top10-next');
    trendingSwiper = createSwiperInstance('#trending-swiper', '#trending-prev', '#trending-next');
    latestSwiper = createSwiperInstance('#latest-swiper', '#latest-prev', '#latest-next');
    continueSwiper = createSwiperInstance('#continue-swiper', '#continue-prev', '#continue-next');
}

window.__reinitContinueSwiper = () => {
    continueSwiper = reinitSwiper(continueSwiper, '#continue-swiper', '#continue-prev', '#continue-next');
};

// ─── Hero Rotation ───────────────────────────────────────────
let heroRotationTimer = null;
let heroCurrentIndex = 0;
let heroItems = [];

function goToHeroSlide(index) {
    if (!heroItems.length) return;
    heroCurrentIndex = (index + heroItems.length) % heroItems.length;
    const heroContent = document.getElementById('hero-content');
    if (heroContent) heroContent.classList.add('hero-fade-out');
    setTimeout(() => {
        if (heroItems[heroCurrentIndex]) renderHero(heroItems[heroCurrentIndex]);
        if (heroContent) heroContent.classList.remove('hero-fade-out');
        renderHeroDots(heroItems, heroCurrentIndex);
    }, 320);
}

function navigateHero(direction) {
    if (!heroItems.length) return;
    goToHeroSlide(heroCurrentIndex + direction);
    resetHeroTimer();
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

document.getElementById('hero-prev')?.addEventListener('click', () => navigateHero(-1));
document.getElementById('hero-next')?.addEventListener('click', () => navigateHero(1));

// ─── Data Loading ────────────────────────────────────────────
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

// ─── Detail Modal ────────────────────────────────────────────
const detailModal = document.getElementById('detail-modal');
const detailContent = document.getElementById('detail-content');
const detailClose = document.getElementById('detail-close');
let relatedRequestToken = 0;

async function loadRelatedSeries(id) {
    const token = ++relatedRequestToken;
    renderRelatedSeries(null, id, 'loading');
    try {
        const payload = await fetchAnimeRelated(id);
        if (token !== relatedRequestToken) return;
        renderRelatedSeries(payload, id, payload ? 'ready' : 'error');
    } catch (err) {
        if (token !== relatedRequestToken) return;
        renderRelatedSeries(null, id, 'error');
    }
}

async function openAnimeDetail(event, id) {
    if (event) event.preventDefault();
    const numericId = normalizeId(id);
    if (numericId <= 0) {
        console.error('Invalid anime ID:', id);
        return;
    }
    updateRoute(`anime/${numericId}`);
    const wasOpen = Boolean(detailModal?.classList.contains('active'));
    const activeTab = wasOpen
        ? (detailContent?.querySelector('.detail-tab.active')?.dataset.detailTab || 'overview')
        : 'overview';
    if (detailModal) {
        detailModal.classList.add('active');
        detailModal.scrollTop = 0;
    }
    lockBodyScroll('detail');
    if (detailContent) detailContent.innerHTML = `<div class="detail-loading"><div class="spinner"></div><p>Loading...</p></div>`;
    try {
        const anime = await fetchAnimeInfo(numericId);
        if (!anime) throw new Error('No data');
        const title = anime?.title?.english || anime?.title?.romaji || '';
        history.replaceState(null, '', `#anime/${numericId}/${slugify(title)}`);
        renderDetailModal(anime, activeTab);
        loadRelatedSeries(numericId);
    } catch (err) {
        if (detailContent) detailContent.innerHTML = `<div class="detail-loading"><p>Failed to load details.</p></div>`;
    }
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
    unlockBodyScroll('detail');
}

if (detailClose) detailClose.addEventListener('click', closeDetailModal);

// ─── Search ──────────────────────────────────────────────────
const searchOverlay = document.getElementById('search-overlay');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchBtn = document.getElementById('search-btn');
const searchCloseBtn = document.getElementById('search-close');

function openSearch() {
    searchOverlay.classList.add('active');
    lockBodyScroll('search');
    setTimeout(() => searchInput.focus(), 300);
}

function closeSearch() {
    searchOverlay.classList.remove('active');
    unlockBodyScroll('search');
}

if (searchBtn) searchBtn.addEventListener('click', openSearch);
if (searchCloseBtn) searchCloseBtn.addEventListener('click', closeSearch);

let searchTimeout = null;
let searchAbortController = null;
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
            if (searchAbortController) searchAbortController.abort();
            searchAbortController = new AbortController();
            const signal = searchAbortController.signal;
            try {
                const results = await searchAnime(query, 1, signal);
                if (results.length === 0) {
                    searchResults.innerHTML = '<p class="search-hint">No results</p>';
                    return;
                }
                searchResults.innerHTML = results.map(item => {
                    const id = normalizeId(item.id);
                    const safeTitle = getTitleSafe(item);
                    const score = item?.averageScore ? (item.averageScore / 10).toFixed(1) : 'N/A';
                    const year = item.seasonYear || '';
                    return `
          <div class="search-result-item" data-action="open-anime" data-id="${id}">
            <div class="search-result-poster"><img src="${escapeAttr(getImageUrl(item))}" alt="${escapeAttr(getTitle(item))}" loading="lazy"></div>
            <div class="search-result-info">
              <div class="search-result-title">${safeTitle}</div>
              <div class="search-result-meta">
                <span>${escapeHTML(year)}</span>
                <span class="ms-auto" style="font-size:10px; color:var(--primary)">&#11088; ${score}</span>
              </div>
            </div>
          </div>`;
                }).join('');
            } catch (err) { 
              if (err.name === "AbortError") return;
              searchResults.innerHTML = "<p class=\"search-hint\">Error</p>"; 
            }
        }, 500);
    });
}

// ─── Routing ─────────────────────────────────────────────────
function handleRouting() {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('anime/')) {
        const parts = hash.split('/');
        const id = parts[1];
        if (id && !isNaN(id)) {
            openAnimeDetail(null, id);
            return;
        }
        // Legacy route without id (e.g. #anime/one-piece) — can't recover, go home.
        if (parts[1]) {
            history.replaceState(null, '', window.location.pathname);
            showHome();
            return;
        }
    } else if (hash.startsWith('watch/')) {
        const parts = hash.split('/');
        const id = parts[1];
        if (id && !isNaN(id)) {
            openWatchPlayer(null, id, '');
            return;
        }
        if (parts[1]) {
            history.replaceState(null, '', window.location.pathname);
            showHome();
            return;
        }
    } else if (hash === 'watchlist') {
        showBrowse('watchlist');
        return;
    } else if (CATEGORY_META[hash]) {
        showBrowse(hash);
        return;
    } else if (INFO_PAGE_META[hash]) {
        showInfoPage(hash);
        return;
    }
    closeDetailModal();
    closeWatchPlayer();
    closeSearch();
    showHome();
}

function updateRoute(path, title = '') {
    const s = slugify(title);
    const fullPath = s ? `${path}/${s}` : path;
    history.pushState(null, '', `#${fullPath}`);
}

window.addEventListener('hashchange', handleRouting);
window.addEventListener('popstate', handleRouting);

// ─── Browse / Watchlist ──────────────────────────────────────
const HOME_SECTIONS = ['hero', 'continue-section', 'top10-section', 'trending-section', 'latest-section'];
const BROWSE_SECTION = document.getElementById('browse-section');
const BROWSE_GRID = document.getElementById('browse-grid');
const BROWSE_TITLE = document.getElementById('browse-title');
const BROWSE_LOADER = document.getElementById('browse-loader');
const BROWSE_SENTINEL = document.getElementById('browse-sentinel');

const CATEGORY_META = {
    movie: { label: 'Movies', sub: 'Top anime movies ranked by popularity on MyAnimeList' },
    tv: { label: 'TV Series', sub: 'Top TV anime ranked by popularity on MyAnimeList' },
    airing: { label: 'Top Airing', sub: 'Currently airing anime sorted by score' },
    bypopularity: { label: 'Most Popular', sub: 'All-time most popular anime on MyAnimeList' },
};

const FOOTER_LINK_ROUTES = {
    explore: { type: 'home' },
    'new-releases': { type: 'browse', value: 'airing' },
    'popular-series': { type: 'browse', value: 'tv' },
    movies: { type: 'browse', value: 'movie' },
    collections: { type: 'browse', value: 'watchlist' },
    support: { type: 'info', value: 'support' },
    faq: { type: 'info', value: 'faq' },
    community: { type: 'info', value: 'community' },
    contact: { type: 'info', value: 'contact' },
    terms: { type: 'info', value: 'terms' },
};

let browseState = {
    active: false,
    category: '',
    page: 1,
    loading: false,
    hasNextPage: true,
};

let browseObserver = null;

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
        if (grid) grid.insertAdjacentHTML('beforeend', '<div style="padding:20px;text-align:center;color:#e74c3c;grid-column: 1/-1;">Failed to load browse results.</div>');
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
        const watchlistIds = HistoryManager.getBookmarks();
        if (watchlistIds.length === 0) {
            if (grid) grid.innerHTML = `
        <div class="watchlist-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          <p>Your watchlist is empty. Go bookmark some anime!</p>
          <a href="#" class="btn-home" data-action="go-home">Browse Home</a>
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
    setActiveNav(category);
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
        window.__browseState = browseState;
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
    window.__browseState = browseState;
    if (browseObserver) browseObserver.disconnect();
    browseObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) loadBrowsePage();
    }, { rootMargin: '200px' });
    const sentinel = document.getElementById('browse-sentinel');
    if (sentinel) browseObserver.observe(sentinel);
    loadBrowsePage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showInfoPage(pageKey) {
    const meta = INFO_PAGE_META[pageKey] || INFO_PAGE_META.support;
    HOME_SECTIONS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    if (BROWSE_SECTION) {
        BROWSE_SECTION.style.display = 'block';
        BROWSE_SECTION.innerHTML = `
      <div class="browse-page-hero">
        <div class="homewrapper">
          <h1>${escapeHTML(meta.label)}</h1>
          <p>${escapeHTML(meta.sub)}</p>
        </div>
      </div>
      <div class="homewrapper">
        <div class="info-page-content">${meta.content}</div>
      </div>`;
    }
    setActiveNav('');
    if (browseObserver) { browseObserver.disconnect(); browseObserver = null; }
    browseState = { active: true, category: `info:${pageKey}`, page: 1, loading: false, hasNextPage: false };
    window.__browseState = browseState;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showHome() {
    HOME_SECTIONS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    });
    const browseSection = document.getElementById('browse-section');
    if (browseSection) browseSection.style.display = 'none';
    setActiveNav('home');
    renderContinueWatching();
    if (browseObserver) { browseObserver.disconnect(); browseObserver = null; }
    browseState.active = false;
    window.__browseState = browseState;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setActiveNav(category) {
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
        link.classList.toggle('active', !!category && link.dataset.category === category);
    });
}

function routeFooterLink(linkKey) {
    const route = FOOTER_LINK_ROUTES[linkKey];
    if (!route) return;
    closeDetailModal();
    closeWatchPlayer();
    closeSearch();
    if (route.type === 'home') {
        history.pushState(null, '', window.location.pathname);
        showHome();
        return;
    }
    if (route.type === 'browse' && route.value) {
        updateRoute(route.value);
        showBrowse(route.value);
        return;
    }
    if (route.type === 'info' && route.value) {
        updateRoute(route.value);
        showInfoPage(route.value);
    }
}

function handleDelegatedActionClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    if (!action) return;

    if (action === 'open-anime') {
        e.preventDefault();
        const id = normalizeId(actionEl.dataset.id);
        if (id > 0) {
            if (searchOverlay?.classList.contains('active')) closeSearch();
            openAnimeDetail(e, id);
        }
        return;
    }

    if (action === 'open-watch-from-history') {
        e.preventDefault();
        const id = normalizeId(actionEl.dataset.id);
        const epIndex = Number.parseInt(actionEl.dataset.epIndex || '0', 10) || 0;
        const time = Number.parseFloat(actionEl.dataset.time || '0') || 0;
        if (id > 0) openWatchFromHistory(id, epIndex, time);
        return;
    }

    if (action === 'watch-now') {
        e.preventDefault();
        const id = normalizeId(actionEl.dataset.id);
        if (id > 0) {
            const title = actionEl.dataset.title || '';
            closeDetailModal();
            openWatchPlayer(null, id, title);
        }
        return;
    }

    if (action === 'go-home') {
        e.preventDefault();
        history.pushState(null, '', window.location.pathname);
        showHome();
    }
}

document.addEventListener('click', handleDelegatedActionClick);

// ─── Navigation ──────────────────────────────────────────────
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

document.querySelectorAll('[data-footer-link]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        routeFooterLink(link.dataset.footerLink);
    });
});

// Mobile Navigation Toggle
const menuBtn = document.getElementById('menu-btn');
const mobileNavMenu = document.getElementById('mobile-nav-menu');

if (menuBtn && mobileNavMenu) {
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileNavMenu.classList.toggle('active');
        // Update aria-expanded for accessibility
        const isOpen = mobileNavMenu.classList.contains('active');
        menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) lockBodyScroll('mobile-nav');
        else unlockBodyScroll('mobile-nav');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (mobileNavMenu.classList.contains('active') &&
            !menuBtn.contains(e.target) && 
            !mobileNavMenu.contains(e.target)) {
            mobileNavMenu.classList.remove('active');
            menuBtn.setAttribute('aria-expanded', 'false');
            unlockBodyScroll('mobile-nav');
        }
    });

    // Close on nav link click
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileNavMenu.classList.remove('active');
            menuBtn.setAttribute('aria-expanded', 'false');
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

// ─── Player Controls ─────────────────────────────────────────
const langSub = document.getElementById('lang-sub');
const langDub = document.getElementById('lang-dub');

if (langSub) {
    langSub.addEventListener('click', () => {
        langSub.classList.add('active');
        if (langDub) langDub.classList.remove('active');
        currentWatch.language = 'sub';
        if (currentWatch.id && currentWatch.episodeIndex !== undefined) {
            loadEpisode(currentWatch.episodeIndex);
        }
    });
}

if (langDub) {
    langDub.addEventListener('click', () => {
        langDub.classList.add('active');
        if (langSub) langSub.classList.remove('active');
        currentWatch.language = 'dub';
        if (currentWatch.id && currentWatch.episodeIndex !== undefined) {
            loadEpisode(currentWatch.episodeIndex);
        }
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

if (ctrlBookmark) {
    ctrlBookmark.addEventListener('click', () => {
        if (!currentWatch.id) return;
        const bookmarked = isBookmarked(currentWatch.id);
        toggleBookmark(currentWatch.id);
        ctrlBookmark.classList.toggle('active', !bookmarked);
    });
}

const watchCloseBtn = document.getElementById('watch-close');
if (watchCloseBtn) {
    watchCloseBtn.addEventListener('click', closeWatchPlayer);
}

// ─── Episode Search ──────────────────────────────────────────
const wsEpSearchInput = document.getElementById('ws-ep-search-input');
if (wsEpSearchInput) {
    wsEpSearchInput.addEventListener('input', () => {
        currentWatch.searchQuery = wsEpSearchInput.value.trim();
        currentWatch.epCurrentPage = 0;
        renderWatchSidebarEpisodes();
    });
}

// ─── Wheel Horizontal Scroll ─────────────────────────────────
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

// ─── Clear History ───────────────────────────────────────────
const clearHistoryBtn = document.getElementById('clear-history');
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to clear your watching history?')) {
            HistoryManager.clear();
        }
    });
}

// ─── Keyboard Shortcuts ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSearch();
        closeDetailModal();
        closeWatchPlayer();
        if (mobileNavMenu && mobileNavMenu.classList.contains('active')) {
            mobileNavMenu.classList.remove('active');
            menuBtn.setAttribute('aria-expanded', 'false');
            unlockBodyScroll('mobile-nav');
        }
    }
});

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadAllData();
    handleRouting();
});

// Focus trap using the shared utility (defined in utils.js)
// The trapFocus utility from ./utils.js is already imported and handles this
