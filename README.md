# XRCare AI

Frontend for the XRCare AI site, a Jekyll site styled with Sass only. It matches the layout and look of [xrcare.ai](https://xrcare.ai). The backend is [xrcare-backend](https://github.com/XRCare-AI/xrcare-backend), using the same split as the Open Coding Society [pages](https://github.com/Open-Coding-Society/pages) (frontend) and [flask](https://github.com/Open-Coding-Society/flask) (backend) repos.

**All content comes from the backend.** This repo holds the layouts, styles, scripts and image files. Every word, link, menu item and article comes from the API, which also says which image goes where. To change what the site says, change the backend's data, not this repo.

## Run locally
```bash
# 1. Backend (in the xrcare-backend repo): API on http://localhost:8620
make

# 2. Frontend (this repo): http://localhost:4100
make            # bundle install + jekyll serve
make stop       # stops it
```

## Pages
| Address | Page | Content from |
| --- | --- | --- |
| `/` | Home: name and slogan over the photo reel, buttons to the main pages, the co-pilot graphic, features | `GET /api/pages/home` |
| `/about-us/` | About Us: intro, Vision/Mission, founder's quote, team cards with bios | `GET /api/pages/about-us` |
| `/explore/` | Explore hub: Clinical Teams, Care Team Training, Pharmacy and the Articles (search + category filter), with a sticky row of links | `GET /api/pages/explore`, `GET /api/articles` |
| `/articles/post/?slug=<slug>` | One article | `GET /api/articles/<slug>` |
| `/contact/` | Contact: "Ready to Transform Your Care Team?", contact details and the contact form (the only page with them) | `GET /api/pages/contact` + the contact form |
| `/login/` | Log in; the first log in goes on to `/welcome/`, later ones to `/account/` | `POST /api/authenticate` |
| `/signup/` | Create an account | `POST /api/user` |
| `/welcome/` | First-login survey | `survey` setting, `PUT /api/user/survey` |
| `/account/` | My Hub: the user's survey answers, a recommendation, links into the site, account details, log out | `GET /api/id`, `hub` setting |
| `/for-clinicalteams/`, `/care-team-training/`, `/articles/` | Old addresses: redirect to their part of `/explore/` (keeping `?category=` etc.) | |
| anything else | 404 Page Not Found (`404.html`) | `not_found` setting |

## Structure
- `_layouts/default.html`: page shell (fonts, header, slide-out menu, footer, scripts). Front matter: `body_class` (`is-flow` = dark page), `header` (`transparent` turns to glass when scrolled; `solid`), `footer` (`contact` adds the contact form; `none`).
- `_layouts/auth.html`: Log in (form card only) and Sign up (`auth_panel: true` adds the brand panel on the left).
- `_layouts/redirect.html`: sends an old address to its new one.
- `_includes/`: top menu bar (logo, links, Log in / Get Started, or the account chip that opens My Hub), phone/tablet slide-out menu, footer (plus the contact panel on Contact).
- `images/`: every image on the site (the backend's content names them by path).
- `videos/hero-reel.mp4` (+ `.jpg` poster): the home page's background video, made from the photos in `images/` by `tools/make-hero-reel.py` (not published).
- `js/api/config.js`: backend address (`pythonURI`) and the `apiRequest` helper (same as OCS pages). Set `deployedPythonURI` once the backend is hosted.
- `js/site.js`: loads the settings and menu, plus helpers (element builder, safe HTML for bios and articles, dates).
- `js/main.js`: fills the header, menu, footer and any `data-site-*` element from the settings, and runs the slide-out menu.
- `js/account.js`: who is logged in (`GET /api/id`), log out, where to go after logging in, and turning "Get Started" links into "My Hub" for logged-in users.
- `js/page.js`: draws a page's sections by `layout` (`spotlight`, `copilot`, `capabilities`, `pillars`, `audiences`, `cta`, `pagehead`, `subnav`, `audience`, `articles`, `about`, `team`) and fades them in.
- `js/article.js`: one article with Previous/Next Post and Share.
- `js/hub.js`: My Hub.
- `js/contact.js`: builds the contact form from `/api/contact/form` and sends it to `/api/contact`.
- `js/effects.js`: the moving network drawn behind the sign up panel.
- `js/auth.js`, `js/login.js`, `js/signup.js`: log in and sign up forms (show/hide password, strength meter).
- `js/survey.js`: the first-login survey, one question per screen (letter keys pick answers).
- `assets/css/main.scss`: the only stylesheet. Jekyll compiles it with the partials in `_sass/`:
  - `abstracts/`: tokens (colors, fonts, breakpoints) and mixins
  - `base/`: reset, typography, container
  - `layout/`: header, slide-out menu, footer and contact panel
  - `components/`: pill buttons, contact form
  - `pages/`: home (plus what every dark page shares), flow (Explore, About Us, Contact, an article, 404), hub, log in / sign up, survey

## Deploying
`.github/workflows/jekyll-gh-pages.yml` builds and publishes the site to GitHub Pages on every push to `main`. If the site is served from a project path (`https://<org>.github.io/xrcare-frontend/`), set `baseurl: "/xrcare-frontend"` in `_config.yml`. Add the frontend's address to the backend's CORS list (`ALLOWED_ORIGINS` in its `.env`).
