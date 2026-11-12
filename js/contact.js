import { apiRequest } from './api/config.js';
import { el, getSite } from './site.js';

// "Ready to Transform Your Care Team?" form: fields come from GET /api/contact/form, messages go to POST /api/contact
document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("contact-form");
    if (!form) return;
    const holder = form.querySelector("[data-contact-fields]");
    const message = form.querySelector(".contact-form__message");
    const say = (text, isError) => { message.textContent = text; message.classList.toggle("is-error", !!isError); };

    let fields = [];
    try {
        fields = await apiRequest("/api/contact/form");
    } catch (error) {
        say(error.message, true);
        return;
    }

    // Fields marked "first" start a new row, as in the WPForms layout on xrcare.ai
    const rows = [];
    fields.forEach((field, i) => {
        if (i === 0 || field.first) rows.push([]);
        rows.at(-1).push(field);
    });
    holder.replaceChildren(...rows.map(row => el("div", { class: "contact-form__row" }, ...row.map(field => {
        const id = `contact-${field.name}`;
        const input = field.type === "textarea"
            ? el("textarea", { id, name: field.name, required: field.required })
            : el("input", { id, name: field.name, type: field.type, required: field.required });
        return el("div", { class: `field field--${field.width}` },
            el("label", { for: id }, field.label, field.required ? el("span", { class: "required", "aria-hidden": "true" }, " *") : null),
            input);
    }))));

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const missing = fields.find(f => f.required && !form.elements[f.name].value.trim());
        if (missing) {
            say(`${missing.label} is required`, true);
            form.elements[missing.name].focus();
            return;
        }
        const submit = form.querySelector('button[type="submit"]');
        const label = submit.textContent;
        submit.disabled = true;
        submit.textContent = (await getSite().catch(() => ({ settings: {} }))).settings.contact_sending_label || label;
        try {
            const body = Object.fromEntries(fields.map(f => [f.name, form.elements[f.name].value]));
            const result = await apiRequest("/api/contact", "POST", body);
            form.reset();
            say(result.message);
        } catch (error) {
            say(error.message, true);
        }
        submit.disabled = false;
        submit.textContent = label;
    });
});
