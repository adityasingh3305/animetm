const {
  aggregateRelatedSeries,
  filterRelatedItems,
} = require('./relation-service');

function makeAnime(id, title, startDate, mediaType = 'tv', relatedAnime = []) {
  return {
    id,
    title,
    alternative_titles: { en: `${title} English` },
    main_picture: { large: `https://img.test/${id}.jpg` },
    start_date: startDate,
    end_date: null,
    num_episodes: mediaType === 'movie' ? 1 : 12,
    media_type: mediaType,
    average_episode_duration: 1440,
    related_anime: relatedAnime,
  };
}

function relation(type, node) {
  return { relation_type: type, node };
}

describe('related anime aggregation service', () => {
  test('traverses a root anime with a prequel and sequel', async () => {
    const root = makeAnime(2, 'Middle', '2020-01-01', 'tv', [
      relation('prequel', { id: 1, title: 'Beginning', media_type: 'tv', start_date: '2018-01-01' }),
      relation('sequel', { id: 3, title: 'Ending', media_type: 'movie', start_date: '2022-01-01' }),
    ]);
    const data = new Map([
      [1, makeAnime(1, 'Beginning', '2018-01-01')],
      [2, root],
      [3, makeAnime(3, 'Ending', '2022-01-01', 'movie')],
    ]);

    const result = await aggregateRelatedSeries(2, { fetchAnime: id => data.get(id) });
    expect(result.items.map(item => item.id)).toEqual([1, 2, 3]);
    expect(result.items.find(item => item.id === 2).relation).toBe('Current');
    expect(result.items.find(item => item.id === 2).related).toEqual({ '1': 'Prequel', '3': 'Sequel' });
  });

  test('deduplicates duplicate relationship entries and requests each ID once', async () => {
    const root = makeAnime(10, 'Root', '2020-01-01', 'tv', [
      relation('sequel', { id: 11, title: 'Next', media_type: 'tv', start_date: '2021-01-01' }),
      relation('sequel', { id: 11, title: 'Next', media_type: 'tv', start_date: '2021-01-01' }),
    ]);
    const calls = [];
    const data = new Map([[10, root], [11, makeAnime(11, 'Next', '2021-01-01')]]);
    const result = await aggregateRelatedSeries(10, {
      fetchAnime: id => { calls.push(id); return data.get(id); },
    });
    expect(result.items.map(item => item.id)).toEqual([10, 11]);
    expect(calls).toEqual([10, 11]);
  });

  test('ignores character, adaptation, and non-anime relations', async () => {
    const root = makeAnime(20, 'Root', '2020-01-01', 'tv', [
      relation('character', { id: 21, title: 'Character', media_type: 'character' }),
      relation('adaptation', { id: 22, title: 'Manga', media_type: 'manga' }),
      relation('sequel', { id: 23, title: 'Anime Sequel', media_type: 'tv', start_date: '2021-01-01' }),
    ]);
    const result = await aggregateRelatedSeries(20, {
      fetchAnime: id => id === 20 ? root : makeAnime(id, 'Anime Sequel', '2021-01-01'),
    });
    expect(result.items.map(item => item.id)).toEqual([20, 23]);
  });

  test('stops cyclic relationships without infinite recursion', async () => {
    const one = makeAnime(30, 'One', '2020-01-01', 'tv', [
      relation('sequel', { id: 31, title: 'Two', media_type: 'tv', start_date: '2021-01-01' }),
    ]);
    const two = makeAnime(31, 'Two', '2021-01-01', 'tv', [
      relation('prequel', { id: 30, title: 'One', media_type: 'tv', start_date: '2020-01-01' }),
    ]);
    const result = await aggregateRelatedSeries(30, { fetchAnime: id => id === 30 ? one : two, maxDepth: 10 });
    expect(result.items.map(item => item.id)).toEqual([30, 31]);
  });

  test('sorts by release date, then type priority, then ID', async () => {
    const root = makeAnime(40, 'Root', '2020-02-01', 'tv', [
      relation('other', { id: 43, title: 'Movie', media_type: 'movie', start_date: '2020-01-01' }),
      relation('other', { id: 42, title: 'TV', media_type: 'tv', start_date: '2020-01-01' }),
      relation('other', { id: 41, title: 'Unknown Date', media_type: 'ova' }),
      relation('other', { id: 44, title: 'Music', media_type: 'music' }),
      relation('other', { id: 45, title: 'Special', media_type: 'special' }),
    ]);
    const result = await aggregateRelatedSeries(40, {
      fetchAnime: id => {
        if (id === 40) return root;
        const types = { 41: 'ova', 42: 'tv', 43: 'movie', 44: 'music', 45: 'special' };
        const dates = { 42: '2020-01-01', 43: '2020-01-01' };
        return makeAnime(id, `Anime ${id}`, dates[id] || null, types[id]);
      },
    });
    expect(result.items.map(item => item.id)).toEqual([42, 43, 40, 41, 45, 44]);
  });

  test('applies manual order, exclusions, group ID, and relation label overrides', async () => {
    const root = makeAnime(50, 'Root', '2020-01-01', 'tv', [
      relation('sequel', { id: 51, title: 'Next', media_type: 'tv', start_date: '2021-01-01' }),
      relation('prequel', { id: 52, title: 'Before', media_type: 'tv', start_date: '2019-01-01' }),
    ]);
    const result = await aggregateRelatedSeries(50, {
      fetchAnime: id => id === 50 ? root : makeAnime(id, id === 51 ? 'Next' : 'Before', id === 51 ? '2021-01-01' : '2019-01-01'),
      overrides: {
        groups: {
          franchise: {
            animeIds: [50],
            groupId: 'custom-franchise',
            title: 'Custom Order',
            order: [51, 50],
            excludedIds: [52],
            relationLabels: { '50:51': 'Watch Next' },
          },
        },
      },
    });
    expect(result.groupId).toBe('custom-franchise');
    expect(result.title).toBe('Custom Order');
    expect(result.items.map(item => item.id)).toEqual([51, 50]);
    expect(result.items.find(item => item.id === 50).related['51']).toBe('Watch Next');
  });

  test('returns a useful root-only payload when the provider has no relations', async () => {
    const result = await aggregateRelatedSeries(60, {
      fetchAnime: () => makeAnime(60, 'Standalone', '2020-01-01'),
    });
    expect(result.items).toHaveLength(1);
    expect(result.hasRelations).toBe(false);
  });

  test('surfaces a provider error for the root anime', async () => {
    await expect(aggregateRelatedSeries(61, {
      fetchAnime: () => { throw new Error('provider unavailable'); },
    })).rejects.toThrow('provider unavailable');
  });

  test('keeps the selected item while hiding Music, PV, CM, TV Special, and Special', () => {
    const items = [
      { id: 70, type: 'TV', title: 'Series' },
      { id: 71, type: 'MUSIC', title: 'Theme' },
      { id: 72, type: 'SPECIAL', title: 'Special' },
      { id: 73, type: 'OVA', title: 'PV Preview' },
      { id: 74, type: 'TV', title: 'TV Special' },
      { id: 75, type: 'CM', title: 'Commercial' },
    ];
    expect(filterRelatedItems(items, true, 72).map(item => item.id)).toEqual([70, 72]);
  });
});
