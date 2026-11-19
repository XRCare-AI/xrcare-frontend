// Site preferences on every page: theme colors, font, text size, button style, selection color, language (Google
// Translate) and text-to-speech. Same job as Open Coding Society's assets/js/user-preferences.js.
//
// A plain (non-module) script loaded in <head> right after main.css, so the user's look is in place before the page
// first paints. The preferences themselves live on the backend (GET /api/id -> user.preferences, saved by the
// Preferences page with PUT /api/user/preferences); this script keeps the logged-in user's copy in localStorage only
// so the next page can paint with it straight away, and js/main.js corrects that copy once the backend answers.
//
// How a theme is painted: the stylesheet is built from a few colors (navy background, white text, cyan accent).
// apply() copies main.css into a <style> with the user's colors (and font) in place of those, and switches the
// original off, so every rule keeps its place in the cascade. With the site's own look nothing is copied and
// main.css is used as is, so the default look is exactly as designed.
//
// Public API: window.XRCareTheme = { DEFAULTS, PRESETS, FONTS, BUTTON_STYLES, LANGUAGES, apply, sync, cached,
//   clear, applyLanguage, contrast, readableOn, speak, stopSpeaking, voices }
(function () {
    "use strict";

    const STORAGE_KEY = "xrcare-preferences";
    const BASE_SIZE = 17;   // the site's body text size in px

    // Keep these lists in step with the backend's model/preferences.py
    const DEFAULTS = {
        theme: "Site Default",
        bg: "#050a18", text: "#ffffff", accent: "#17ddfc", selectionColor: "#17ddfc",
        font: "site", size: BASE_SIZE, buttonStyle: "default",
        language: "",
        ttsVoice: "", ttsRate: 1, ttsPitch: 1, ttsVolume: 1,
        headTracking: { enabled: false, sensitivity: 0.45, calibration: null },
        customThemes: {},
    };

    const FONTS = {
        "site": { label: "Site default (Montserrat)", stack: null },
        "inter": { label: "Inter / System", stack: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", google: "Inter:wght@400;500;600;700" },
        "roboto": { label: "Roboto", stack: "Roboto, system-ui, 'Segoe UI', Arial, sans-serif", google: "Roboto:wght@400;500;700" },
        "open-sans": { label: "Open Sans", stack: "'Open Sans', Arial, sans-serif" },
        "lato": { label: "Lato", stack: "Lato, Arial, sans-serif", google: "Lato:wght@400;700" },
        "montserrat": { label: "Montserrat (everywhere)", stack: "Montserrat, Arial, sans-serif" },
        "atkinson": { label: "Atkinson Hyperlegible (easy to read)", stack: "'Atkinson Hyperlegible', Arial, sans-serif", google: "Atkinson+Hyperlegible:wght@400;700" },
        "georgia": { label: "Georgia (Serif)", stack: "Georgia, 'Times New Roman', Times, serif" },
        "source-code-pro": { label: "Source Code Pro", stack: "'Source Code Pro', monospace", google: "Source+Code+Pro:wght@400;600" },
    };

    const BUTTON_STYLES = { "default": "Default", "rounded-all": "Rounded", "square": "Square", "pill": "Pill" };
    const BUTTON_RADIUS = { "rounded-all": "8px", "square": "0", "pill": "999px" };

    const LANGUAGES = {
        "": "Default (English, no translation)",
        "es": "Spanish (Español)", "fr": "French (Français)", "de": "German (Deutsch)", "it": "Italian (Italiano)",
        "pt": "Portuguese (Português)", "ru": "Russian (Русский)", "zh-CN": "Chinese Simplified (简体中文)",
        "zh-TW": "Chinese Traditional (繁體中文)", "ja": "Japanese (日本語)", "ko": "Korean (한국어)",
        "ar": "Arabic (العربية)", "hi": "Hindi (हिन्दी)", "vi": "Vietnamese (Tiếng Việt)", "th": "Thai (ไทย)",
        "nl": "Dutch (Nederlands)", "pl": "Polish (Polski)", "tr": "Turkish (Türkçe)", "uk": "Ukrainian (Українська)",
        "he": "Hebrew (עברית)", "fa": "Persian (فارسی)", "tl": "Tagalog (Filipino)",
    };

    // Ready-made looks (Open Coding Society's presets, plus High Contrast)
    const look = (bg, text, accent, font = "site", extra = {}) => ({ bg, text, accent, selectionColor: accent, font, size: BASE_SIZE, buttonStyle: "default", ...extra });
    const PRESETS = {
        "Site Default": look(DEFAULTS.bg, DEFAULTS.text, DEFAULTS.accent),
        "Midnight": look("#0b1220", "#e6eef8", "#3b82f6", "inter"),
        "Light": look("#ffffff", "#0f172a", "#2563eb", "inter"),
        "Green": look("#154734", "#e6f6ef", "#10b981", "inter"),
        "Sepia": look("#f4ecd8", "#3b2f2f", "#b45309", "georgia"),
        "Cyberpunk": look("#0a0a0f", "#f0f0f0", "#f72585", "source-code-pro"),
        "Ocean": look("#0c1929", "#e0f2fe", "#06b6d4", "open-sans"),
        "Sunset": look("#2a1433", "#fbe7d4", "#ff7f6b", "inter"),
        "High Contrast": look("#000000", "#ffffff", "#ffd400", "atkinson", { size: 19, buttonStyle: "square" }),
    };

    // ---------------------------------------------------------------------------------------------------------
    // Color math
    // ---------------------------------------------------------------------------------------------------------
    const hexToRgb = hex => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
    const channel = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    const contrast = (a, b) => {
        const [hi, lo] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };
    const readableOn = color => (contrast(color, "#ffffff") >= contrast(color, "#111111") ? "#ffffff" : "#111111");
    const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

    function rgbToHsl({ r, g, b }) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
        if (max === min) return { h: 0, s: 0, l };
        const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return { h: h * 60, s, l };
    }
    function hslToRgb({ h, s, l }) {
        h = ((h % 360) + 360) % 360 / 360;
        if (!s) return { r: l * 255, g: l * 255, b: l * 255 };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
        return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
    }
    const css = ({ r, g, b }, a = 1) => a >= 1 ? `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
        : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

    // The site's accent family (cyan accent, hero cyan, footer cyan, gradient blue, gradient violet): each maps to
    // the user's accent turned by the same hue offset, so gradients keep their shape in the new colors
    const ACCENTS = ["#17ddfc", "#00ccff", "#54c8e8", "#4fa3ff", "#7b61ff"].map(hex => ({ rgb: hexToRgb(hex), hsl: rgbToHsl(hexToRgb(hex)) }));
    const SITE_INK = luminance(hexToRgb(DEFAULTS.bg));

    // One color of the stylesheet -> the user's version of it
    function makeColorMapper(prefs) {
        const bg = hexToRgb(prefs.bg), text = hexToRgb(prefs.text), accent = hexToRgb(prefs.accent);
        const accentHsl = rgbToHsl(accent), baseHsl = ACCENTS[0].hsl;
        return (r, g, b, a) => {
            const color = { r, g, b };
            if (r === 0 && g === 0 && b === 0) return null;                          // black shadows stay
            if (r >= 245 && g >= 245 && b >= 245) return css(text, a);                // white text and see-through panels
            const near = ACCENTS.find(x => Math.abs(x.rgb.r - r) + Math.abs(x.rgb.g - g) + Math.abs(x.rgb.b - b) < 40);
            if (near) {
                if (near === ACCENTS[0]) return css(accent, a);
                return css(hslToRgb({ h: accentHsl.h + (near.hsl.h - baseHsl.h) * 0.5, s: accentHsl.s, l: accentHsl.l }), a);
            }
            const lum = luminance(color);
            if (lum < 0.045) {
                // The navy family (page, cards, header): the user's background, lifted toward the text color
                // by as much as the original was lighter than the page
                const lift = Math.min(0.3, Math.max(0, (Math.sqrt(lum) - Math.sqrt(SITE_INK)) * 1.6));
                return css(mix(bg, text, lift), a);
            }
            return null;   // other colors (status reds/greens, photos' tints) stay
        };
    }

    // ---------------------------------------------------------------------------------------------------------
    // Painting the page
    // ---------------------------------------------------------------------------------------------------------
    const STYLE_ID = "xrcare-theme";
    const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

    // The site's own stylesheets (main.css). Cross-site ones (Font Awesome, Google Fonts) can't be read and don't
    // use the site's colors.
    function siteSheets() {
        return [...document.styleSheets].filter(sheet => {
            if (sheet.ownerNode?.id === STYLE_ID) return false;
            try { return Boolean(sheet.cssRules); } catch { return false; }
        });
    }

    // A full copy of the site's stylesheets with the user's colors and font swapped in. The copy replaces the
    // originals (which are switched off), so every rule keeps its place in the cascade.
    const COLOR = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/g;
    function themedCSS(prefs, sheets) {
        const mapColor = same(prefs.bg, DEFAULTS.bg) && same(prefs.text, DEFAULTS.text) && same(prefs.accent, DEFAULTS.accent)
            ? null : makeColorMapper(prefs);
        const fontStack = FONTS[prefs.font]?.stack;
        if (!mapColor && !fontStack) return "";

        const rewrite = text => {
            if (mapColor) {
                text = text.replace(COLOR, (match, r, g, b, a) => {
                    const alpha = a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : +a;
                    return mapColor(+r, +g, +b, alpha) || match;
                });
            }
            if (fontStack) {
                text = text.replace(/font-family:([^;}]+)/g, (match, value) => /awesome|icon/i.test(value) ? match : `font-family: ${fontStack}`);
            }
            return text;
        };

        const out = sheets.flatMap(sheet => [...sheet.cssRules].map(rule => rewrite(rule.cssText)));
        if (mapColor) {
            // The page behind everything, and the browser's own form controls and scrollbars
            const light = luminance(hexToRgb(prefs.bg)) > 0.4;
            out.push(`html, body { background-color: ${prefs.bg}; color-scheme: ${light ? "light" : "dark"}; }`);
            // The logos are white artwork: on a light page turn them dark (the hue turn keeps the cyan mark cyan)
            if (light) out.push(`.site-header__logo img, .site-footer__logo img, .spotlight__badge { filter: invert(1) hue-rotate(180deg); }`);
        }
        return out.join("\n");
    }

    function loadGoogleFont(font) {
        const family = FONTS[font]?.google;
        if (!family || document.querySelector(`link[data-font="${font}"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.dataset.font = font;
        link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
        document.head.append(link);
    }

    let applied = null;   // JSON of the look on the page now, so re-applying the same look does nothing

    // Put prefs on the page (null = the site as designed). Language is applied separately (applyLanguage).
    function apply(prefs) {
        prefs = { ...DEFAULTS, ...(prefs || {}) };
        const key = JSON.stringify([prefs.bg, prefs.text, prefs.accent, prefs.selectionColor, prefs.font, prefs.size, prefs.buttonStyle]);
        if (key === applied) return;
        applied = key;

        const root = document.documentElement;
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
        }
        loadGoogleFont(prefs.font);

        const extra = [];
        if (!same(prefs.selectionColor, DEFAULTS.selectionColor) || !same(prefs.bg, DEFAULTS.bg)) {
            extra.push(`::selection { background: ${prefs.selectionColor}; color: ${readableOn(prefs.selectionColor)}; }`);
        }
        const radius = BUTTON_RADIUS[prefs.buttonStyle];
        if (radius) extra.push(`.pill-button, .hub-recommend__link, .chatbot__send, button[type="submit"] { border-radius: ${radius} !important; }`);

        const sheets = siteSheets();
        const themed = themedCSS(prefs, sheets);
        style.textContent = [themed, ...extra].join("\n");
        // Last in <head>, after main.css; with a themed copy in place the original is switched off
        document.head.append(style);
        sheets.forEach(sheet => { sheet.disabled = Boolean(themed); });

        // Text size: the stylesheet is in px, so the whole page is scaled (like the browser's zoom) from 17px
        const scale = Number(prefs.size) / BASE_SIZE;
        root.style.zoom = scale && scale !== 1 ? String(Math.round(scale * 1000) / 1000) : "";
        root.classList.toggle("has-user-theme", Boolean(style.textContent) || root.style.zoom !== "");
    }

    // ---------------------------------------------------------------------------------------------------------
    // Language: Google Translate (same approach as Open Coding Society)
    // ---------------------------------------------------------------------------------------------------------
    function setTranslateCookie(code) {
        const host = location.hostname;
        const expires = code ? "" : "; expires=Thu, 01 Jan 1970 00:00:00 UTC";
        const value = code ? `/en/${code}` : "";
        [`; path=/`, `; path=/; domain=${host}`, `; path=/; domain=.${host}`].forEach(scope => {
            document.cookie = `googtrans=${value}${expires}${scope}`;
        });
    }
    const translatedTo = () => (document.cookie.match(/(?:^|;\s*)googtrans=\/en\/([^;]+)/) || [])[1] || "";

    function loadTranslator() {
        if (document.getElementById("google-translate-script")) return;
        const holder = document.createElement("div");
        holder.id = "google_translate_element";
        holder.hidden = true;
        document.body.append(holder);
        window.xrcareTranslateInit = () => {
            new window.google.translate.TranslateElement({ pageLanguage: "en", autoDisplay: false }, "google_translate_element");
        };
        const script = document.createElement("script");
        script.id = "google-translate-script";
        script.src = "https://translate.google.com/translate_a/element.js?cb=xrcareTranslateInit";
        document.body.append(script);
    }

    // Translate the page to code ("" = English). Going back to English (or to another language from a translated
    // page) needs a reload, because Google Translate rewrites the page's text in place.
    function applyLanguage(code) {
        code = LANGUAGES[code] !== undefined ? code : "";
        const current = translatedTo();
        if (code === current) {
            if (code) loadTranslator();
            return;
        }
        setTranslateCookie(code);
        if (current || document.documentElement.classList.contains("translated-ltr") || document.documentElement.classList.contains("translated-rtl")) {
            location.reload();
            return;
        }
        if (code) loadTranslator();
    }

    // ---------------------------------------------------------------------------------------------------------
    // Text-to-speech (the browser's own voices)
    // ---------------------------------------------------------------------------------------------------------
    const canSpeak = "speechSynthesis" in window;
    function voices() { return canSpeak ? speechSynthesis.getVoices() : []; }
    function speak(text, options) {
        if (!canSpeak || !text) return false;
        const prefs = { ...DEFAULTS, ...(cached() || {}), ...(options || {}) };
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = voices().find(v => v.name === prefs.ttsVoice);
        if (voice) utterance.voice = voice;
        utterance.rate = prefs.ttsRate;
        utterance.pitch = prefs.ttsPitch;
        utterance.volume = prefs.ttsVolume;
        speechSynthesis.speak(utterance);
        return true;
    }
    function stopSpeaking() { if (canSpeak) speechSynthesis.cancel(); }

    // Alt+Shift+S reads the selected text aloud (or stops reading)
    document.addEventListener("keydown", event => {
        if (!(event.altKey && event.shiftKey && event.code === "KeyS")) return;
        event.preventDefault();
        if (canSpeak && speechSynthesis.speaking) { stopSpeaking(); return; }
        speak(String(getSelection() || "").trim() || document.querySelector("main h1, main h2")?.textContent?.trim());
    });

    // ---------------------------------------------------------------------------------------------------------
    // The logged-in user's copy (backend is the source; this only paints the next page early)
    // ---------------------------------------------------------------------------------------------------------
    function cached() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
    }
    function remember(prefs) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* storage blocked: still applied */ }
    }
    function forget() {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing kept */ }
    }

    // The backend's answer for this user (null when logged out): keep a copy and paint the page with it
    function sync(prefs) {
        if (prefs) remember(prefs); else forget();
        apply(prefs);
        applyLanguage(prefs?.language || "");
        document.dispatchEvent(new CustomEvent("xrcare:preferences", { detail: prefs }));
    }

    // Logging out: drop this browser's copy and the translation cookie (the next page loads as designed)
    function clear() {
        forget();
        setTranslateCookie("");
    }

    window.XRCareTheme = {
        DEFAULTS, PRESETS, FONTS, BUTTON_STYLES, LANGUAGES, BASE_SIZE,
        apply, sync, cached, clear, applyLanguage, contrast, readableOn, speak, stopSpeaking, voices, canSpeak,
    };

    // Paint the last known look now, before the page shows; the language waits for <body>
    const saved = cached();
    if (saved) {
        apply(saved);
        if (saved.language) {
            if (document.body) applyLanguage(saved.language);
            else document.addEventListener("DOMContentLoaded", () => applyLanguage(saved.language));
        }
    }
})();
