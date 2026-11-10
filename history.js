// ============================================================
//  AnimeTM — Watch History Manager (with pruning)
// ============================================================

import { getImageUrl } from './utils.js';

const MAX_HISTORY_ITEMS = 100;

export const HistoryManager = {
    key: 'animetm_history',
    bookmarksKey: 'animetm_bookmarks',

    save(anime, epIndex, time, duration) {
        const history = this.getAll();
        history[anime.id] = {
            id: anime.id,
            title: anime.title?.english || anime.title?.romaji || 'Unknown',
            image: getImageUrl(anime),
            epIndex,
            epLabel: `Episode ${epIndex + 1}`,
            time,
            duration,
            percent: Math.round((time / duration) * 100) || 0,
            updatedAt: Date.now()
        };

        // Prune to last MAX_HISTORY_ITEMS most recently updated
        const entries = Object.values(history);
        if (entries.length > MAX_HISTORY_ITEMS) {
            const sorted = entries.sort((a, b) => b.updatedAt - a.updatedAt);
            const toKeep = sorted.slice(0, MAX_HISTORY_ITEMS);
            const pruned = {};
            for (const item of toKeep) {
                pruned[item.id] = item;
            }
            localStorage.setItem(this.key, JSON.stringify(pruned));
        } else {
            localStorage.setItem(this.key, JSON.stringify(history));
        }

        // Trigger re-render of continue watching if not in browse mode
        // (renderContinueWatching is imported and called by app.js)
        if (window.__renderContinueWatching && !window.__browseState?.active) {
            window.__renderContinueWatching();
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
        if (window.__renderContinueWatching) {
            window.__renderContinueWatching();
        }
    },

    // ─── Bookmarks Management ────────────────────────────────────
    getBookmarks() {
        try {
            const stored = localStorage.getItem(this.bookmarksKey);
            const bookmarks = stored ? JSON.parse(stored) : [];
            return Array.isArray(bookmarks) ? bookmarks : [];
        } catch {
            return [];
        }
    },

    toggleBookmark(id) {
        const bookmarks = this.getBookmarks();
        const index = bookmarks.indexOf(id);
        if (index > -1) {
            bookmarks.splice(index, 1);
        } else {
            bookmarks.push(id);
        }
        try {
            localStorage.setItem(this.bookmarksKey, JSON.stringify(bookmarks));
        } catch (e) {
            console.error('Failed to save bookmark:', e);
        }
        return !bookmarks.includes(id);
    },

    isBookmarked(id) {
        return this.getBookmarks().includes(id);
    }
};
