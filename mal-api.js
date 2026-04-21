// ============================================================
//  AnimeTM — Frontend API Client
//  Talks to local proxy server (server.js) on port 3001
// ============================================================

const PROXY_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3001/api' 
  : '/api';

// ─── Generic fetch with error handling ───────────────────────
async function apiFetch(path) {
  try {
    const res = await fetch(`${PROXY_BASE}${path}`);
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[API]', path, err.message);
    return null;
  }
}

// ─── Public functions (drop-in replacements) ─────────────────

async function fetchSpotlight() {
  return (await apiFetch('/spotlight')) || [];
}

async function fetchTrendingAnime(page = 1) {
  return (await apiFetch(`/trending?page=${page}`)) || [];
}

async function fetchRecentEpisodes(page = 1) {
  return (await apiFetch(`/recent?page=${page}`)) || [];
}

async function searchAnime(query, page = 1) {
  const q = encodeURIComponent(query);
  return (await apiFetch(`/search?q=${q}&page=${page}`)) || [];
}

async function fetchBrowse(category, page = 1) {
  const data = await apiFetch(`/browse?category=${category}&page=${page}`);
  return data || { results: [], hasNextPage: false };
}

async function fetchAnimeInfo(id) {
  return await apiFetch(`/anime/${id}`);
}

async function fetchAnimeEpisodes(id) {
  return (await apiFetch(`/anime/${id}/episodes`)) || [];
}

async function fetchAnimeSeasons(id) {
  return (await apiFetch(`/anime/${id}/seasons`)) || [];
}

async function fetchRecommendations(id) {
  // Fallback to trending when no dedicated recommendation endpoint
  return (await apiFetch('/trending?page=1')) || [];
}

async function fetchMultipleAnime(ids) {
  if (!ids?.length) return [];
  const results = await Promise.allSettled(ids.map(id => fetchAnimeInfo(id)));
  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

// ─── MAL_API namespace (used by newer script.js calls) ────────
const MAL_API = {
  getAnimeDetails:   fetchAnimeInfo,
  searchAnime,
  fetchSpotlight,
  fetchRecentEpisodes,
  fetchTrendingAnime,
  fetchBrowse,
  fetchAnimeEpisodes,
  fetchAnimeSeasons,
  fetchRecommendations,
  fetchMultipleAnime,
};
