import { apiRequest } from './api/config.js';
import { siteURL } from './site.js';

// Who is logged in (GET /api/id), asked once per page: the user, or null when logged out
let userRequest;
export function currentUser() {
    userRequest ??= apiRequest('/api/id').catch(() => null);
    return userRequest;
}

export async function logOut() {
    await apiRequest('/api/authenticate', 'DELETE').catch(() => null);
    userRequest = Promise.resolve(null);
}

// Where to go after logging in or signing up: the survey the first time, else ?next= (same site only) or My Hub
export function afterLogin(user) {
    if (user?.needs_survey) return siteURL('/welcome/');
    const next = new URLSearchParams(location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : siteURL('/account/');
}

// Header and slide-out menu: [data-when="guest"] shows when logged out, [data-when="user"] when logged in,
// and [data-account="name"] etc. hold the user's details
export function showAccount(user) {
    document.querySelectorAll('[data-when]').forEach(node => {
        node.hidden = (node.dataset.when === 'user') !== Boolean(user);
    });
    if (!user) return;
    const words = user.name.trim().split(/\s+/);
    const details = {
        name: user.name,
        first_name: words[0],
        initials: (words[0][0] + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase(),
        email: user.email || '@' + user.uid,
    };
    document.querySelectorAll('[data-account]').forEach(node => {
        node.textContent = details[node.dataset.account] ?? '';
    });
}

// Log out buttons anywhere on the page ([data-action="log-out"])
export function setUpAccountMenu() {
    document.querySelectorAll('[data-action="log-out"]').forEach(button => {
        button.addEventListener('click', async () => {
            await logOut();
            location.href = siteURL('/');
        });
    });
}

// Once logged in, "Get Started" / "Create an Account" links (to /signup/) lead to the user's hub instead
export function swapGuestLinks(user, label) {
    if (!user) return;
    document.querySelectorAll('main a[href$="/signup/"]').forEach(link => {
        link.href = siteURL('/account/');
        const text = [...link.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
        const span = link.querySelector('.hero-link__label');
        if (span) span.textContent = label;
        else if (text) text.textContent = label;
    });
}
