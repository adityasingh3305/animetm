// ============================================================
//  AnimeTM — Player Logic & Watch Sidebar
// ============================================================

import {
    escapeHTML, escapeAttr, escapeForInlineJS,
    normalizeId, safeUrl, getImageUrl,
    getTypeLabel, stripTags, slugify,
    FALLBACK_POSTER, FALLBACK_EPISODE_COUNT,
    STREAM_BASE_URL, showModalAlert,
    lockBodyScroll, unlockBodyScroll
} from './utils.js';

import { HistoryManager } from './history.js';
import { fetchAnimeInfo, fetchAnimeEpisodes, fetchAnimeSeasons } from '../mal-api.js';

// ─── Player State ────────────────────────────────────────────
export const currentWatch = {
    epPageSize: 100,
    language: 'sub',
    episodes: [],
    epCurrentPage: 0,
    episodeIndex: 0,
    id: null,
    title: '',
    searchQuery: '',
    data: null
};

export const playerControls = {
    autoNext: true,
    autoPlay: false,
    autoSkip: false
};

function setWatchSidebarTab(tabName) {
    const nextTab = tabName === 'about' ? 'about' : 'episodes';

    document.querySelectorAll('.ws-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === nextTab);
    });

    document.querySelectorAll('.ws-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `ws-panel-${nextTab}`);
    });
}

document.querySelectorAll('.ws-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        setWatchSidebarTab(tab.dataset.tab);
    });
});

// ─── Watch Sidebar About ─────────────────────────────────────
export function renderWatchSidebarAbout(anime) {
    const watchSidebarPanel = document.getElementById('ws-panel-about');
    if (!watchSidebarPanel) return;
    const title = anime?.title?.english || anime?.title?.romaji || 'Unknown';
    const synopsis = stripTags(anime?.description) || 'No synopsis available.';
    const type = getTypeLabel(anime);
    const status = anime.status || '\u2014';
    const genresHTML = (anime.genres || []).map(g => `<span class="meta-badge">${escapeHTML(g)}</span>`).join('');
    const duration = anime.duration ? anime.duration + 'm' : '\u2014';
    const season = anime.seasonYear || '\u2014';
    const jpTitle = anime?.title?.native || anime?.title?.romaji || '\u2014';
    const score = anime.meanScore || anime.averageScore || 'N/A';
    const episodes = anime.episodes || '\u2014';
    const img = getImageUrl(anime);

    watchSidebarPanel.innerHTML = `
    <div class="watch-about-container">
      <div class="watch-about-poster">
        <img src="${escapeAttr(img)}" alt="${escapeHTML(title)}" loading="lazy">
      </div>
      <div class="watch-about-titles">
        <h3 class="watch-about-title">${escapeHTML(title)}</h3>
        ${jpTitle !== '\u2014' ? `<h4 class="watch-about-subtitle">${escapeHTML(jpTitle)}</h4>` : ''}
      </div>
      <div class="watch-about-meta">
        <span class="meta-badge">${escapeHTML(type)}</span>
        <span class="meta-dot">\u00b7</span>
        <span class="meta-score">&#11088; ${escapeHTML(score)}</span>
        <span class="meta-dot">\u00b7</span>
        <span class="meta-badge">${escapeHTML(episodes)} eps</span>
      </div>
      <div class="watch-about-genres">
        ${genresHTML}
      </div>
      <p class="watch-about-description">
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
        <button class="about-btn-play" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Watch Now
        </button>
        <button class="about-btn-bookmark" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
    </div>`;

    const descEl = watchSidebarPanel.querySelector('.watch-about-description');
    if (descEl) {
        descEl.addEventListener('click', () => {
            descEl.classList.toggle('expanded');
        });
    }

    const aboutPlayBtn = watchSidebarPanel.querySelector('.about-btn-play');
    if (aboutPlayBtn) {
        aboutPlayBtn.addEventListener('click', () => {
            loadEpisode(0);
        });
    }

    const aboutBookmarkBtn = watchSidebarPanel.querySelector('.about-btn-bookmark');
    if (aboutBookmarkBtn) {
        aboutBookmarkBtn.addEventListener('click', () => {
            toggleBookmark(anime.id);
        });
    }
}

// ─── Range Dropdown ──────────────────────────────────────────
let epRangeListInitialized = false;

export function renderWatchSidebarRangeDropdown(totalFiltered) {
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
        listEl.style.cssText = `
            display: none; position: absolute; top: 100%; right: 0;
            background: var(--bg-card, #1e1e1e); border: 1px solid var(--border-color, #333);
            border-radius: 6px; z-index: 10; max-height: 250px;
            overflow-y: auto; min-width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            margin-top: 5px;
        `;
        rangeEl.style.position = 'relative';
        rangeEl.style.cursor = 'pointer';
        rangeEl.appendChild(listEl);

        if (!epRangeListInitialized) {
            rangeEl.addEventListener('click', (e) => {
                if (e.target.closest('#ws-ep-range-list')) return;
                listEl.style.display = listEl.style.display === 'none' ? 'block' : 'none';
            });
            document.addEventListener('click', (e) => {
                if (!rangeEl.contains(e.target)) listEl.style.display = 'none';
            });
            listEl.addEventListener('click', (e) => {
                const item = e.target.closest('.ws-ep-range-item');
                if (item) {
                    currentWatch.epCurrentPage = parseInt(item.dataset.page);
                    listEl.style.display = 'none';
                    renderWatchSidebarEpisodes();
                }
            });
            epRangeListInitialized = true;
        }
    }

    // Generate range items
    listEl.style.display = 'none';
    let listHTML = '';
    for (let i = 0; i < totalPages; i++) {
        let s = (i * currentWatch.epPageSize) + 1;
        let e = Math.min((i + 1) * currentWatch.epPageSize, totalFiltered);
        const isActive = i === currentWatch.epCurrentPage ? 'color: var(--primary)' : '';
        listHTML += `<div class="ws-ep-range-item" data-page="${i}" style="padding:8px 12px; cursor:pointer; ${isActive}; border-bottom:1px solid var(--border-color, #333); transition:background 0.2s;">${String(s).padStart(3, '0')}-${String(e).padStart(3, '0')}</div>`;
    }
    listEl.innerHTML = listHTML;
}

// ─── Episode List ────────────────────────────────────────────
export function renderWatchSidebarEpisodes() {
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
        const episodeImage = safeUrl(ep.image, '');
        return `
      <div class="ws-ep-item ${isActive}" data-ep="${epNum}" data-ep-index="${originalIndex}">
        ${episodeImage
            ? `<img class="ws-ep-thumb" src="${escapeAttr(episodeImage)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
            : '<span class="ws-ep-thumb ws-ep-thumb-empty" aria-hidden="true"></span>'}
        <span class="ws-ep-num">${String(epNum).padStart(2, '0')}</span>
        <div class="ws-ep-info">
          <span class="ws-ep-title">${escapeHTML(epTitle)}</span>
        </div>
      </div>`;
    }).join('') : '<div style="padding:20px; text-align:center; color:#aaa; font-size:14px;">No episodes found.</div>';

    watchEpList.querySelectorAll('.ws-ep-item').forEach((item) => {
        item.addEventListener('click', () => {
            const idx = Number.parseInt(item.dataset.epIndex || '-1', 10);
            if (idx >= 0) loadEpisode(idx);
        });
    });

    renderWatchSidebarRangeDropdown(totalEps);
}

// ─── Load Episode ────────────────────────────────────────────
export function loadEpisode(index, startTime = 0) {
    if (index < 0 || index >= currentWatch.episodes.length) {
        console.error('Invalid episode index:', index);
        return;
    }

    currentWatch.episodeIndex = index;
    const ep = currentWatch.episodes[index];
    if (!ep) return;
    const epNum = ep.id || (index + 1);
    const epFullTitle = ep.title || `Episode ${epNum}`;

    const watchEpLabel = document.getElementById('watch-ep-label');
    if (watchEpLabel) watchEpLabel.textContent = epFullTitle;

    const currentEpAlert = document.getElementById('watch-current-ep-alert');
    if (currentEpAlert) currentEpAlert.textContent = `You are watching ${epFullTitle}`;
    document.querySelectorAll('.ws-ep-item').forEach((item) => {
        const idx = Number.parseInt(item.dataset.epIndex || '-1', 10);
        item.classList.toggle('active', idx === index);
    });

    // Clean up any existing iframe
    const oldIframe = document.getElementById('player-iframe');
    if (oldIframe) { oldIframe.src = ''; oldIframe.remove(); }
    const playerRoot = document.getElementById('artplayer');
    if (!playerRoot) return;
    playerRoot.innerHTML = `<div class="detail-loading"><div class="spinner"></div></div>`;

    try {
        const malId = currentWatch.id;
        const lang = currentWatch.language || 'sub';
        const params = new URLSearchParams();
        if (playerControls.autoPlay) params.set('autoPlay', '1');
        if (playerControls.autoSkip) params.set('autoSkip', '1');
        const qs = params.toString();
        
        if (!Number.isInteger(malId) || malId <= 0) {
            throw new Error('Invalid MAL ID');
        }
        
        let embedUrl = '';
        if (ep.embed_id) {
            embedUrl = `${STREAM_BASE_URL}/stream/s-2/${ep.embed_id}/${lang}${qs ? '?' + qs : ''}`;
        } else {
            embedUrl = `${STREAM_BASE_URL}/stream/mal/${malId}/${epNum}/${lang}${qs ? '?' + qs : ''}`;
        }

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
        iframe.referrerPolicy = 'no-referrer-when-downgrade';
        if (startTime > 0) {
            iframe.addEventListener('load', () => {
                iframe.contentWindow?.postMessage({ event: 'seek', time: startTime }, '*');
            }, { once: true });
        }
        playerRoot.appendChild(iframe);
    } catch (err) {
        console.error('Playback error:', err);
        if (playerRoot) playerRoot.innerHTML = `<div class="detail-loading"><p>Failed to load stream. Please try again.</p></div>`;
    }
}

// ─── Open Watch Player ───────────────────────────────────────
export async function openWatchPlayer(event, id, title, initialEpisodeIndex = 0, startTime = 0) {
    if (event) event.preventDefault();
    const numericId = normalizeId(id);
    if (numericId <= 0) {
        console.error('Invalid anime ID for player:', id);
        return;
    }
    history.replaceState(null, '', `#watch/${numericId}/${slugify(title)}`);
    currentWatch.id = numericId;
    currentWatch.title = stripTags(title) || 'Unknown';
    currentWatch.searchQuery = '';
    currentWatch.epCurrentPage = 0;
    setWatchSidebarTab('episodes');

    const watchEpSearchInput = document.getElementById('ws-ep-search-input');
    if (watchEpSearchInput) watchEpSearchInput.value = '';

    const watchModal = document.getElementById('watch-modal');
    if (watchModal) watchModal.classList.add('active');
    lockBodyScroll('watch');

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
        if (anime) {
            renderWatchSidebarAbout(anime);
            // Hash routes can open the player without a title argument. Use
            // the fetched anime title instead of leaving the header as
            // "Unknown".
            const resolvedTitle = anime?.title?.english || anime?.title?.romaji || '';
            if (!stripTags(title) && resolvedTitle) {
                currentWatch.title = resolvedTitle;
                if (watchTitle) watchTitle.textContent = resolvedTitle;
                history.replaceState(null, '', `#watch/${numericId}/${slugify(resolvedTitle)}`);
            }
        }

        let releasedCount = anime?.episodes || 0;
        if (anime?.nextAiringEpisode?.episode) {
            releasedCount = Math.min(releasedCount, anime.nextAiringEpisode.episode - 1);
        }

        let epList = await fetchAnimeEpisodes(normalizeId(id));
        if (!epList || epList.length === 0) {
            if (!releasedCount && anime?.nextAiringEpisode?.episode) {
                releasedCount = anime.nextAiringEpisode.episode - 1;
            }
            if (!releasedCount) releasedCount = FALLBACK_EPISODE_COUNT;

            const startDateStr = anime?.startDate?.year
                ? `${anime.startDate.year}-${String(anime.startDate.month || 1).padStart(2, '0')}-${String(anime.startDate.day || 1).padStart(2, '0')}`
                : (anime?.seasonYear ? `${anime.seasonYear}-01-01` : null);
            const startDate = startDateStr ? new Date(startDateStr) : null;
            const now = Date.now();

            epList = Array.from({ length: releasedCount }, (_, i) => {
                let airedAt = null;
                if (startDate && !isNaN(startDate.getTime())) {
                    airedAt = new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000).toISOString();
                }
                return {
                    id: i + 1,
                    title: `Episode ${i + 1}`,
                    airedAt,
                };
            }).filter(ep => {
                if (!ep.airedAt) return true;
                return new Date(ep.airedAt).getTime() <= now;
            });
        } else {
            const now = Date.now();
            epList = epList.filter(ep => {
                if (!ep.airedAt) return true;
                return new Date(ep.airedAt).getTime() <= now;
            });
            if (releasedCount > 0) {
                epList = epList.slice(0, releasedCount);
            }
        }

        currentWatch.episodes = epList;
        currentWatch.episodeIndex = Math.min(initialEpisodeIndex, Math.max(0, epList.length - 1));
        renderWatchSidebarEpisodes();
        if (epList.length > 0) {
            loadEpisode(currentWatch.episodeIndex, startTime);
        } else {
            const playerRoot = document.getElementById('artplayer');
            if (playerRoot) playerRoot.innerHTML = `<div class="detail-loading"><p>No episodes released yet.</p></div>`;
        }

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
            // Keep the currently watched entry before same-day related titles,
            // then use MAL id as a deterministic final tie-breaker.
            if (a.id == id && b.id != id) return -1;
            if (b.id == id && a.id != id) return 1;
            return (a.id || 0) - (b.id || 0);
        });
        if (watchSeasonsBlock && watchSeasonsGrid && allSeasons.length > 0) {
            watchSeasonsBlock.style.display = 'block';
            watchSeasonsGrid.innerHTML = allSeasons.map((s, idx) => {
                const seasonNum = idx + 1;
                const sTitle = s?.title?.english || s?.title?.romaji || `S${seasonNum}`;
                // Season cards are landscape-oriented, so use AniZip fanart
                // (exposed as bannerImage) instead of the portrait poster.
                const img = safeUrl(s?.bannerImage, safeUrl(s?.coverImage?.large, getImageUrl(s)));
                const isActive = (s.id == id);
                const releaseYear = s?.startDate?.year || s?.seasonYear || '';
                return `
          <div class="season-card ${isActive ? 'active' : ''}" data-season-id="${normalizeId(s.id)}" style="background-image: url('${escapeForInlineJS(img || '')}')">
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

            watchSeasonsGrid.querySelectorAll('.season-card').forEach((card) => {
                card.addEventListener('click', (event) => {
                    const seasonId = Number.parseInt(card.dataset.seasonId || '0', 10);
                    if (seasonId > 0 && typeof window.openAnimeDetail === 'function') {
                        closeWatchPlayer();
                        window.openAnimeDetail(event, seasonId);
                    }
                });
            });
        } else if (watchSeasonsBlock) {
            watchSeasonsBlock.style.display = 'none';
        }
    } catch (err) {
        console.error('Watch load error:', err);
        if (watchEpList) watchEpList.innerHTML = `<div class="detail-loading"><p>Streaming unavailable.</p></div>`;
    }
}

// ─── Close Watch Player ──────────────────────────────────────
export function closeWatchPlayer() {
    const playerIframe = document.getElementById('player-iframe');
    if (playerIframe) { playerIframe.src = ''; playerIframe.remove(); }
    const watchModal = document.getElementById('watch-modal');
    if (watchModal) watchModal.classList.remove('active');
    if (window.location.hash.startsWith('#watch/')) {
        history.pushState(null, '', window.location.pathname);
    }
    unlockBodyScroll('watch');
    document.body.classList.remove('focus-mode');
    const artplayer = document.getElementById('artplayer');
    if (artplayer) artplayer.innerHTML = '';
    if (typeof window.closeSearch === 'function') window.closeSearch();
    if (typeof window.closeDetailModal === 'function') window.closeDetailModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Open From History ───────────────────────────────────────
export async function openWatchFromHistory(id, epIndex, startTime) {
    if (!Number.isInteger(Number(id)) || id <= 0) {
        console.error('Invalid anime ID from history');
        return;
    }
    try {
        const anime = await fetchAnimeInfo(id);
        if (anime) {
            currentWatch.id = id;
            currentWatch.data = anime;
            openWatchPlayer(null, id, anime.title?.english || anime.title?.romaji, epIndex, startTime);
        }
    } catch (err) {
        console.error('Error opening from history:', err);
    }
}

export function toggleBookmark(id) {
    const wasBookmarked = HistoryManager.isBookmarked(id);
    HistoryManager.toggleBookmark(id);
    // Update UI if bookmark button exists
    const ctrlBookmark = document.getElementById('ctrl-bookmark');
    if (ctrlBookmark) {
        ctrlBookmark.classList.toggle('active', !wasBookmarked);
    }
}

export function isBookmarked(id) {
    return HistoryManager.isBookmarked(id);
}

// ─── PostMessage Handler ─────────────────────────────────────
window.addEventListener('message', e => {
    const trustedOrigins = ['https://megaplay.buzz'];
    if (!trustedOrigins.includes(e.origin)) return;
    try {
        let data = e.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { return; }
        }
        if (typeof data !== 'object' || data === null) return;

        if (data.type === 'watching-log') {
            const { currentTime, duration } = data;
            if (typeof currentTime === 'number' && typeof duration === 'number' && currentWatch.data && duration > 0) {
                HistoryManager.save(currentWatch.data, currentWatch.episodeIndex, currentTime, duration);
            }
        }

        if (data.channel === 'megacloud' && data.event === 'time') {
            const { time, duration } = data;
            if (typeof time === 'number' && typeof duration === 'number' && currentWatch.data && duration > 0) {
                HistoryManager.save(currentWatch.data, currentWatch.episodeIndex, time, duration);
            }
        }

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
