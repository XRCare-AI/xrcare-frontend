import { apiRequest } from './api/config.js';
import { getSite } from './site.js';
import { currentUser, afterLogin } from './account.js';
import { formStatus } from './auth.js';

// Log in page: POST /api/authenticate sets the login cookie, then the first log in goes to the survey.
// Someone already logged in sees who they are, with Continue and Log Out (main.js shows [data-when="user"]).
document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("login-form");
    const status = formStatus(form);
    const labels = (await getSite().catch(() => ({ settings: {} }))).settings.login || {};

    const user = await currentUser();
    if (user) {
        document.querySelector(".auth-account__role").textContent = user.is_admin ? labels.admin_label : labels.user_label;
        document.querySelector("[data-continue]").href = afterLogin(user);
    }

    form.addEventListener("submit", async e => {
        e.preventDefault();
        status.say("");
        if (!form.uid.value.trim() || !form.password.value) {
            status.say(!form.uid.value.trim() ? "Please enter your username or email" : "Please enter your password", true);
            (!form.uid.value.trim() ? form.uid : form.password).focus();
            return;
        }
        status.busy(true);
        try {
            const result = await apiRequest("/api/authenticate", "POST", { uid: form.uid.value.trim(), password: form.password.value });
            location.href = afterLogin(result.user);
        } catch (error) {
            status.say(error.message, true);
            status.busy(false);
        }
    });
});
