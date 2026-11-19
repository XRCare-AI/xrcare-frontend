import { articleList } from './articles.js';
import { apiRequest } from './api/config.js';
import { getSite, getPage, siteURL, el, lines, formatDate, showError } from './site.js';
import { setTitle } from './main.js';
import { currentUser, swapGuestLinks } from './account.js';

const assetURL = siteURL;  // images are files in this repo (images/)

// Pages made of sections (Home, About Us, Explore, Contact): <div data-page="about-us"> names the page.
// Each section from _data/pages/<page>.yml (built into the page) is drawn by its `layout` (LAYOUTS below) and fades
// in when scrolled to. Only the Explore articles need the backend.
document.addEventListener("DOMContentLoaded", async () => {
    const holder = document.querySelector("[data-page]");
    if (!holder) return;
    const flow = holder.querySelector("[data-page-sections]");
    try {
        const [page, { settings }] = await Promise.all([getPage(), getSite()]);
        setTitle(page.title, settings.site_title);
        page.sections.forEach(section => {
            const draw = LAYOUTS[section.layout];
            if (draw) flow.append(block(section, draw(section.content, settings)));
        });
        revealOnScroll(flow);
        // The sections arrive after the browser tried to jump to #anchor, so jump now
        const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: "instant" }));
        swapGuestLinks(await currentUser(), settings.account?.my_hub);
    } catch (error) {
        showError(error);
    }
});

function block(section, content) {
    return el("section", { id: section.slug, class: `page-section page-section--${section.layout} theme-${section.theme}` }, content);
}

function revealOnScroll(holder) {
    const sections = holder.querySelectorAll(".page-section");
    if (!("IntersectionObserver" in window)) {
        sections.forEach(s => s.classList.add("has-entered"));
        return;
    }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("has-entered");
        observer.unobserve(entry.target);
    }), { rootMargin: "0px 0px -15% 0px" });
    sections.forEach(s => observer.observe(s));
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const icon = cls => el("i", { class: cls || "fa-solid fa-circle", "aria-hidden": "true" });
const pad = n => String(n).padStart(2, "0");
// Delay for the n-th item fading in
const stagger = (i, step = 120) => ({ "--delay": `${i * step}ms` });

// A link using the shared OCS button grammar.
function action(link, ghost) {
    if (!link) return null;
    return el("a", { class: `ocs__btn pill${ghost ? " accent" : " accent fill"}`, href: siteURL(link.url) },
        link.label, ghost ? null : icon("fa-solid fa-arrow-right"));
}

// Heading lines with the `highlight` words in the accent gradient
function highlighted(heading, highlight) {
    const parts = Array.isArray(heading) ? heading : [heading ?? ""];
    return parts.flatMap((line, i) => {
        const at = highlight ? line.indexOf(highlight) : -1;
        const pieces = at < 0 ? [line]
            : [line.slice(0, at), el("span", { class: "gradient-text" }, highlight), line.slice(at + highlight.length)];
        return i ? [" ", el("br"), ...pieces] : pieces;   // the space keeps words apart if the <br> is hidden
    });
}

// The animated co-pilot graphic: data from each input flows along a beam into the core
function copilotGraphic(c) {
    const ns = "http://www.w3.org/2000/svg";
    const inputs = c.inputs || [];
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "copilot__beams");
    svg.setAttribute("aria-hidden", "true");
    const nodes = inputs.map((input, i) => {
        const angle = (-135 + i * (360 / inputs.length)) * Math.PI / 180;
        const x = 50 + 41 * Math.cos(angle), y = 50 + 41 * Math.sin(angle);
        ["copilot__beam", "copilot__packet"].forEach(cls => {
            const line = document.createElementNS(ns, "line");
            Object.entries({ x1: x, y1: y, x2: 50, y2: 50, class: cls, style: `animation-delay:${i * -0.6}s` })
                .forEach(([k, v]) => line.setAttribute(k, v));
            svg.append(line);
        });
        return el("div", { class: "copilot__node", style: { left: x + "%", top: y + "%" } },
            el("span", { class: "copilot__node-icon" }, icon(input.icon)), el("span", { class: "copilot__node-label" }, input.label));
    });
    return el("div", { class: "copilot", role: "img", "aria-label": `${c.core_label}: ${inputs.map(i => i.label).join(", ")}` },
        el("div", { class: "copilot__ring copilot__ring--outer" }),
        el("div", { class: "copilot__ring copilot__ring--middle" }, el("span", { class: "copilot__satellite" })),
        el("div", { class: "copilot__ring copilot__ring--inner" }),
        svg,
        el("div", { class: "copilot__core" },
            el("span", { class: "copilot__pulse" }), el("span", { class: "copilot__pulse copilot__pulse--late" }),
            el("span", { class: "copilot__core-mark" }, "AI"),
            el("span", { class: "copilot__core-label" }, c.core_label)),
        ...nodes);
}

// Capability explorer: icons on a ring with the chosen one's description beside them. Once the explorer is scrolled
// into view, a line draws itself around the active icon; when it closes, the next capability is shown. Clicking an
// icon shows that one and stops the timer for good; hovering pauses it.
function capabilityExplorer(c) {
    return el("div", { class: "capabilities__grid ocs__grid ocs__grid--card cols-3" }, ...(c.items || []).map((item, i) =>
        el("article", { class: "capability-card ocs__grid-cell" },
            item.image ? el("img", { class: "capability-card__image", src: assetURL(item.image), alt: item.image_alt || "", loading: "lazy" }) : null,
            el("span", { class: "capability-card__icon", "aria-hidden": "true" }, icon(item.icon)),
            el("span", { class: "capability-card__number", "aria-hidden": "true" }, pad(i + 1)),
            el("h3", {}, item.title),
            el("p", {}, item.text))));
}

// Sticky row of links to the sections below; the one in view is highlighted
function subnav(c) {
    const links = (c.links || []).map(link => el("a", { class: "ocs__btn pill subnav__link", href: siteURL(link.url) },
        link.icon ? icon(link.icon) : null, link.label));
    requestAnimationFrame(() => {
        const targets = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
        const observer = new IntersectionObserver(entries => entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            links.forEach(a => a.classList.toggle("is-current", a.hash === "#" + entry.target.id));
        }), { rootMargin: "-45% 0px -50% 0px" });
        targets.forEach(t => observer.observe(t));
    });
    return el("nav", { class: "subnav", "aria-label": "On this page" }, el("div", { class: "container subnav__inner" }, ...links));
}

const LAYOUTS = {
    // Product-first introduction: make the wearable and the bedside workflow visible immediately.
    product(c) {
        return el("div", { class: "container product-intro" },
            el("div", { class: "product-intro__copy reveal" },
                el("span", { class: "product-intro__eyebrow" }, c.eyebrow),
                el("h2", { class: "product-intro__heading" }, c.heading),
                el("p", { class: "product-intro__text" }, c.text),
                el("div", { class: "product-intro__steps" }, ...(c.steps || []).map((step, i) =>
                    el("article", { class: "product-step", style: stagger(i, 90) },
                        el("span", { class: "product-step__number" }, `0${i + 1}`),
                        el("div", {}, el("h3", { class: "product-step__title" }, step.title),
                            el("p", { class: "product-step__text" }, step.text))))),
                el("p", { class: "product-intro__note" }, icon("fa-solid fa-shield-halved"), c.note),
                el("a", { class: "product-intro__link", href: c.link.url, target: "_blank", rel: "noreferrer" },
                    c.link.label, icon("fa-solid fa-arrow-up-right-from-square"))),
            el("figure", { class: "product-intro__visual reveal", style: stagger(1) },
                el("img", { src: assetURL(c.image), alt: c.image_alt, loading: "eager" }),
                el("figcaption", {}, "Smart glasses + spatial AI workflow")));
    },

    // Home intro over the photo reel: the name and slogan on the left, see-through buttons to the main pages on the right
    spotlight(c) {
        const video = c.video ? el("video", { class: "spotlight__video", src: assetURL(c.video.src),
            poster: c.video.poster ? assetURL(c.video.poster) : null, muted: "", loop: "", playsinline: "",
            autoplay: reducedMotion ? null : "", preload: "auto", "aria-hidden": "true" }) : null;
        if (video) video.muted = true;   // the attribute alone does not let every browser autoplay
        return el("div", { class: "spotlight" },
            el("div", { class: "spotlight__backdrop", "aria-hidden": "true" },
                video, el("div", { class: "spotlight__tint" }), el("div", { class: "spotlight__shade" })),
            el("div", { class: "container spotlight__inner" },
                el("div", { class: "spotlight__copy" },
                    el("h1", { class: "spotlight__title reveal" }, c.title),
                    el("p", { class: "spotlight__slogan reveal", style: stagger(1) }, ...highlighted(c.slogan, c.highlight)),
                    c.badge ? el("img", { class: "spotlight__badge reveal", style: stagger(2), src: assetURL(c.badge.image), alt: c.badge.alt || "" }) : null),
                el("nav", { class: "ocs__links ocs__links--wide spotlight__links", "aria-label": "Start here" }, ...(c.links || []).map((link, i) =>
                    el("a", { class: "ocs__btn accent fill large hero-link reveal", href: siteURL(link.url), style: stagger(i + 1) },
                        el("span", { class: "hero-link__icon" }, icon(link.icon)),
                        el("span", { class: "hero-link__label" }, link.label),
                        icon("fa-solid fa-arrow-right hero-link__arrow"))))),
            el("a", { class: "spotlight__scroll", href: "#co-pilot", "aria-label": "Scroll down" }, el("span")));
    },

    // The animated co-pilot graphic beside a paragraph about it (paragraph may hold <strong>)
    copilot(c) {
        return el("div", { class: "container copilot-section" },
            el("div", { class: "copilot-section__visual reveal" }, copilotGraphic(c)),
            el("p", { class: "copilot-section__text reveal", style: stagger(1), html: c.text }));
    },

    capabilities(c) {
        return el("div", { class: "container capabilities" },
            el("header", { class: "section-head section-head--center reveal" },
                el("h2", { class: "section-head__heading" }, ...lines(c.heading))),
            el("div", { class: "reveal", style: stagger(1) }, capabilityExplorer(c)));
    },

    // Three cards lit one after another. On each card a line starts at the middle of its left edge and runs to the
    // right both over the top and under the bottom, meeting at the right edge; a short line then crosses the gap
    // to the next card. It starts once most of the cards are on screen, not when the section first peeks in.
    pillars(c) {
        const grid = el("div", { class: "pillars__grid ocs__grid ocs__grid--card cols-3" }, ...(c.items || []).map((item, i) => {
            return el("article", { class: "pillar ocs__grid-cell", style: stagger(i, 120) },
                el("div", { class: "pillar__top" },
                    el("span", { class: "pillar__icon" }, icon(item.icon)),
                    el("span", { class: "pillar__number", "aria-hidden": "true" }, pad(i + 1))),
                el("h3", { class: "pillar__title" }, item.title),
                el("p", { class: "pillar__text" }, item.text));
        }));
        return el("div", { class: "container pillars" },
            el("header", { class: "section-head section-head--center reveal" },
                el("h2", { class: "section-head__heading" },
                    c.heading_accent ? el("span", { class: "gradient-text" }, c.heading_accent) : null,
                    c.heading_accent ? el("br") : null, c.heading)),
            grid);
    },

    audiences(c) {
        return el("div", { class: "container audiences" },
            el("header", { class: "section-head reveal" },
                el("h2", { class: "section-head__heading" }, ...lines(c.heading))),
            el("div", { class: "audiences__grid ocs__grid ocs__grid--card cols-3" }, ...(c.items || []).map((item, i) =>
                el("a", { class: "audience ocs__grid-cell reveal", style: stagger(i + 1, 150), href: siteURL(item.url) },
                    el("span", { class: "audience__icon" }, icon(item.icon)),
                    el("h3", { class: "audience__title" }, item.title),
                    el("p", { class: "audience__text" }, item.text),
                    el("span", { class: "audience__link" }, c.link_label || "Explore", icon("fa-solid fa-arrow-right"))))));
    },

    // Guided course-style cards inspired by the CS Pathway; each step links to existing XRCare content.
    pathway(c) {
        const steps = el("ol", { class: "pathway__steps ocs__grid ocs__grid--card cols-4", "aria-label": c.heading || "Learning path" },
            ...(c.steps || []).map((step, i) => el("li", { class: `pathway-card ocs__grid-cell${i === 0 ? " ocs__grid-cell--accent" : ""}`,
                style: stagger(i, 110) },
                el("a", { class: "pathway-card__link", href: siteURL(step.url) },
                    el("span", { class: "pathway-card__top" },
                        el("span", { class: "pathway-card__number" }, step.number || pad(i + 1)),
                        el("span", { class: "pathway-card__label" }, step.label || "Next step")),
                    el("span", { class: "pathway-card__icon", "aria-hidden": "true" }, icon(step.icon)),
                    el("span", { class: "pathway-card__title" }, step.title),
                    el("span", { class: "pathway-card__text" }, step.text),
                    el("span", { class: "pathway-card__action" }, step.action || "Explore", icon("fa-solid fa-arrow-right"))))));
        return el("div", { class: "container pathway ocs__container" },
            el("header", { class: "section-head reveal" },
                c.eyebrow ? el("p", { class: "pathway__eyebrow" }, c.eyebrow) : null,
                el("h2", { class: "section-head__heading" }, c.heading),
                c.text ? el("p", { class: "section-head__text" }, c.text) : null),
            el("div", { class: "reveal", style: stagger(1) }, steps));
    },

    cta(c) {
        return el("div", { class: "container" },
            el("div", { class: "cta reveal" },
                el("div", { class: "cta__aurora", "aria-hidden": "true" }),
                el("h2", { class: "cta__heading" }, ...lines(c.heading)),
                c.text ? el("p", { class: "cta__text" }, c.text) : null,
                el("div", { class: "cta__actions" }, action(c.primary), action(c.secondary, true))));
    },

    // Top of a page (Explore, Contact): big title and a line of text over a soft glow
    pagehead(c) {
        return el("div", { class: "pagehead" },
            el("div", { class: "pagehead__glow", "aria-hidden": "true" }),
            el("div", { class: "container" },
                el("h1", { class: "pagehead__title reveal" }, ...highlighted(c.title, c.highlight)),
                c.text ? el("p", { class: "pagehead__text reveal", style: stagger(1) }, c.text) : null));
    },

    subnav,

    // One audience on the Explore hub: photo beside the heading, text and button, then its features
    audience(c) {
        return el("div", { class: `container audience-block${c.reverse ? " audience-block--reverse" : ""}` },
            el("div", { class: "audience-block__main" },
                c.image ? el("div", { class: "audience-block__media reveal" }, el("img", { src: assetURL(c.image), alt: "", loading: "lazy" })) : null,
                el("div", { class: "audience-block__body" },
                    el("h2", { class: "audience-block__heading reveal" }, c.heading),
                    el("p", { class: "audience-block__text reveal", style: stagger(1) }, c.text),
                    c.cta ? el("div", { class: "reveal", style: stagger(2) }, action(c.cta, true)) : null)),
            c.features?.length ? el("div", { class: "audience-block__features ocs__grid ocs__grid--card cols-3" }, ...c.features.map((f, i) =>
                el("div", { class: "mini-card ocs__grid-cell reveal", style: stagger(i + 1, 120) },
                    el("span", { class: "mini-card__icon" }, icon(f.icon)),
                    el("h3", { class: "mini-card__title" }, f.title),
                    el("p", { class: "mini-card__text" }, f.text)))) : null);
    },

    articles(c) {
        return el("div", { class: "container" },
            el("header", { class: "section-head reveal" },
                el("h2", { class: "section-head__heading" }, c.heading),
                c.text ? el("p", { class: "section-head__text" }, c.text) : null),
            el("div", { class: "reveal", style: stagger(1) }, articleList(c)));
    },

    // About Us intro: heading and text, Vision/Mission cards, and the founder's quote
    about(c) {
        return el("div", { class: "container about-intro" },
            el("div", { class: "pagehead__glow", "aria-hidden": "true" }),
            el("div", { class: "about-intro__head" },
                el("h1", { class: "pagehead__title reveal" }, ...highlighted(c.heading, c.highlight)),
                el("p", { class: "pagehead__text reveal", style: stagger(1) }, c.text)),
            el("div", { class: "about-intro__grid" },
                ...(c.columns || []).map((col, i) => el("div", { class: "mini-card reveal", style: stagger(i + 1, 150) },
                    col.icon ? el("span", { class: "mini-card__icon" }, icon(col.icon)) : null,
                    el("h3", { class: "mini-card__title" }, col.title),
                    el("p", { class: "mini-card__text" }, col.text))),
                c.quote ? el("figure", { class: "quote-card reveal", style: stagger(3, 150) },
                    el("img", { class: "quote-card__image", src: assetURL(c.quote.image), alt: "" }),
                    el("blockquote", { class: "quote-card__text", html: c.quote.text }),
                    el("figcaption", { class: "quote-card__by" }, el("strong", {}, c.quote.author), c.quote.role ? el("span", {}, c.quote.role) : null)) : null));
    },

    // Team: a card per person; the bio opens below the card's name
    team(c) {
        return el("div", { class: "container team-grid" }, ...(c.groups || []).map(group =>
            el("div", { class: "team-grid__group" },
                el("h2", { class: "section-head__heading reveal" }, group.heading),
                el("div", { class: "team-grid__members ocs__grid ocs__grid--card cols-3" }, ...group.members.map((m, i) => {
                    const bio = el("div", { class: "member-card__bio", hidden: "" }, ...(m.bio || []).map(html => el("p", { html })));
                    const toggle = el("button", { type: "button", class: "ocs__btn pill small member-card__toggle", "aria-expanded": "false" },
                        el("span", {}, c.read_bio || "Read bio"), icon("fa-solid fa-chevron-down"));
                    toggle.addEventListener("click", () => {
                        const open = bio.hidden;
                        bio.hidden = !open;
                        toggle.setAttribute("aria-expanded", String(open));
                        toggle.querySelector("span").textContent = open ? (c.hide_bio || "Hide bio") : (c.read_bio || "Read bio");
                    });
                    return el("article", { class: "member-card ocs__grid-cell reveal", style: stagger(i, 100) },
                        el("div", { class: "member-card__head" },
                            el("img", { class: "member-card__image", src: assetURL(m.image), alt: "", loading: "lazy" }),
                            el("div", {},
                                el("h3", { class: "member-card__name", html: m.name }),
                                el("p", { class: "member-card__role", html: m.title }))),
                        toggle, bio);
                })))));
    },
};
