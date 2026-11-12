import { apiRequest } from './api/config.js';
import { getSite, siteURL, el, safeHTML, formatDate } from './site.js';
import { setTitle } from './main.js';

const params = new URLSearchParams(location.search);
const slug = params.get('slug');
// Only known local collection routes may be used as a return destination.
function returnDestination() {
    try {
        const candidate = new URL(params.get('from') || siteURL('/explore/#articles'), location.origin);
        if (candidate.origin === location.origin && [siteURL('/explore/'), siteURL('/articles/')].includes(candidate.pathname)) {
            return candidate.pathname + candidate.search + '#articles';
        }
    } catch { /* Malformed return links use the collection's safe default. */ }
    return siteURL('/explore/#articles');
}
const backURL = returnDestination();
const articleURL = slug => siteURL(`/articles/post/?slug=${encodeURIComponent(slug)}&from=${encodeURIComponent(backURL)}`);

document.addEventListener('DOMContentLoaded', loadArticle);
async function loadArticle() {
    const feedback = document.querySelector('[data-article-feedback]');
    const content = document.querySelector('[data-article-content]');
    feedback.hidden = false;
    feedback.replaceChildren(el('p', { role: 'status' }, 'Loading article…'));
    try {
        if (!slug) throw Object.assign(new Error('Choose an article to start reading.'), { status: 404 });
        const [{ settings }, article] = await Promise.all([getSite(), apiRequest(`/api/articles/${encodeURIComponent(slug)}`)]);
        const labels = settings.blog || {};
        setTitle(article.title, settings.site_title);
        document.querySelector('[data-breadcrumbs]').replaceChildren(
            el('a', { href: siteURL('/') }, labels.home || 'Home'), ' / ',
            el('a', { href: backURL }, 'Back to articles'));
        document.querySelector('[data-article-title]').textContent = article.title;
        document.querySelector('[data-article-meta]').textContent =
            [`${labels.by || 'By'} ${article.author}`, formatDate(article.published).long, article.categories.map(c => c.name).join(', ')].filter(Boolean).join(' · ');
        if (article.image) document.querySelector('[data-article-image]').style.backgroundImage = `url("${siteURL(article.image)}")`;
        const body = document.querySelector('[data-article]');
        body.replaceChildren(safeHTML(article.body));
        const first = body.firstElementChild;
        if (first && /^H[1-4]$/.test(first.tagName) && first.textContent.trim() === article.title.trim()) first.remove();
        const link = (other, label, side) => other ? el('a', { class: `post-nav__link post-nav__link--${side}`, href: articleURL(other.slug) },
            el('span', { class: 'post-nav__bg', style: { backgroundImage: other.image ? `url("${siteURL(other.image)}")` : '' } }),
            el('h3', {}, el('span', { class: 'post-nav__label' }, label), el('span', { class: 'post-nav__title' }, other.title))) : null;
        document.querySelector('[data-post-nav]').replaceChildren(...[
            link(article.newer, 'Newer article', 'previous'), link(article.older, 'Older article', 'next')].filter(Boolean));
        content.hidden = false; feedback.hidden = true;
        setUpShare(article.title);
    } catch (error) {
        const missing = error.status === 404;
        setTitle(missing ? 'Article not found' : 'Unable to load article', 'XRCare AI');
        const retry = el('button', { type: 'button', class: 'pill-button pill-button--small' }, 'Try again');
        retry.addEventListener('click', loadArticle);
        feedback.replaceChildren(el('div', { class: 'articles__state', role: 'alert' },
            el('h1', { class: 'article-hero__title' }, missing ? 'Article not found' : 'Unable to load this article'),
            el('p', {}, missing ? 'This article may have moved. Browse the collection to find another story.' : 'Please try again shortly, or return to the article collection.'),
            missing ? null : retry, el('a', { class: 'articles__help-link', href: backURL }, 'Back to articles')));
    }
}

function setUpShare(title) {
    const box = document.querySelector('[data-share]');
    const toggle = box.querySelector('.share-button__toggle');
    const link = box.querySelector('.share-button__link');
    const canonical = new URL(location.href); canonical.searchParams.delete('from');
    link.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}`;
    link.title = title;
    toggle.onclick = () => toggle.setAttribute('aria-expanded', String(box.classList.toggle('is-open')));
    box.addEventListener('keydown', event => {
        if (event.key === 'Escape') { box.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
    });
    box.hidden = false;
}
