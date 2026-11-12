// Site content is built into each page from the frontend's _data/ folder (see _layouts/default.html), so it
// needs no backend: <script id="site-data"> holds {settings, nav}; <script id="page-data"> the page's sections.
const readData = id => JSON.parse(document.getElementById(id)?.textContent || "null");

// Settings and menu for every page: {settings, nav}
let siteData;
export function getSite() {
    siteData ??= readData("site-data") || { settings: {}, nav: [] };
    return Promise.resolve(siteData);
}

// This page's sections: {title, sections}
export function getPage() {
    const page = readData("page-data");
    return page ? Promise.resolve(page) : Promise.reject(new Error("This page has no content."));
}

// Site paths ("/about-us/", "/images/logo.png") with the Jekyll baseurl in front;
// full URLs, mailto:/tel: links and #anchors are unchanged
const baseurl = document.querySelector('meta[name="baseurl"]')?.content || "";
export function siteURL(url) {
    return url && url.startsWith('/') && !url.startsWith('//') ? baseurl + url : url;
}

// A value from the settings by dotted path: setting(settings, "blog.read_more")
export function setting(settings, path) {
    return path.split(".").reduce((value, key) => value?.[key], settings);
}

// Small element builder: el("h2", {class: "x"}, "text", child...)
export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "style") {
            // CSS custom properties ("--delay") need setProperty; the rest can be assigned directly
            for (const [prop, v] of Object.entries(value)) {
                if (prop.startsWith("--")) node.style.setProperty(prop, v);
                else node.style[prop] = v;
            }
        }
        else if (key === "html") node.append(safeHTML(value));
        else node.setAttribute(key, value);
    }
    node.append(...children.flat().filter(c => c != null));
    return node;
}

// Text with line breaks where the API gives a list of lines: ["Improve", "Efficiency"]
export function lines(value) {
    const parts = Array.isArray(value) ? value : [value ?? ""];
    return parts.flatMap((line, i) => (i ? [document.createElement("br"), line] : [line]));
}

// HTML from the API (bios, articles) with only simple formatting kept: any other element is
// replaced by its text, and every attribute except a safe link href is dropped
const ALLOWED = new Set(["P", "H2", "H3", "H4", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "BR", "A", "SUP", "SUB"]);
export function safeHTML(html) {
    const template = document.createElement("template");
    template.innerHTML = html ?? "";
    const clean = node => {
        [...node.childNodes].forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) return;
            if (child.nodeType !== Node.ELEMENT_NODE || !ALLOWED.has(child.tagName)) {
                if (child.nodeType === Node.ELEMENT_NODE && !["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(child.tagName)) {
                    clean(child);
                    child.replaceWith(...child.childNodes);
                } else {
                    child.remove();
                }
                return;
            }
            const href = child.tagName === "A" ? child.getAttribute("href") : null;
            [...child.attributes].forEach(a => child.removeAttribute(a.name));
            if (href && /^(https?:|mailto:|tel:|\/|#)/i.test(href.trim())) {
                child.setAttribute("href", siteURL(href.trim()));
                if (/^https?:/i.test(href.trim())) child.setAttribute("rel", "noopener");
            }
            clean(child);
        });
    };
    clean(template.content);
    return template.content;
}

// "2025-09-28" -> {month: "Sep", day: "28", long: "September 28, 2025"} (dates are calendar days, no time zone)
export function formatDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const opts = { timeZone: "UTC" };
    return {
        month: date.toLocaleString("en-US", { ...opts, month: "short" }),
        day: String(d).padStart(2, "0"),
        long: date.toLocaleString("en-US", { ...opts, month: "long", day: "numeric", year: "numeric" }),
    };
}

// Show a problem loading content in the page's .load-error box
export function showError(error) {
    const box = document.querySelector(".load-error");
    if (!box) return;
    box.textContent = error.message;
    box.hidden = false;
}
