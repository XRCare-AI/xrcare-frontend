import { getSite, siteURL, setting, el } from './site.js';
import { currentUser, showAccount, setUpAccountMenu } from './account.js';

// Every page: fill the header, slide-out menu, footer and any [data-site-*] element from the API settings and menu,
// show Log in / Get Started or the account menu, and run the phone/tablet slide-out menu.
document.addEventListener("DOMContentLoaded", async () => {
    setUpMenu();
    setUpHeaderScroll();
    setUpAccountMenu();
    currentUser().then(showAccount);
    try {
        const { settings, nav } = await getSite();
        fillSettings(settings);
        fillNav(nav);
        // Page titles come from the API: a page with data-title-setting names its setting, others keep their own
        const titleKey = document.body.dataset.titleSetting;
        const title = titleKey ? setting(settings, titleKey) : document.body.dataset.title;
        if (title) setTitle(title, settings.site_title);
    } catch (error) {
        console.log(error);
    }
    document.body.classList.remove("is-loading");
});

// data-site-text="blog.read_more" etc. name a setting by its (dotted) key
function fillSettings(settings) {
    const value = (node, key) => setting(settings, node.dataset[key]);
    document.querySelectorAll("[data-site-text]").forEach(node => {
        // A setting the backend doesn't have yet leaves the element's own (fallback) text in place
        node.textContent = value(node, "siteText") ?? node.textContent;
    });
    document.querySelectorAll("[data-site-placeholder]").forEach(node => {
        node.placeholder = value(node, "sitePlaceholder") ?? "";
    });
    document.querySelectorAll("[data-site-href]").forEach(node => {
        node.href = siteURL(value(node, "siteHref") ?? "#");
    });
    document.querySelectorAll("[data-site-mailto]").forEach(node => {
        node.href = "mailto:" + (value(node, "siteMailto") ?? "");
    });
    document.querySelectorAll("[data-site-src]").forEach(node => {
        node.src = siteURL(value(node, "siteSrc"));
    });
    const root = document.documentElement.style;
    if (settings.footer_background) root.setProperty("--footer-bg-image", `url("${siteURL(settings.footer_background)}")`);
    if (settings.header_background) root.setProperty("--header-bg-image", `url("${siteURL(settings.header_background)}")`);
}

export function setTitle(title, siteTitle) {
    document.title = siteTitle ? `${title} - ${siteTitle}` : title;
}

function fillNav(nav) {
    const here = location.pathname.replace(/index\.html$/, "");
    document.querySelectorAll("[data-nav-list]").forEach(list => {
        list.replaceChildren(...nav.map(link => {
            const href = siteURL(link.url);
            const current = href === here;
            return el("li", { class: current ? "current-menu-item" : null },
                el("a", { href, "aria-current": current ? "page" : null }, link.label));
        }));
    });
}

function setUpMenu() {
    const toggle = document.querySelector(".menu-toggle");
    const panel = document.getElementById("slide-out-menu");
    const backdrop = document.querySelector(".slide-out-bg");
    if (!toggle || !panel) return;

    let opened = false;
    let background = [];
    const desktop = matchMedia("(min-width: 1000px)");
    const focusable = () => [...panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')]
        .filter(node => !node.closest('[hidden]') && node.getClientRects().length);
    const setOpen = (open, restoreFocus = true) => {
        if (open === opened) return;
        opened = open;
        document.body.classList.toggle("menu-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        backdrop.hidden = !open;
        panel.inert = !open;
        if (open) {
            background = [...document.body.children]
                .filter(node => node !== panel && node !== backdrop && !['SCRIPT', 'STYLE'].includes(node.tagName))
                .map(node => [node, node.inert]);
            background.forEach(([node]) => { node.inert = true; });
            panel.querySelector(".slide-out__close").focus();
        } else {
            background.forEach(([node, inert]) => { node.inert = inert; });
            background = [];
            if (restoreFocus) toggle.focus();
        }
    };

    toggle.addEventListener("click", () => setOpen(!opened));
    backdrop.addEventListener("click", () => setOpen(false));
    panel.querySelector(".slide-out__close").addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", event => {
        if (!opened) return;
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        if (event.key === "Tab") {
            const nodes = focusable(), first = nodes[0], last = nodes.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    panel.addEventListener("click", event => { if (event.target.closest("a")) setOpen(false); });
    desktop.addEventListener("change", event => { if (event.matches) setOpen(false, false); });
    addEventListener("pageshow", () => setOpen(false, false));

}

// The transparent header turns to frosted glass once the page scrolls
function setUpHeaderScroll() {
    const header = document.getElementById("header");
    if (!header) return;
    const update = () => header.classList.toggle("is-scrolled", document.scrollingElement.scrollTop > 10);
    addEventListener("scroll", update, { passive: true });
    update();
}
