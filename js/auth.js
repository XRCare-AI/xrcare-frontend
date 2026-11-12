import { getSite, el } from './site.js';
import { startNetwork } from './effects.js';

// Log in and Sign up pages: the brand panel (network, selling points) and show/hide password buttons
document.addEventListener("DOMContentLoaded", async () => {
    startNetwork(document.querySelector(".auth__network"), { density: 0.8 });

    const labels = (await getSite().catch(() => ({ settings: {} }))).settings.auth || {};
    const points = document.querySelector("[data-auth-points]");
    points?.replaceChildren(...(labels.panel_points || []).map(point =>
        el("li", {}, el("i", { class: "fa-solid fa-check", "aria-hidden": "true" }), point)));

    document.querySelectorAll("[data-password-toggle]").forEach(button => {
        const input = button.parentElement.querySelector("input");
        button.addEventListener("click", () => {
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            button.setAttribute("aria-pressed", String(show));
            button.querySelector("i").className = show ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
            button.querySelector(".sr-only").textContent = show ? labels.hide_password : labels.show_password;
            input.focus();
        });
    });
});

// Shared by login.js and signup.js: status line under the form, and the submit button's busy state
export function formStatus(form) {
    const message = form.querySelector(".auth-form__message");
    const button = form.querySelector('button[type="submit"]');
    return {
        say(text, isError) {
            message.textContent = text || "";
            message.classList.toggle("is-error", Boolean(isError));
            if (isError) form.classList.remove("shake"), void form.offsetWidth, form.classList.add("shake");
        },
        busy(on) {
            button.disabled = on;
            button.classList.toggle("is-busy", on);
        },
    };
}
