// ============================================================
//  AnimeTM — MAL API Proxy Server
//  Runs on http://localhost:3001
//  Forwards all requests to MAL API with Client ID auth
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { LRUCache } = require('lru-cache');
const helmet = require('helmet');
const path = require('path');
const { normalize, getPagination, getCurrentSeason, getAiringEpisode, distillAnizipArtwork, distillAnizip, buildEpisodeList, STATUS_MAP } = require('./server-utils');
const { aggregateRelatedSeries } = require('./relation-service');
const relationOverrides = require('./relation-overrides.json');

// ─── Configuration & Constants ────────────────────────────────
const CONFIG = {
  PORT: process.env.PORT || 3001,
  MAL_BASE: 'https://api.myanimelist.net/v2',
  ANIZIP_BASE: 'https://api.ani.zip',
  MAL_CLIENT_ID: (process.env.MAL_CLIENT_ID || '').trim(),
  FETCH_TIMEOUT: 10000,
  // AniZip payloads can be ~1.9MB (long-running shows), so allow more time.
  ANIZIP_TIMEOUT: 20000,
  CACHE_MAX_SIZE: 200,
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX: 100,
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5500,http://localhost:5500')
    .split(',').map(o => o.trim()).filter(Boolean)
};

const FIELDS = {
  STANDARD: [
    'id', 'title', 'main_picture', 'alternative_titles',
    'start_date', 'synopsis', 'mean', 'rank', 'popularity',
    'num_episodes', 'status', 'genres', 'media_type',
    'start_season', 'average_episode_duration', 'rating', 'source', 'end_date'
  ].join(','),
  RELATION: 'related_anime{relation_type,node{id,title,main_picture,alternative_titles,start_date,end_date,num_episodes,media_type,average_episode_duration}}',
  RELATED: 'id,title,alternative_titles,main_picture,start_date,end_date,num_episodes,media_type,average_episode_duration,related_anime{relation_type,node{id,title,alternative_titles,main_picture,start_date,end_date,num_episodes,media_type,average_episode_duration}}'
};

// Enforce required environment variables
if (!CONFIG.MAL_CLIENT_ID) {
  console.error('\n  ❌  FATAL: MAL_CLIENT_ID environment variable is missing.');
  console.error('      Please set it before running the server.\n');
  process.exit(1);
}

// ─── App Setup & Middleware ───────────────────────────────────
const app = express();

// Cache Instance
const cache = new LRUCache({
  max: CONFIG.CACHE_MAX_SIZE,
  ttl: CONFIG.CACHE_TTL,
});

const anikotoCache = new LRUCache({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

// Stores the distilled episode array (not the raw ~MB AniZip payload)
const anizipCache = new LRUCache({
  max: 200,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

// Stores AniZip poster/banner artwork by MAL id. Artwork is shared by every
// discovery/detail route so the UI consistently uses AniZip images.
const anizipArtworkCache = new LRUCache({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

// Stores normalized relationship graphs so opening the same franchise does
// not refetch every MAL relation node for each details-page visit.
const relatedSeriesCache = new LRUCache({
  max: 200,
  ttl: 6 * 60 * 60 * 1000, // 6 hours
});

app.use(helmet({
  contentSecurityPolicy: false, // Managed in index.html
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50kb' }));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin
      || /^https?:\/\/localhost(:\d+)?$/.test(origin)
      || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
      || /^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin)
      || /^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(origin)
      || CONFIG.ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origin not allowed by CORS'));
    }
  },
  credentials: true
}));

// CORS Error Handler
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('Origin not allowed')) {
    return res.status(403).json({ error: 'CORS not allowed' });
  }
  next(err);
});

// Trust proxy for rate limiting behind load balancers
app.set('trust proxy', 1);

// Rate limiting
app.use(rateLimit({
  windowMs: CONFIG.RATE_LIMIT_WINDOW,
  max: CONFIG.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
}));

// Input validation middleware for GET requests
app.use((req, res, next) => {
  if (req.method === 'GET') {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string' && req.query[key].length > 2000) {
        return res.status(400).json({ error: 'Query parameter too long' });
      }
    }
  }
  next();
});

// ─── Helpers ──────────────────────────────────────────────────
/**
 * Executes a fetch request to the MAL API with caching and timeout.
 * @param {string} path - The MAL API endpoint path
 * @param {object} [params={}] - Query parameters
 * @returns {Promise<object>} The JSON response from MAL
 * @throws {Error} If the request fails or times out
 */
async function malFetch(path, params = {}, retries = 1) {
  const qs = new URLSearchParams(params).toString();
  const url = `${CONFIG.MAL_BASE}${path}${qs ? '?' + qs : ''}`;
  const cacheKey = url;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);
    try {
      const res = await fetch(url, {
        headers: {
          'X-MAL-CLIENT-ID': CONFIG.MAL_CLIENT_ID,
          'Accept': 'application/json',
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const txt = await res.text();
        lastError = new Error(`MAL API returned ${res.status}: ${txt}`);
        // Retry on MAL server errors and rate limits
        if ((res.status >= 500 || res.status === 429) && attempt < retries) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        throw lastError;
      }
      const data = await res.json();
      cache.set(cacheKey, data);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (error.name === 'AbortError') {
        lastError = new Error('MAL API request timed out');
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      throw lastError;
    }
  }
}

/**
 * Fetches and distills episode metadata from AniZip for a MAL id.
 * Returns the distilled episode array, or null when AniZip has no record.
 * Never throws — callers treat null as "no AniZip data available".
 * @param {string|number} malId - MAL anime id
 * @returns {Promise<Array|null>}
 */
async function anizipFetch(malId, retries = 1) {
  const cacheKey = String(malId);
  const cached = anizipCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const url = `${CONFIG.ANIZIP_BASE}/mappings?mal_id=${encodeURIComponent(malId)}`;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.ANIZIP_TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status === 404) {
        anizipCache.set(cacheKey, null);
        return null;
      }
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        return null;
      }
      const json = await res.json();
      const distilled = distillAnizip(json?.episodes, json?.episodeCount);
      anizipCache.set(cacheKey, distilled);
      return distilled;
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      console.warn(`[anizip] fetch failed for mal ${malId}:`, error.message);
      return null;
    }
  }
}

/**
 * Fetches AniZip artwork for a MAL id.
 * Returns null when AniZip has no mapping or the request fails.
 */
async function anizipArtworkFetch(malId, retries = 1) {
  const cacheKey = String(malId);
  const cached = anizipArtworkCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const url = `${CONFIG.ANIZIP_BASE}/mappings?mal_id=${encodeURIComponent(malId)}`;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.ANIZIP_TIMEOUT);
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'AnimeTM/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.status === 404) {
        anizipArtworkCache.set(cacheKey, null);
        return null;
      }
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        anizipArtworkCache.set(cacheKey, null);
        return null;
      }
      const json = await res.json();
      const artwork = distillAnizipArtwork(json?.images);
      anizipArtworkCache.set(cacheKey, artwork);
      return artwork;
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      console.warn(`[anizip artwork] fetch failed for mal ${malId}:`, error.message);
      anizipArtworkCache.set(cacheKey, null);
      return null;
    }
  }
}

async function enrichAnimeArtwork(anime) {
  if (!anime || !anime.id) return anime;
  const artwork = await anizipArtworkFetch(anime.malId || anime.id);
  if (!artwork) return anime;

  const poster = artwork.poster || anime.coverImage?.extraLarge || anime.coverImage?.large || '';
  // Use AniZip fanart for the cinematic hero background; keep the poster
  // artwork for cards and the hero poster panel.
  const banner = artwork.fanart || artwork.banner || anime.bannerImage || poster;
  return {
    ...anime,
    coverImage: {
      ...anime.coverImage,
      extraLarge: poster,
      large: poster,
    },
    bannerImage: banner,
  };
}

async function enrichAnimeList(items) {
  return Promise.all((items || []).map(enrichAnimeArtwork));
}

async function enrichRecentArtwork(item) {
  if (!item || !item.id) return item;
  const artwork = await anizipArtworkFetch(item.mal_id || item.malId || item.id);
  if (!artwork) return item;
  return {
    ...item,
    image: artwork.poster || item.image || '',
    background_image: artwork.fanart || artwork.banner || item.background_image || artwork.poster || '',
  };
}

/**
 * Wrapper to handle route logic, caching headers, and common error responses.
 * @param {express.Request} req - Express request
 * @param {express.Response} res - Express response
 * @param {Function} fetcher - Async function returning the payload to send
 */
async function routeHandler(req, res, fetcher) {
  try {
    const data = await fetcher();
    res.set('Cache-Control', `public, max-age=${Math.floor(CONFIG.CACHE_TTL / 1000)}`);
    res.json(data);
  } catch (e) {
    console.error(`[${req.path}]`, e.message);
    if (res.headersSent) return;
    const status = e.message.includes('timed out') ? 504 : 502;
    res.status(status).json({ error: e.message });
  }
}

// ─── Base Routes ──────────────────────────────────────────────
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: Date.now() }));

// ─── API Routes: Discovery ────────────────────────────────────
app.get('/api/spotlight', (req, res) => {
  routeHandler(req, res, async () => {
    const { year, season } = getCurrentSeason();
    const data = await malFetch(`/anime/season/${year}/${season}`, {
      sort: 'anime_score',
      limit: 10,
      fields: FIELDS.STANDARD,
    });
    return enrichAnimeList((data?.data ?? []).map(normalize));
  });
});

app.get('/api/trending', (req, res) => {
  routeHandler(req, res, async () => {
    const { limit, offset } = getPagination(req.query.page, 20);
    const data = await malFetch('/anime/ranking', {
      ranking_type: 'bypopularity',
      limit,
      offset,
      fields: FIELDS.STANDARD,
    });
    return enrichAnimeList((data?.data ?? []).map(normalize));
  });
});

app.get('/api/recent', (req, res) => {
  routeHandler(req, res, async () => {
    const page = parseInt(req.query.page || 1, 10);
    const perPage = 24;

    try {
      const response = await fetch(`https://anikotoapi.site/recent-anime?page=${page}&per_page=${perPage}`);
      if (!response.ok) throw new Error('Anikoto fetch failed');
      const data = await response.json();

      if (data && data.ok && Array.isArray(data.data)) {
        const recentItems = data.data.map(item => {
          if (item.mal_id && item.id) {
            anikotoCache.set(String(item.mal_id), String(item.id));
          }

          return {
            id: item.mal_id ? parseInt(item.mal_id, 10) : item.id,
            title: item.title || item.native || 'Unknown',
            image: item.poster || item.background_image || '',
            type: item.terms_by_type?.type?.[0] || 'TV',
            episodes: item.episodes || null,
            score: item.score || null,
            status: item.status || 'Finished Airing',
            genres: item.terms_by_type?.genre || []
          };
        });
        return Promise.all(recentItems.map(enrichRecentArtwork));
      }
    } catch (err) {
      console.warn('Anikoto recent failed, falling back to MAL', err.message);
    }

    const { limit, offset } = getPagination(req.query.page, 24);
    const data = await malFetch('/anime/ranking', {
      ranking_type: 'airing',
      limit,
      offset,
      fields: FIELDS.STANDARD,
    });
    return enrichAnimeList((data?.data ?? []).map(normalize));
  });
});

app.get('/api/search', (req, res) => {
  routeHandler(req, res, async () => {
    const q = (req.query.q || '').trim();
    if (!q) return [];
    const { limit, offset } = getPagination(req.query.page, 20);
    const data = await malFetch('/anime', {
      q,
      limit,
      offset,
      fields: FIELDS.STANDARD,
    });
    return enrichAnimeList((data?.data ?? []).map(normalize));
  });
});

app.get('/api/browse', (req, res) => {
  routeHandler(req, res, async () => {
    const catMap = {
      movie: 'movie',
      tv: 'tv',
      airing: 'airing',
      bypopularity: 'bypopularity',
    };
    const cat = catMap[req.query.category] ?? 'bypopularity';
    const { limit, offset } = getPagination(req.query.page, 24);
    const data = await malFetch('/anime/ranking', {
      ranking_type: cat,
      limit,
      offset,
      fields: FIELDS.STANDARD,
    });
    return {
      results: await enrichAnimeList((data?.data ?? []).map(normalize)),
      hasNextPage: !!data?.paging?.next,
    };
  });
});

// ─── API Routes: Details ──────────────────────────────────────
app.get('/api/anime/:id', (req, res) => {
  routeHandler(req, res, async () => {
    const malId = String(req.params.id).replace(/[^0-9]/g, '');
    if (!malId) throw new Error('Invalid anime ID');
    const data = await malFetch(`/anime/${malId}`, {
      fields: FIELDS.STANDARD,
    });
    return enrichAnimeArtwork(normalize(data));
  });
});

app.get('/api/anime/:id/related', (req, res) => {
  routeHandler(req, res, async () => {
    const malId = String(req.params.id).replace(/[^0-9]/g, '');
    if (!malId) throw new Error('Invalid anime ID');

    const cacheKey = String(malId);
    const cached = relatedSeriesCache.get(cacheKey);
    if (cached) return cached;

    const payload = await aggregateRelatedSeries(malId, {
      maxDepth: 3,
      overrides: relationOverrides,
      fetchAnime: (id) => malFetch(`/anime/${id}`, { fields: FIELDS.RELATED }),
    });
    relatedSeriesCache.set(cacheKey, payload);
    return payload;
  });
});

app.get('/api/anime/:id/episodes', (req, res) => {
  routeHandler(req, res, async () => {
    const malId = String(req.params.id).replace(/[^0-9]/g, "");
    if (!malId) throw new Error("Invalid anime ID");

    // 1. Provider (anikoto) episodes — authoritative for stream embed ids
    let anikoto = null;
    const anikotoId = anikotoCache.get(String(malId));
    if (anikotoId) {
      try {
        const response = await fetch(`https://anikotoapi.site/series/${anikotoId}`);
        if (response.ok) {
          const json = await response.json();
          if (json.ok && json.data && Array.isArray(json.data.episodes)) {
            anikoto = json.data.episodes.map(ep => ({
              id: ep.number,
              title: ep.title || '',
              image: '',
              airedAt: null,
              embed_id: ep.episode_embed_id || null
            }));
          }
        }
      } catch (err) {
        console.warn(`Anikoto episode fetch failed for malId ${malId}`, err.message);
      }
    }

    // 2. AniZip metadata — real titles, air dates, runtime, absolute numbers
    const anizip = await anizipFetch(malId);

    // 3. MAL synthetic list, only needed when neither source produced episodes
    let mal = null;
    if (!(anikoto && anikoto.length) && !(anizip && anizip.length)) {
      const data = await malFetch(`/anime/${malId}`, {
        fields: 'num_episodes,status,start_date'
      });
      if (data?.status === 'not_yet_aired') return [];

      let total = data?.num_episodes || 0;
      const airing = data?.status === 'currently_airing' ? getAiringEpisode(data?.start_date) : null;

      if (airing) {
        total = total > 0 ? Math.min(total, airing.episode) : airing.episode;
      }
      if (total === 0) total = 12; // Fallback

      const start = data?.start_date ? new Date(data.start_date) : null;
      mal = Array.from({ length: total }, (_, i) => {
        let airedAt = null;
        if (start && !isNaN(start.getTime())) {
          airedAt = new Date(start.getTime() + i * 7 * 24 * 60 * 60 * 1000).toISOString();
        }
        return { id: i + 1, title: `Episode ${i + 1}`, image: '', airedAt };
      });
    }

    return buildEpisodeList({ anikoto, anizip, mal });
  });
});

app.get('/api/anime/:id/airing-episode', (req, res) => {
  routeHandler(req, res, async () => {
    const malId = String(req.params.id).replace(/[^0-9]/g, '');
    if (!malId) throw new Error('Invalid anime ID');
    const data = await malFetch(`/anime/${malId}`, {});
    const status = data?.status;
    const total = data?.num_episodes || 0;
    const airing = status === 'currently_airing' ? getAiringEpisode(data?.start_date) : null;
    return {
      currentEpisode: airing ? airing.episode : (status === 'finished_airing' ? total : 0),
      totalEpisodes: total || 12,
      status: STATUS_MAP[status] || 'FINISHED'
    };
  });
});

app.get('/api/anime/:id/seasons', (req, res) => {
  routeHandler(req, res, async () => {
    const malId = String(req.params.id).replace(/[^0-9]/g, '');
    if (!malId) throw new Error('Invalid anime ID');
    const data = await malFetch(`/anime/${malId}`, { fields: FIELDS.RELATION });
    const valid = new Set(['prequel', 'sequel', 'alternative_version', 'parent_story', 'side_story']);
    return enrichAnimeList((data?.related_anime ?? [])
      .filter(r => valid.has(r.relation_type) && r.node)
      .map(r => ({ ...normalize(r.node), relationType: r.relation_type })));
  });
});

// ─── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Global Error]', err.stack);
  if (res.headersSent) return next(err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// ─── Start Server ─────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
  console.log(`\n  ✅  AnimeTM Proxy running → http://localhost:${CONFIG.PORT}`);
  console.log(`  📡  Forwarding MAL API requests with Client ID\n`);
});
