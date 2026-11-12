import { apiRequest } from './api/config.js';
import { siteURL, el, formatDate } from './site.js';

// Shared by the Explore article section, including legacy /articles/ redirects.
// Filters live in the URL so refresh, copied links, and Back/Forward keep their context.
export function articleList(content) {
    let params = new URLSearchParams(location.search);
    let articles = [], categories = new Map(), request = 0, debounce;
    const search = el('input', { id: 'article-search', class: 'articles__search-input', type: 'search',
        placeholder: content.search_placeholder || 'Search articles', value: params.get('s') || '' });
    const chips = el('div', { class: 'articles__chips', role: 'group', 'aria-label': 'Article categories' });
    const status = el('p', { class: 'articles__count', role: 'status', 'aria-live': 'polite' });
    const grid = el('div', { class: 'articles__grid', id: 'article-results' });
    const filters = el('div', { class: 'articles__filters' });
    const clear = el('button', { type: 'button', class: 'articles__clear' }, 'Clear filters');
    const sort = el('select', { id: 'article-sort', class: 'articles__sort' },
        el('option', { value: 'newest' }, 'Newest first'), el('option', { value: 'oldest' }, 'Oldest first'));
    sort.value = params.get('sort') === 'oldest' ? 'oldest' : 'newest';

    function saveURL() {
        const url = new URL(location.href);
        url.search = params.toString();
        history.replaceState(null, '', url);
    }
    function updateFilters() {
        const selected = params.get('category') || '';
        const choices = new Map(categories);
        if (selected && !choices.has(selected)) choices.set(selected, selected.replaceAll('-', ' '));
        const chip = (slug, name) => {
            const button = el('button', { type: 'button', class: 'articles__chip', 'aria-pressed': String(slug === selected),
                'aria-controls': 'article-results' }, name);
            button.addEventListener('click', () => {
                if (slug) params.set('category', slug); else params.delete('category');
                saveURL(); load();
            });
            return button;
        };
        chips.replaceChildren(chip('', content.all_label || 'All topics'), ...[...choices].map(([slug, name]) => chip(slug, name)));
        filters.replaceChildren(...['author', 'month'].filter(key => params.has(key)).map(key => {
            const button = el('button', { type: 'button', class: 'articles__chip' },
                `${key === 'author' ? 'Author' : 'Archive'}: ${params.get(key)} ×`);
            button.setAttribute('aria-label', `Remove ${key} filter: ${params.get(key)}`);
            button.addEventListener('click', () => { params.delete(key); saveURL(); load(); });
            return button;
        }));
        clear.hidden = !['s', 'category', 'author', 'month'].some(key => params.get(key));
    }
    function card(article, index) {
        const featured = index === 0;
        const heading = el('h3', { class: 'article-card__title' }, article.title);
        const image = article.image || article.thumbnail;
        const date = formatDate(article.published);
        return el('a', { class: `article-card${featured ? ' article-card--featured' : ''}`,
            href: siteURL(`/articles/post/?slug=${encodeURIComponent(article.slug)}&from=${encodeURIComponent(location.pathname + location.search + "#articles")}`) },
            el('span', { class: 'article-card__image' }, image ? el('img', { src: siteURL(image), alt: '', loading: 'lazy' }) :
                el('span', { class: 'article-card__placeholder', 'aria-hidden': 'true' }, 'XR / AI')),
            el('span', { class: 'article-card__body' },
                el('span', { class: 'article-card__category' }, (article.categories || []).map(c => c.name).join(' / ') || 'XRCare insights'),
                heading,
                el('span', { class: 'article-card__excerpt' }, article.excerpt),
                el('span', { class: 'article-card__meta' }, article.author, ' · ', el('time', { datetime: article.published }, date.long)),
                el('span', { class: 'article-card__more' }, content.read_more || 'Read article', el('span', { 'aria-hidden': 'true' }, ' ↗'))));
    }
    function draw() {
        const ordered = [...articles].sort((a, b) => sort.value === 'oldest'
            ? a.published.localeCompare(b.published) : b.published.localeCompare(a.published));
        status.textContent = `${ordered.length} ${ordered.length === 1 ? 'article' : 'articles'}${clear.hidden ? '' : ' found'}`;
        if (ordered.length) grid.replaceChildren(...ordered.map(card));
        else grid.replaceChildren(el('div', { class: 'articles__state' },
            el('h3', {}, clear.hidden ? 'More insights are on the way' : 'No matching articles'),
            el('p', {}, clear.hidden ? 'Check back for new perspectives from the XRCare team.' : 'Try another topic or clear your filters to see all articles.')));
    }
    async function load() {
        clearTimeout(debounce);
        // Capture the visible search value even if a category changes before its debounce finishes.
        if (search.value.trim()) params.set('s', search.value.trim()); else params.delete('s');
        saveURL();
        const id = ++request;
        updateFilters();
        status.textContent = 'Loading articles…';
        grid.setAttribute('aria-busy', 'true');
        grid.replaceChildren(el('div', { class: 'articles__state' }, el('p', {}, 'Loading articles…')));
        const query = new URLSearchParams([...params].filter(([key]) => ['s', 'category', 'author', 'month'].includes(key)));
        try {
            const data = await apiRequest(`/api/articles?${query}`);
            if (id !== request) return;
            articles = data.articles;
            for (const article of articles) for (const category of article.categories || []) categories.set(category.slug, category.name);
            updateFilters(); draw();
        } catch (error) {
            if (id !== request) return;
            status.textContent = 'Articles could not be loaded.';
            const retry = el('button', { type: 'button', class: 'pill-button pill-button--small' }, 'Try again');
            retry.addEventListener('click', load);
            grid.replaceChildren(el('div', { class: 'articles__state', role: 'alert' },
                el('h3', {}, 'Unable to load articles'),
                el('p', {}, 'Please try again shortly. You can still explore our use cases or contact the team.'), retry,
                el('a', { class: 'articles__help-link', href: siteURL('/contact/') }, 'Contact XRCare')));
        } finally { if (id === request) grid.removeAttribute('aria-busy'); }
    }
    const form = el('form', { class: 'articles__search-form', role: 'search', 'aria-label': 'Search articles' },
        el('label', { class: 'sr-only', for: 'article-search' }, 'Search articles'),
        el('div', { class: 'articles__search' }, el('span', { 'aria-hidden': 'true' }, '⌕'), search),
        el('button', { class: 'articles__submit', type: 'submit' }, 'Search'));
    form.addEventListener('submit', event => { event.preventDefault(); load(); });
    search.addEventListener('input', () => {
        // Invalidate an in-flight result as soon as the query changes.
        ++request;
        clearTimeout(debounce); debounce = setTimeout(load, 250);
    });
    sort.addEventListener('change', () => {
        if (sort.value === 'oldest') params.set('sort', 'oldest'); else params.delete('sort');
        saveURL(); if (!grid.hasAttribute('aria-busy')) draw();
    });
    clear.addEventListener('click', () => {
        ['s', 'category', 'author', 'month'].forEach(key => params.delete(key));
        search.value = ''; saveURL(); load();
    });
    addEventListener('popstate', () => {
        params = new URLSearchParams(location.search); search.value = params.get('s') || '';
        sort.value = params.get('sort') === 'oldest' ? 'oldest' : 'newest'; load();
    });
    apiRequest('/api/articles/sidebar').then(data => {
        for (const category of data.categories || []) categories.set(category.slug, category.name);
        updateFilters();
    }).catch(() => {}); // List results supply categories when sidebar metadata is unavailable.
    load();
    return el('div', { class: 'articles' },
        el('div', { class: 'articles__toolbar' }, form,
            el('label', { class: 'articles__sort-label', for: 'article-sort' }, 'Sort by ', sort)),
        chips, filters,
        el('div', { class: 'articles__results-bar' }, status, clear), grid);
}
