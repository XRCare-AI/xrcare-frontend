import { apiRequest } from './api/config.js';
import { getSite, siteURL, el, safeHTML, formatDate, showError } from './site.js';
import { setTitle } from './main.js';

const articleURL = slug => siteURL(`/articles/post/?slug=${encodeURIComponent(slug)}`);

// One article: /articles/post/?slug=<slug> from GET /api/articles/<slug>. Breadcrumbs (back to the Explore hub),
// title over the article's image, the article,
// links to the newer/older article (labelled Previous/Next Post as on xrcare.ai), and a Share button.
document.addEventListener("DOMContentLoaded", async () => {
    const slug = new URLSearchParams(location.search).get("slug");
    try {
        if (!slug) throw new Error("No article was chosen.");
        const [{ settings }, article] = await Promise.all([getSite(), apiRequest(`/api/articles/${encodeURIComponent(slug)}`)]);
        const labels = settings.blog || {};
        setTitle(article.title, settings.site_title);

        document.querySelector("[data-breadcrumbs]").replaceChildren(
            el("a", { href: siteURL("/") }, labels.home), " » ",
            el("a", { href: siteURL("/explore/#articles") }, labels.title));
        document.querySelector("[data-article-title]").textContent = article.title;
        document.querySelector("[data-article-meta]").textContent =
            [`${labels.by} ${article.author}`, formatDate(article.published).long, article.categories.map(c => c.name).join(", ")].join("  ·  ");
        if (article.image) document.querySelector("[data-article-image]").style.backgroundImage = `url("${siteURL(article.image)}")`;
        const body = document.querySelector("[data-article]");
        body.replaceChildren(safeHTML(article.body));
        // Some bodies start by repeating the title, which the header already shows
        const first = body.firstElementChild;
        if (first && /^H[1-4]$/.test(first.tagName) && first.textContent.trim() === article.title.trim()) first.remove();

        const nav = document.querySelector("[data-post-nav]");
        const link = (other, label, side) => other ? el("a", { class: `post-nav__link post-nav__link--${side}`, href: articleURL(other.slug) },
            el("span", { class: "post-nav__bg", style: { backgroundImage: other.image ? `url("${siteURL(other.image)}")` : "" } }),
            el("h3", {}, el("span", { class: "post-nav__label" }, label), el("span", { class: "post-nav__title" }, other.title))) : null;
        nav.replaceChildren(...[link(article.newer, labels.previous_post, "previous"), link(article.older, labels.next_post, "next")].filter(Boolean));

        setUpShare(article.title);
    } catch (error) {
        showError(error);
    }
});

// Floating Share button: opens to a LinkedIn share link for this page
function setUpShare(title) {
    const box = document.querySelector("[data-share]");
    const toggle = box.querySelector(".share-button__toggle");
    const link = box.querySelector(".share-button__link");
    link.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(location.href)}`;
    link.title = title;
    toggle.addEventListener("click", () => {
        const open = box.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
    });
    box.hidden = false;
}
