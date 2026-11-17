import { apiRequest } from './api/config.js';
import { el } from './site.js';

// Chat bubble in the corner of every page. Display only: the wording comes from GET /api/chat and every answer from
// POST /api/chat (the backend's model/chat.py talks to Gemini/Groq, so no API key is ever in the browser).

// The conversation, saved for this browser tab so it survives moving between pages.
// sessionStorage can be blocked (private mode), so failures just mean the chat starts fresh.
const STORAGE_KEY = "xrcare-chat";
const loadMessages = () => { try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } };
const saveMessages = list => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* not saved */ } };

document.addEventListener("DOMContentLoaded", async () => {
    let widget;
    try {
        widget = await apiRequest("/api/chat");
    } catch {
        return;  // backend not running or not connected: no bubble, the rest of the site still works
    }
    if (!widget.available) return;  // backend has no AI key yet, so the bot could not answer

    const messages = loadMessages();

    // Build the bubble: a round button that opens a panel with the conversation and a text box
    const log = el("div", { class: "chatbot__log", role: "log", "aria-live": "polite" });
    const input = el("input", { class: "chatbot__input", type: "text", placeholder: widget.placeholder, maxlength: 1000, "aria-label": widget.placeholder });
    const send = el("button", { class: "chatbot__send", type: "submit" }, widget.send_label);
    const form = el("form", { class: "chatbot__form" }, input, send);
    const suggestions = el("div", { class: "chatbot__suggestions" },
        widget.suggestions.map(text => el("button", { class: "chatbot__suggestion", type: "button" }, text)));
    const panel = el("section", { class: "chatbot__panel", id: "chatbot-panel", "aria-label": widget.title, hidden: true },
        el("header", { class: "chatbot__header" },
            el("span", {}, widget.title),
            el("button", { class: "chatbot__close", type: "button", "aria-label": widget.close_label }, el("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }))),
        el("p", { class: "chatbot__notice" }, widget.notice),  // privacy and "not medical advice" reminder
        log, suggestions, form);
    const toggle = el("button", { class: "chatbot__toggle", type: "button", "aria-label": widget.open_label, "aria-controls": "chatbot-panel", "aria-expanded": "false" },
        el("i", { class: "fa-solid fa-comment-dots", "aria-hidden": "true" }));
    document.body.append(el("div", { class: "chatbot" }, panel, toggle));

    // Keep the newest message in view (called again when an answer replaces "Thinking...", since it gets taller)
    const scrollToEnd = () => { log.scrollTop = log.scrollHeight; };

    // One chat bubble in the log. textContent (not HTML) so an AI answer can never inject code into the page.
    const addBubble = (role, text) => {
        const bubble = el("p", { class: `chatbot__bubble chatbot__bubble--${role}` }, text);
        log.append(bubble);
        scrollToEnd();
        return bubble;
    };

    // Greeting first, then whatever was said earlier in this tab
    addBubble("assistant", widget.greeting);
    messages.forEach(m => addBubble(m.role, m.content));
    suggestions.hidden = messages.length > 0;  // suggestions only help before the first question

    const setOpen = open => {
        panel.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        if (open) input.focus();
    };
    toggle.addEventListener("click", () => setOpen(panel.hidden));
    panel.querySelector(".chatbot__close").addEventListener("click", () => setOpen(false));

    async function ask(text) {
        text = text.trim();
        if (!text) return;
        messages.push({ role: "user", content: text });
        addBubble("user", text);
        input.value = "";
        suggestions.hidden = true;
        send.disabled = true;
        const waiting = addBubble("assistant", widget.thinking);
        try {
            // The backend remembers nothing, so the whole conversation goes with each question
            const { reply } = await apiRequest("/api/chat", "POST", { messages });
            waiting.textContent = reply;
            messages.push({ role: "assistant", content: reply });
            saveMessages(messages);
        } catch (error) {
            // Drop the unanswered question so it isn't sent again with the next one (and, if it was refused for
            // containing personal details, so it is never stored in this tab either)
            messages.pop();
            waiting.textContent = error.message;
            waiting.classList.add("is-error");
        }
        scrollToEnd();
        send.disabled = false;
        input.focus();
    }

    form.addEventListener("submit", e => { e.preventDefault(); ask(input.value); });
    suggestions.addEventListener("click", e => {
        if (e.target.matches(".chatbot__suggestion")) ask(e.target.textContent);
    });
});
