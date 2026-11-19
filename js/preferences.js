import { apiRequest } from './api/config.js';
import { siteURL, el } from './site.js';
import { currentUser } from './account.js';

// Preferences page (/account/preferences/): same layout and flow as Open Coding Society's dashboard Preferences tab.
// The form holds a draft; presets, saved themes and AI themes only fill the form and the live preview. "Save" sends
// every field to PUT /api/user/preferences (the backend checks it) and js/theme.js then applies it to the site.
// Adding or deleting one of "My themes" saves that list straight away, like Open Coding Society.
const Theme = window.XRCareTheme;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const LOOK = ["bg", "text", "accent", "selectionColor", "font", "size", "buttonStyle"];
const AI_SUGGESTIONS = ["calm ocean", "warm and cozy", "forest at dawn", "high contrast"];

document.addEventListener("DOMContentLoaded", async () => {
    const user = await currentUser();
    if (!user) {
        location.replace(siteURL("/login/") + "?next=" + encodeURIComponent(location.pathname));
        return;
    }
    const page = $("[data-preferences]");
    const form = $("[data-prefs-form]");
    const status = $("[data-save-status]");
    let saved = { ...Theme.DEFAULTS, ...(user.preferences || {}) };
    let themeName = saved.theme;
    let calibration = saved.headTracking?.calibration || null;
    let tracking = null;          // js/head-tracking.js once loaded

    const say = (node, text, isError = false) => {
        node.textContent = text || "";
        node.classList.toggle("is-error", Boolean(isError));
    };

    // ---------- Choices in the selects ----------
    const options = (select, entries) => select.replaceChildren(...entries.map(([value, label]) => el("option", { value }, label)));
    options($("[data-font-options]"), Object.entries(Theme.FONTS).map(([id, f]) => [id, f.label]));
    options($("[data-button-options]"), Object.entries(Theme.BUTTON_STYLES));
    options($("[data-language-options]"), Object.entries(Theme.LANGUAGES));

    // ---------- Form <-> preferences ----------
    const field = name => form.elements.namedItem(name);
    function fillForm(prefs) {
        prefs = { ...Theme.DEFAULTS, ...prefs };
        ["bg", "text", "accent", "selectionColor", "font", "size", "buttonStyle", "language", "ttsRate", "ttsPitch", "ttsVolume"]
            .forEach(key => { field(key).value = prefs[key]; });
        setVoice(prefs.ttsVoice);
        field("headTracking.enabled").checked = Boolean(prefs.headTracking?.enabled);
        field("headTracking.sensitivity").value = prefs.headTracking?.sensitivity ?? 0.45;
        themeName = prefs.theme;
        calibration = prefs.headTracking?.calibration || null;
        refresh();
    }

    function readForm() {
        const number = name => Number(field(name).value);
        const prefs = {
            ...saved,
            theme: themeName,
            bg: field("bg").value, text: field("text").value, accent: field("accent").value,
            selectionColor: field("selectionColor").value, font: field("font").value, size: number("size"),
            buttonStyle: field("buttonStyle").value, language: field("language").value,
            ttsVoice: field("ttsVoice").value, ttsRate: number("ttsRate"), ttsPitch: number("ttsPitch"), ttsVolume: number("ttsVolume"),
            headTracking: { enabled: field("headTracking.enabled").checked, sensitivity: number("headTracking.sensitivity"), calibration },
        };
        prefs.theme = nameOfLook(prefs);
        return prefs;
    }

    // The preset or saved theme the form's look matches, else "Custom"
    const sameLook = (a, b) => LOOK.every(key => String(a[key]).toLowerCase() === String(b[key]).toLowerCase());
    function nameOfLook(prefs) {
        if (themeName && (Theme.PRESETS[themeName] || saved.customThemes[themeName])
            && sameLook(prefs, Theme.PRESETS[themeName] || saved.customThemes[themeName])) return themeName;
        const all = { ...Theme.PRESETS, ...saved.customThemes };
        return Object.keys(all).find(name => sameLook(prefs, all[name])) || "Custom";
    }

    // ---------- Live preview, readability checks, labels, "unsaved" note ----------
    const paint = (node, prop, value) => node.style.setProperty(prop, value, "important");
    function refresh() {
        const p = readForm();
        const preview = $("[data-preview]");
        const font = Theme.FONTS[p.font]?.stack || "Montserrat, sans-serif";
        paint(preview, "background-color", p.bg);
        paint(preview, "color", p.text);
        paint(preview, "font-family", font);
        $$("h3, p", preview).forEach(node => { paint(node, "color", p.text); paint(node, "font-family", p.font === "site" && node.tagName === "H3" ? "'Space Grotesk', Montserrat, sans-serif" : font); });
        paint($("[data-preview-text]"), "font-size", `${p.size}px`);
        paint($("[data-preview-bar]"), "background-color", p.accent);
        paint($("[data-preview-link]"), "color", p.accent);
        const selection = $("[data-preview-selection]");
        paint(selection, "background-color", p.selectionColor);
        paint(selection, "color", Theme.readableOn(p.selectionColor));
        const radius = { "default": "999px", "rounded-all": "8px", "square": "0", "pill": "999px" }[p.buttonStyle];
        const button = $("[data-preview-button]"), ghost = $("[data-preview-ghost]");
        [button, ghost].forEach(b => { paint(b, "border-radius", radius); paint(b, "font-family", font); });
        paint(button, "background", p.accent);
        paint(button, "color", Theme.readableOn(p.accent));
        paint(ghost, "color", p.text);
        paint(ghost, "box-shadow", `inset 0 0 0 1px ${p.accent}`);

        check($("[data-check-text]"), Theme.contrast(p.bg, p.text), 4.5);
        check($("[data-check-accent]"), Theme.contrast(p.bg, p.accent), 3);

        $$("[data-hex-for]").forEach(code => { code.textContent = $("#" + code.dataset.hexFor).value.toUpperCase(); });
        $("[data-size-label]").textContent = `${p.size}px${p.size === Theme.BASE_SIZE ? " (default)" : ""}`;
        $$("[data-label-for]").forEach(label => {
            const value = Number($("#" + label.dataset.labelFor).value);
            label.textContent = label.dataset.labelFor === "pref-tts-volume" ? Math.round(value * 100) : value.toFixed(label.dataset.labelFor.includes("tracking") ? 2 : 1);
        });
        $$("[data-theme]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.theme === p.theme)));

        const dirty = stable(withoutThemeName(p)) !== stable(withoutThemeName({ ...Theme.DEFAULTS, ...saved }));
        page.classList.toggle("is-dirty", dirty);
        if (dirty) say(status, "You have unsaved changes.");
        else if (status.textContent === "You have unsaved changes.") say(status, "");
    }
    const withoutThemeName = p => Object.fromEntries(Object.entries(p).filter(([key]) => key !== "theme"));
    // JSON with keys in a fixed order at every level (the backend sends them sorted; the form builds them in its own order)
    const stable = value => JSON.stringify(value, (key, v) => v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

    function check(node, ratio, minimum) {
        const pass = ratio >= minimum;
        node.textContent = `${ratio.toFixed(1)}:1 ${pass ? "Good" : "Hard to read"}`;
        node.dataset.status = pass ? "pass" : "warning";
    }

    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);

    // ---------- Step 1: presets, my themes, AI ----------
    function swatch(name, look, onPick, onDelete) {
        const button = el("button", { type: "button", class: "prefs-swatch", "data-theme": name, "aria-pressed": "false" },
            el("span", { class: "prefs-swatch__chip", "aria-hidden": "true", style: { background: look.bg, borderColor: look.accent } },
                el("span", { style: { background: look.accent } }), el("span", { style: { background: look.text } })),
            el("span", { class: "prefs-swatch__name" }, name));
        button.addEventListener("click", () => onPick(name, look));
        if (!onDelete) return button;
        const remove = el("button", { type: "button", class: "prefs-swatch__delete", "aria-label": `Delete ${name}` }, el("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }));
        remove.addEventListener("click", () => onDelete(name));
        return el("div", { class: "prefs-swatch-wrap" }, button, remove);
    }

    function useLook(name, look) {
        LOOK.forEach(key => { if (look[key] !== undefined) field(key).value = look[key]; });
        themeName = name;
        refresh();
    }

    $("[data-presets]").replaceChildren(...Object.entries(Theme.PRESETS).map(([name, look]) => swatch(name, look, useLook)));

    function drawCustomThemes() {
        const themes = Object.entries(saved.customThemes || {});
        $("[data-custom-themes]").replaceChildren(...themes.map(([name, look]) => swatch(name, look, useLook, deleteTheme)));
        $("[data-custom-empty]").hidden = themes.length > 0;
        refresh();
    }

    // Saving only the list of themes: the rest stays as last saved, and the form keeps any unsaved edits
    async function saveThemes(customThemes, message) {
        try {
            saved = await apiRequest("/api/user/preferences", "PUT", { ...saved, customThemes });
            Theme.sync(saved);
            drawCustomThemes();
            say(status, message);
            return true;
        } catch (error) {
            say(status, error.message, true);
            return false;
        }
    }

    function addTheme(name, look) {
        name = (name || "").trim().slice(0, 30);
        if (!name) { say(status, "Give the theme a name first.", true); $("#prefs-theme-name").focus(); return; }
        const themes = { ...saved.customThemes };
        if (!themes[name] && Object.keys(themes).length >= 10) { say(status, "You can keep up to 10 themes. Delete one to add another.", true); return; }
        themes[name] = Object.fromEntries(LOOK.map(key => [key, look[key]]));
        themeName = name;
        return saveThemes(themes, `Added “${name}” to your themes.`);
    }

    async function deleteTheme(name) {
        const themes = { ...saved.customThemes };
        delete themes[name];
        await saveThemes(themes, `Deleted “${name}”.`);
    }

    $("[data-add-theme]").addEventListener("click", async () => {
        if (await addTheme($("#prefs-theme-name").value, readForm())) $("#prefs-theme-name").value = "";
    });

    // Create with AI
    let aiTheme = null, lastPrompt = "";
    const aiStatus = $("[data-ai-status]");
    $("[data-ai-chips]").replaceChildren(...AI_SUGGESTIONS.map(text => {
        const chip = el("button", { type: "button", class: "prefs-chip" }, text);
        chip.addEventListener("click", () => { $("#prefs-ai-prompt").value = text; generate(); });
        return chip;
    }));
    async function generate(prompt = $("#prefs-ai-prompt").value.trim()) {
        if (!prompt) { say(aiStatus, "Describe the look you want first.", true); return; }
        lastPrompt = prompt;
        const buttons = $$("[data-ai-generate], [data-ai-again]");
        buttons.forEach(b => { b.disabled = true; });
        say(aiStatus, "Designing your theme...");
        try {
            aiTheme = await apiRequest("/api/user/preferences/ai-theme", "POST", { prompt });
            $("[data-ai-title]").textContent = aiTheme.name;
            $("[data-ai-description]").textContent = aiTheme.description;
            const chip = $("[data-ai-swatch]");
            chip.style.background = `linear-gradient(135deg, ${aiTheme.bg} 0 55%, ${aiTheme.accent} 55% 78%, ${aiTheme.text} 78%)`;
            $("[data-ai-result]").hidden = false;
            say(aiStatus, "");
        } catch (error) {
            say(aiStatus, error.message, true);
        }
        buttons.forEach(b => { b.disabled = false; });
    }
    $("[data-ai-generate]").addEventListener("click", () => generate());
    $("#prefs-ai-prompt").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); generate(); } });
    $("[data-ai-again]").addEventListener("click", () => generate(lastPrompt));
    $("[data-ai-use]").addEventListener("click", () => {
        useLook(aiTheme.name, { ...aiTheme, size: Number(field("size").value) });
        say(aiStatus, `“${aiTheme.name}” is in the preview. Save to use it on the site.`);
    });
    $("[data-ai-keep]").addEventListener("click", () => addTheme(aiTheme.name, { ...aiTheme, size: Number(field("size").value) }));

    // ---------- Tabs (top tabs and the theme source segments) ----------
    function setUpTabs(buttons, show) {
        const select = (button, focus) => {
            buttons.forEach(b => {
                const on = b === button;
                b.setAttribute("aria-selected", String(on));
                b.tabIndex = on ? 0 : -1;
            });
            show(button);
            if (focus) button.focus();
        };
        buttons.forEach((button, i) => {
            button.addEventListener("click", () => select(button));
            button.addEventListener("keydown", e => {
                const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
                if (!step) return;
                e.preventDefault();
                select(buttons[(i + step + buttons.length) % buttons.length], true);
            });
        });
        return select;
    }
    const tabs = $$(".prefs-tabs__tab");
    const showTab = setUpTabs(tabs, button => {
        $$(".prefs-panel").forEach(panel => { panel.hidden = panel.id !== button.getAttribute("aria-controls"); });
        history.replaceState(null, "", "#" + button.id.replace("prefs-tab-", ""));
    });
    const fromHash = tabs.find(t => t.id === "prefs-tab-" + location.hash.slice(1));
    if (fromHash) showTab(fromHash);
    setUpTabs($$(".prefs-segments__btn"), button => {
        $$("[data-source-pane]").forEach(pane => { pane.hidden = pane.dataset.sourcePane !== button.dataset.source; });
    });

    // ---------- Text-to-speech ----------
    const voiceSelect = $("[data-voice-options]");
    let wantedVoice = saved.ttsVoice;
    function setVoice(name) {
        wantedVoice = name || "";
        voiceSelect.value = [...voiceSelect.options].some(o => o.value === wantedVoice) ? wantedVoice : "";
    }
    function drawVoices() {
        const voices = Theme.voices();
        voiceSelect.replaceChildren(el("option", { value: "" }, "Browser default"),
            ...voices.map(v => el("option", { value: v.name }, `${v.name} (${v.lang})`)));
        // A voice saved on another device may not exist here: keep it so saving here doesn't lose it
        if (wantedVoice && !voices.some(v => v.name === wantedVoice)) voiceSelect.append(el("option", { value: wantedVoice }, `${wantedVoice} (not on this device)`));
        voiceSelect.value = wantedVoice;
    }
    if (Theme.canSpeak) {
        drawVoices();
        speechSynthesis.addEventListener("voiceschanged", drawVoices);
    } else {
        $("[data-tts-unsupported]").hidden = false;
        $("[data-tts-test]").disabled = true;
    }
    $("[data-tts-test]").addEventListener("click", () => {
        const p = readForm();
        Theme.speak($("#prefs-tts-text").value.trim() || "Hello!", { ttsVoice: p.ttsVoice, ttsRate: p.ttsRate, ttsPitch: p.ttsPitch, ttsVolume: p.ttsVolume });
    });

    // ---------- Head tracking ----------
    const trackingStatus = $("[data-tracking-status]");
    const trackingSwitch = field("headTracking.enabled");
    let captured = {};
    async function setTracking(on) {
        try {
            tracking ??= await import('./head-tracking.js');
            if (on) {
                say(trackingStatus, "Starting the camera...");
                await tracking.start({ sensitivity: Number(field("headTracking.sensitivity").value), calibration });
                say(trackingStatus, calibration ? "Tracking. Move your head to move the pointer." : "Tracking. Calibrate below so the pointer reaches every edge.");
            } else {
                tracking.stop();
                say(trackingStatus, "");
            }
        } catch (error) {
            trackingSwitch.checked = false;
            refresh();
            say(trackingStatus, error.name === "NotAllowedError" ? "Camera access was blocked. Allow it in your browser to use head tracking." : `Head tracking couldn't start: ${error.message}`, true);
        }
    }
    trackingSwitch.addEventListener("change", () => setTracking(trackingSwitch.checked));
    field("headTracking.sensitivity").addEventListener("input", () => tracking?.update({ sensitivity: Number(field("headTracking.sensitivity").value) }));
    $$("[data-point]").forEach(button => button.addEventListener("click", () => {
        const point = tracking?.isRunning() && tracking.rawPoint();
        if (!point) { say(trackingStatus, "Turn head tracking on and face the camera first.", true); return; }
        const which = button.dataset.point;
        if (which === "center") Object.assign(captured, { centerX: point.x, centerY: point.y });
        if (which === "left") captured.leftX = point.x;
        if (which === "right") captured.rightX = point.x;
        if (which === "up") captured.upY = point.y;
        if (which === "down") captured.downY = point.y;
        button.classList.add("is-done");
        const missing = ["centerX", "leftX", "rightX", "upY", "downY"].filter(key => captured[key] === undefined);
        if (missing.length) { say(trackingStatus, `Captured ${which}. ${missing.length} to go.`); return; }
        calibration = { ...captured };
        captured = {};
        $$("[data-point]").forEach(b => b.classList.remove("is-done"));
        tracking.update({ calibration });
        refresh();
        say(trackingStatus, "Calibrated. Save to keep it.");
    }));
    $("[data-calibration-reset]").addEventListener("click", () => {
        calibration = null;
        captured = {};
        $$("[data-point]").forEach(b => b.classList.remove("is-done"));
        tracking?.update({ calibration: null });
        refresh();
        say(trackingStatus, "Calibration cleared. Save to keep the change.");
    });

    // ---------- Save / Reset ----------
    const saveButton = $("[data-save]");
    form.addEventListener("submit", async event => {
        event.preventDefault();
        saveButton.disabled = true;
        say(status, "Saving...");
        try {
            saved = await apiRequest("/api/user/preferences", "PUT", readForm());
            themeName = saved.theme;
            say(status, "Saved. Your preferences now apply across the site.");
            refresh();
            Theme.sync(saved);   // may reload the page when the language changes back to English
        } catch (error) {
            say(status, error.message, true);
        }
        saveButton.disabled = false;
    });

    $("[data-reset]").addEventListener("click", async () => {
        if (!confirm("Reset every preference to the site's default? Your saved themes are kept.")) return;
        try {
            const themes = saved.customThemes;
            saved = await apiRequest("/api/user/preferences", "DELETE");
            if (Object.keys(themes || {}).length) saved = await apiRequest("/api/user/preferences", "PUT", { ...saved, customThemes: themes });
            tracking?.stop();
            fillForm(saved);
            drawCustomThemes();
            say(status, "Back to the site default.");
            Theme.sync(saved);
        } catch (error) {
            say(status, error.message, true);
        }
    });

    // Leaving with unsaved changes asks first
    addEventListener("beforeunload", event => {
        if (page.classList.contains("is-dirty")) event.preventDefault();
    });

    fillForm(saved);
    drawCustomThemes();
    page.hidden = false;
    if (saved.headTracking?.enabled) setTracking(true);
});
