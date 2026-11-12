import { getSite, siteURL, el, formatDate } from './site.js';
import { apiRequest } from './api/config.js';
import { currentUser, showAccount } from './account.js';

// My Hub (/account/): greeting, the page we recommend from the survey, the survey answers, links into the site
// (the ones that fit the user's answers first) and account details. Logged-out visitors go to Log in.
document.addEventListener("DOMContentLoaded", async () => {
    const [user, site] = await Promise.all([currentUser(), getSite().catch(() => ({ settings: {} }))]);
    if (!user) {
        location.replace(siteURL("/login/") + "?next=" + encodeURIComponent(location.pathname));
        return;
    }
    const s = site.settings;
    const hub = s.hub || {};
    const survey = s.survey || { questions: [] };
    const answers = user.survey || {};
    const fill = (text, values) => (text || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
    const icon = cls => el("i", { class: cls, "aria-hidden": "true" });
    const firstName = user.name.trim().split(/\s+/)[0];

    document.querySelector("[data-hub-greeting]").textContent = fill(hub.greeting, { name: firstName });
    if (user.created_at) {
        const date = formatDate(user.created_at.slice(0, 10)).long;
        document.querySelector("[data-hub-since]").textContent = fill(hub.member_since, { date });
    }

    // Top row: the recommended page (from the chosen purpose) and "Update my answers", which opens the pop-up.
    // Before the survey is taken there is no recommendation, just a link to the survey.
    const actions = document.querySelector("[data-hub-actions]");
    const purposeQuestion = survey.questions.find(q => q.id === "purpose");
    const purpose = purposeQuestion?.options.find(o => o.id === answers.purpose);
    if (user.needs_survey) {
        actions.append(el("a", { class: "pill-button", href: siteURL("/welcome/") }, hub.take_survey, icon("fa-solid fa-arrow-right")));
    } else {
        if (purpose?.recommend) {
            actions.append(el("div", { class: "hub-recommend" },
                el("span", { class: "hub-recommend__kicker" }, hub.recommended),
                el("a", { class: "hub-recommend__link", href: siteURL(purpose.recommend.url) },
                    purpose.icon ? icon(purpose.icon) : null, el("span", {}, purpose.recommend.label), icon("fa-solid fa-arrow-right"))));
        }
        const open = el("button", { type: "button", class: "pill-button pill-button--ghost hub__answers-button" },
            icon("fa-solid fa-sliders"), hub.answers_button);
        actions.append(open);

        const dialog = document.querySelector("[data-hub-dialog]");
        document.querySelector("[data-hub-answers]").append(el("dl", { class: "hub-answers" }, ...survey.questions.flatMap(q => {
            const ids = [].concat(answers[q.id] || []);
            const chosen = q.options.filter(o => ids.includes(o.id));
            if (!chosen.length) return [];
            return [el("div", { class: "hub-answers__row" },
                el("dt", {}, q.title),
                el("dd", {}, ...chosen.map(o => el("span", { class: "hub-chip" }, o.icon ? icon(o.icon) : null, o.label))))];
        })));
        open.addEventListener("click", () => dialog.showModal());
        document.querySelector("[data-hub-close]").addEventListener("click", () => dialog.close());
        // Clicking the dimmed area outside the pop-up closes it
        dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
    }

    // Account details: rows like "Jump back in". Edit turns name, username and email into inputs; Save sends them
    // to PUT /api/user. Built-in accounts keep their username (the backend recreates them by username).
    let current = user;
    const form = document.querySelector("[data-hub-account]");
    const fieldsHolder = form.querySelector("[data-hub-fields]");
    const actionsRow = form.querySelector(".hub-rows__actions");
    const message = form.querySelector(".hub-rows__message");
    const editButton = document.querySelector("[data-hub-edit]");
    const say = (text, isError) => { message.textContent = text || ""; message.classList.toggle("is-error", Boolean(isError)); };
    const fields = [
        { key: "name", label: hub.name_label, type: "text", autocomplete: "name" },
        { key: "uid", label: hub.username_label, type: "text", autocomplete: "username",
          locked: () => current.username_locked, hint: hub.username_locked },
        { key: "email", label: hub.email_label, type: "email", autocomplete: "email" },
        { key: "role", label: hub.role_label, readOnly: true },
    ];
    const valueOf = (u, key) => key === "role" ? (u.is_admin ? s.account?.admin_label : (s.login?.user_label || "User")) : (u[key] || "—");

    function drawRows(editing) {
        form.classList.toggle("is-editing", editing);
        actionsRow.hidden = !editing;
        editButton.hidden = editing;
        fieldsHolder.replaceChildren(...fields.map(f => {
            const canEdit = editing && !f.readOnly && !(f.locked && f.locked());
            const id = `hub-field-${f.key}`;
            return el("div", { class: `hub-row${canEdit ? " is-editable" : ""}` },
                el("span", { class: "hub-row__text" },
                    el(canEdit ? "label" : "span", { class: "hub-row__label", for: canEdit ? id : null }, f.label),
                    canEdit
                        ? el("input", { class: "hub-row__input", id, name: f.key, type: f.type, autocomplete: f.autocomplete,
                            value: current[f.key] || "", required: f.key !== "email" ? "" : null, spellcheck: "false" })
                        : el("span", { class: "hub-row__value" }, valueOf(current, f.key)),
                    editing && f.locked && f.locked() && f.hint ? el("span", { class: "hub-row__hint" }, f.hint) : null));
        }));
        if (editing) fieldsHolder.querySelector("input")?.focus();
    }

    editButton.addEventListener("click", () => { say(""); drawRows(true); });
    form.querySelector("[data-hub-cancel]").addEventListener("click", () => { say(""); drawRows(false); });
    form.addEventListener("keydown", e => { if (e.key === "Escape" && form.classList.contains("is-editing")) { say(""); drawRows(false); } });
    form.addEventListener("submit", async e => {
        e.preventDefault();
        const body = Object.fromEntries([...form.querySelectorAll("input")].map(input => [input.name, input.value.trim()]));
        const save = form.querySelector('button[type="submit"]');
        save.disabled = true;
        say("");
        try {
            const result = await apiRequest("/api/user", "PUT", body);
            current = result.user || result;   // a username change returns {message, user} with a fresh login cookie
            drawRows(false);
            say(hub.saved || "Saved.");
            showAccount(current);              // header chip and avatar
            document.querySelector("[data-hub-greeting]").textContent = fill(hub.greeting, { name: current.name.trim().split(/\s+/)[0] });
        } catch (error) {
            say(error.message, true);
        }
        save.disabled = false;
    });
    drawRows(false);

    // Links into the site, stacked; the one matching the user's purpose comes first and is marked "For you"
    const tiles = [...(hub.tiles || [])].sort((a, b) => (b.key === answers.purpose) - (a.key === answers.purpose));
    document.querySelector("[data-hub-tiles]").append(...tiles.map(tile => {
        const mine = tile.key === answers.purpose;
        return el("a", { class: `hub-link${mine ? " is-mine" : ""}`, href: siteURL(tile.url) },
            el("span", { class: "hub-link__icon" }, icon(tile.icon)),
            el("span", { class: "hub-link__text" },
                el("span", { class: "hub-link__label" }, tile.label, mine ? el("span", { class: "hub-link__badge" }, hub.for_you) : null),
                el("span", { class: "hub-link__desc" }, tile.text)),
            icon("fa-solid fa-arrow-right hub-link__arrow"));
    }));
});
