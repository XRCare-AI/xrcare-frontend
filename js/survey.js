import { apiRequest } from './api/config.js';
import { getSite, siteURL, el, showError } from './site.js';
import { currentUser } from './account.js';

// First-login survey (/welcome/): intro, one screen per question, then a screen pointing to the page that
// fits the visitor's purpose. Single-choice questions move on as soon as one is picked; letter keys pick options.
document.addEventListener("DOMContentLoaded", async () => {
    const stage = document.querySelector("[data-survey-stage]");
    const progress = document.querySelector(".survey__progress");
    const [user, site] = await Promise.all([currentUser(), getSite().catch(() => ({ settings: {} }))]);
    if (!user) {
        location.replace(siteURL("/login/") + "?next=" + encodeURIComponent(location.pathname));
        return;
    }
    const s = site.settings.survey;
    if (!s?.questions?.length) {
        showError(new Error("The survey could not be loaded. Please try again shortly."));
        return;
    }
    const questions = s.questions;
    const answers = { ...(user.survey || {}) };   // retaking the survey starts from the earlier answers
    const firstName = user.name.trim().split(/\s+/)[0];
    const fill = (text, values) => (text || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let step = -1;         // -1 = intro, questions.length = done
    let keyHandler = null;
    let advanceTimer = null;

    function setProgress(fraction) {
        progress.hidden = step < 0;
        const pct = Math.round(fraction * 100);
        progress.setAttribute("aria-valuenow", pct);
        progress.querySelector(".survey__progress-bar").style.width = pct + "%";
    }

    // Swap the screen with a short slide (direction: 1 = forward, -1 = back)
    function show(screen, direction = 1) {
        const old = stage.firstElementChild;
        screen.classList.add("survey-screen", direction > 0 ? "enter-forward" : "enter-back");
        if (old) {
            old.classList.add(direction > 0 ? "leave-forward" : "leave-back");
            old.addEventListener("animationend", () => old.remove(), { once: true });
            setTimeout(() => old.remove(), 600);
        }
        stage.append(screen);
        const focusTarget = screen.querySelector("h1, h2");
        focusTarget?.setAttribute("tabindex", "-1");
        focusTarget?.focus({ preventScroll: true });
    }

    function intro() {
        step = -1;
        setProgress(0);
        keyHandler = e => { if (e.key === "Enter" && !e.target.closest("button, a")) question(0, 1); };
        show(el("div", { class: "survey-intro" },
            el("h1", { class: "survey__heading" }, s.heading),
            el("p", { class: "survey__lead" }, `${fill(s.greeting, { name: firstName })} ${s.intro}`.trim()),
            el("div", { class: "survey-intro__steps", "aria-hidden": "true" },
                ...questions.map((q, i) => el("span", { style: { "--i": i } }))),
            el("div", { class: "survey__actions" },
                button(s.start_label, () => question(0, 1), "pill-button", "fa-solid fa-arrow-right"),
                skipLink())));
    }

    function skipLink() {
        return el("a", { class: "survey__skip", href: siteURL("/") }, s.skip_label);
    }

    function button(label, onClick, cls, iconClass) {
        const b = el("button", { type: "button", class: cls }, label, iconClass ? el("i", { class: iconClass, "aria-hidden": "true" }) : null);
        b.addEventListener("click", onClick);
        return b;
    }

    function question(index, direction) {
        step = index;
        const q = questions[index];
        const multiple = Boolean(q.multiple);
        const max = q.max || q.options.length;
        const chosen = () => {
            const a = answers[q.id];
            return new Set(multiple ? (Array.isArray(a) ? a : []) : (a ? [a] : []));
        };
        setProgress(index / questions.length);

        const next = button(index === questions.length - 1 ? s.finish_label : s.next_label, () => advance(), "pill-button", "fa-solid fa-arrow-right");
        const back = button(s.back_label, () => (index ? question(index - 1, -1) : intro()), "survey__back", "fa-solid fa-arrow-left");
        back.prepend(back.lastChild);   // arrow before the label

        const cards = q.options.map((option, i) => {
            const card = el("button", { type: "button", class: "survey-option", role: multiple ? "checkbox" : "radio",
                "data-id": option.id, style: { "--i": i } },
                el("span", { class: "survey-option__key", "aria-hidden": "true" }, letters[i]),
                option.icon ? el("i", { class: `survey-option__icon ${option.icon}`, "aria-hidden": "true" }) : null,
                el("span", { class: "survey-option__label" }, option.label),
                el("span", { class: "survey-option__check", "aria-hidden": "true" }, el("i", { class: "fa-solid fa-check" })));
            card.addEventListener("click", () => pick(option.id));
            return card;
        });

        function render() {
            const picked = chosen();
            cards.forEach(card => {
                const on = picked.has(card.dataset.id);
                card.setAttribute("aria-checked", String(on));
                card.classList.toggle("is-chosen", on);
                card.disabled = multiple && !on && picked.size >= max;
            });
            next.disabled = picked.size === 0;
            if (counter) counter.textContent = `${picked.size} / ${max}`;
        }

        function pick(id) {
            clearTimeout(advanceTimer);
            if (multiple) {
                const picked = chosen();
                picked.has(id) ? picked.delete(id) : picked.size < max && picked.add(id);
                answers[q.id] = [...picked];
                render();
            } else {
                answers[q.id] = id;
                render();
                advanceTimer = setTimeout(advance, 380);   // a moment to see the choice light up
            }
        }

        function advance() {
            clearTimeout(advanceTimer);
            if (!chosen().size || step !== index) return;
            index === questions.length - 1 ? finish() : question(index + 1, 1);
        }

        keyHandler = e => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.target.matches("input, textarea")) return;
            const i = letters.indexOf(e.key.toUpperCase());
            if (e.key.length === 1 && i >= 0 && i < q.options.length && !cards[i].disabled) {
                e.preventDefault();
                pick(q.options[i].id);
            } else if (e.key === "Enter" && !e.target.closest("button, a")) {
                advance();
            }
        };

        const counter = multiple ? el("span", { class: "survey__counter" }) : null;
        show(el("div", { class: "survey-question" },
            el("p", { class: "survey__step" }, fill(s.step_label, { n: index + 1, total: questions.length })),
            el("h2", { class: "survey__heading", id: `q-${q.id}` }, q.title),
            el("p", { class: "survey__lead" },
                multiple ? fill(s.choose_up_to, { max }) : q.text || "", counter ? " " : null, counter),
            el("div", { class: `survey-options${q.options.length > 6 ? " survey-options--dense" : ""}`,
                role: multiple ? "group" : "radiogroup", "aria-labelledby": `q-${q.id}` }, ...cards),
            el("p", { class: "survey__hint" }, s.key_hint),
            el("div", { class: "survey__actions survey__actions--split" }, back, el("div", { class: "survey__actions-end" }, skipLink(), next))),
            direction);
        render();
    }

    async function finish() {
        step = questions.length;
        setProgress(1);
        keyHandler = null;
        show(el("div", { class: "survey-saving" }, el("span", { class: "survey-saving__spinner", "aria-hidden": "true" }), s.saving_label), 1);
        try {
            const updated = await apiRequest("/api/user/survey", "PUT", { answers });
            done(updated);
        } catch (error) {
            const retry = button(s.finish_label, finish, "pill-button", "fa-solid fa-rotate-right");
            show(el("div", { class: "survey-question" },
                el("h2", { class: "survey__heading" }, error.message),
                el("div", { class: "survey__actions" },
                    button(s.back_label, () => question(questions.length - 1, -1), "survey__back"), retry)), 1);
        }
    }

    function done(updated) {
        const purpose = questions.find(q => q.id === "purpose");
        const option = purpose?.options.find(o => o.id === answers.purpose);
        const recommend = option?.recommend;
        const summary = questions.flatMap(q => {
            const ids = [].concat(answers[q.id] || []);
            return q.options.filter(o => ids.includes(o.id)).map(o =>
                el("li", {}, o.icon ? el("i", { class: o.icon, "aria-hidden": "true" }) : null, o.label));
        });
        show(el("div", { class: "survey-done" },
            el("div", { class: "survey-done__badge", "aria-hidden": "true" }, el("i", { class: "fa-solid fa-check" })),
            el("h1", { class: "survey__heading" }, fill(s.done_heading, { name: updated.name.trim().split(/\s+/)[0] })),
            el("p", { class: "survey__lead" }, s.done_text),
            recommend ? el("a", { class: "survey-recommend", href: siteURL(recommend.url) },
                option.icon ? el("span", { class: "survey-recommend__icon" }, el("i", { class: option.icon, "aria-hidden": "true" })) : null,
                el("span", { class: "survey-recommend__label" }, recommend.label),
                el("i", { class: "fa-solid fa-arrow-right", "aria-hidden": "true" })) : null,
            el("ul", { class: "survey-done__summary" }, ...summary),
            s.done_secondary ? el("a", { class: "survey__skip", href: siteURL(s.done_secondary.url) }, s.done_secondary.label) : null), 1);
        burst();
    }

    // A quick burst of colored sparks behind the finished badge
    function burst() {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const holder = stage.querySelector(".survey-done__badge");
        const colors = ["#17ddfc", "#7b61ff", "#4fa3ff", "#ffffff"];
        for (let i = 0; i < 28; i++) {
            const angle = (i / 28) * Math.PI * 2;
            const distance = 70 + Math.random() * 70;
            holder.append(el("span", { class: "spark", style: {
                "--dx": `${Math.cos(angle) * distance}px`, "--dy": `${Math.sin(angle) * distance}px`,
                background: colors[i % colors.length], animationDelay: `${Math.random() * 120}ms` } }));
        }
    }

    document.addEventListener("keydown", e => keyHandler?.(e));
    intro();
});
