import { apiRequest } from './api/config.js';
import { getSite } from './site.js';
import { afterLogin } from './account.js';
import { formStatus } from './auth.js';

// Sign up page: POST /api/user creates the account and logs it in, then it is on to the survey (/welcome/)
document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("signup-form");
    const status = formStatus(form);
    const labels = (await getSite().catch(() => ({ settings: {} }))).settings.signup || {};
    const meter = document.getElementById("signup-strength");
    const meterLabel = meter.querySelector(".strength__label");

    // Strength meter: 0 = too short, then one point each for length 10+, mixed case, a digit, a symbol (max 4)
    form.password.addEventListener("input", () => {
        const p = form.password.value;
        let level = 0;
        if (p.length >= 6) {
            level = 1 + [p.length >= 10, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)]
                .filter(Boolean).length;
            level = Math.min(level, 4);
        }
        meter.dataset.level = p ? level : 0;
        meterLabel.textContent = p ? (labels.strength || [])[level] ?? "" : labels.password_hint;
        checkMatch();
    });

    const checkMatch = () => {
        const field = form.confirm.closest(".auth-field");
        field.classList.toggle("is-match", Boolean(form.confirm.value) && form.confirm.value === form.password.value);
    };
    form.confirm.addEventListener("input", checkMatch);

    form.addEventListener("submit", async e => {
        e.preventDefault();
        status.say("");
        const firstInvalid = [form.name, form.uid, form.email, form.password, form.confirm].find(input => !input.checkValidity());
        if (firstInvalid) {
            const label = form.querySelector(`label[for="${firstInvalid.id}"]`)?.textContent || "This field";
            const hint = firstInvalid === form.uid ? labels.username_hint
                : firstInvalid === form.password ? labels.password_hint
                : firstInvalid.validity.valueMissing ? "is required" : "is not valid";
            status.say(`${label}: ${hint}`, true);
            firstInvalid.focus();
            return;
        }
        if (form.password.value !== form.confirm.value) {
            status.say(labels.password_mismatch, true);
            form.confirm.focus();
            return;
        }
        status.busy(true);
        try {
            const result = await apiRequest("/api/user", "POST", {
                name: form.name.value.trim(),
                uid: form.uid.value.trim(),
                email: form.email.value.trim(),
                password: form.password.value,
            });
            location.href = afterLogin(result.user);
        } catch (error) {
            status.say(error.message, true);
            status.busy(false);
        }
    });
});
