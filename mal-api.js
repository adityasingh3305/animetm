// ============================================================
//  AnimeTM — Frontend API Client (ES Module)
//  Talks to local proxy server (server.js) on port 3001
// ============================================================

const PROXY_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : '/api';

// ─── Generic fetch with error handling & AbortController support ──
async function apiFetch(path, signal) {
  try {
    const res = await fetch(`${PROXY_BASE}${path}`, { signal });
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[API] Request aborted:', path);
      return null;
    }
    console.error('[API]', path, err.message);
    throw err; // Propagate for error handling in callers
  }
}

// ─── Helper to handle fetch results with fallback ─────────────
async function fetchList(path, fallback = [], signal) {
  try {
    return (await apiFetch(path, signal)) || fallback;
  } catch {
    return fallback;
  }
}

// The recent-anime provider still returns its legacy, flat item shape while
// the rest of the UI consumes the normalized MAL shape. Keep that provider
// detail at the API boundary so cards can use the same title/image/score
// helpers as every other section.
function normalizeRecentItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.title && typeof item.title === 'object') return item;

  const title = String(item.title || item.native || '').trim() || 'Unknown';
  const image = item.image || item.poster || '';
  const rawScore = Number(item.score);
  const episodes = Number(item.episodes);

  return {
    id: item.id ?? item.mal_id,
    malId: item.malId ?? item.mal_id ?? item.id,
    title: {
      romaji: title,
      english: title,
      native: item.native || title,
    },
    coverImage: {
      extraLarge: image,
      large: image,
    },
    bannerImage: item.background_image || image,
    format: String(item.type || 'TV').replace(/_/g, ' ').toUpperCase(),
    status: String(item.status || '').toLowerCase().includes('airing') ? 'RELEASING' : 'FINISHED',
    episodes: Number.isFinite(episodes) && episodes > 0 ? episodes : null,
    nextAiringEpisode: null,
    averageScore: Number.isFinite(rawScore)
      ? Math.round(rawScore <= 10 ? rawScore * 10 : rawScore)
      : 0,
    seasonYear: item.year || null,
    genres: Array.isArray(item.genres) ? item.genres : [],
    description: item.description || '',
    isAdult: false,
    duration: null,
  };
}

// ─── Public functions ─────────────────────────────────────────

export async function fetchSpotlight(signal) {
  return fetchList('/spotlight', [], signal);
}

export async function fetchTrendingAnime(page = 1, signal) {
  return fetchList(`/trending?page=${page}`, [], signal);
}

export async function fetchRecentEpisodes(page = 1, signal) {
  const items = await fetchList(`/recent?page=${page}`, [], signal);
  return items.map(normalizeRecentItem).filter(Boolean);
}

export async function searchAnime(query, page = 1, signal) {
  const q = encodeURIComponent(query);
  try {
    return (await apiFetch(`/search?q=${q}&page=${page}`, signal)) || [];
  } catch {
    return [];
  }
}

export async function fetchBrowse(category, page = 1, signal) {
  try {
    const data = await apiFetch(`/browse?category=${category}&page=${page}`, signal);
    return data || { results: [], hasNextPage: false };
  } catch {
    return { results: [], hasNextPage: false };
  }
}

export async function fetchAnimeInfo(id, signal) {
  try {
    return await apiFetch(`/anime/${id}`, signal);
  } catch {
    return null;
  }
}

export async function fetchAnimeEpisodes(id, signal) {
  return fetchList(`/anime/${id}/episodes`, [], signal);
}

export async function fetchAnimeSeasons(id, signal) {
   return fetchList(`/anime/${id}/seasons`, [], signal);
}

export async function fetchAnimeRelated(id, signal) {
  try {
    return await apiFetch(`/anime/${id}/related`, signal);
  } catch {
    return null;
  }
}

export async function fetchAiringEpisode(id, signal) {
  try {
    return await apiFetch(`/anime/${id}/airing-episode`, signal);
  } catch {
    return null;
  }
}

export async function fetchRecommendations(id, signal) {
  return fetchList('/trending?page=1', [], signal);
}

export async function fetchMultipleAnime(ids) {
  if (!ids?.length) return [];
  const results = [];
  const chunkSize = 5;
  
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const chunkResults = await Promise.allSettled(chunk.map(id => fetchAnimeInfo(id)));
    results.push(...chunkResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value));
    
    if (i + chunkSize < ids.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return results;
}
