# XRCare AI

Frontend for the XRCare AI site, a Jekyll site styled with Sass only. It matches the layout and look of [xrcare.ai](https://xrcare.ai). The backend is [xrcare-backend](https://github.com/XRCare-AI/xrcare-backend), using the same split as the Open Coding Society [pages](https://github.com/Open-Coding-Society/pages) (frontend) and [flask](https://github.com/Open-Coding-Society/flask) (backend) repos.

**The site works on its own.** Every page's content (wording, menu, sections, images) lives in this repo, in `_data/`, and is built into the pages, so the deployed site needs no server. Only the parts that use the backend's database need it: log in / sign up, the first-login survey, My Hub, the articles and the contact form. Without the backend those show "The XRCare server has not been connected to this site yet." and everything else works.

To change what the site says, edit `_data/`:
- `_data/site.yml`: site-wide wording and links (header, footer, log in / sign up, survey screens, My Hub, 404)
- `_data/nav.yml`: the menu
- `_data/pages/<page>.yml`: a page's sections, in order (`home`, `about-us`, `explore`, `contact`)

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
| `/` | Home: name and slogan over the photo reel, buttons to the main pages, the co-pilot graphic, features | `_data/pages/home.yml` |
| `/about-us/` | About Us: intro, Vision/Mission, founder's quote, team cards with bios | `_data/pages/about-us.yml` |
| `/explore/` | Explore hub: Clinical Teams, Care Team Training, Pharmacy and the Articles (search + category filter), with a sticky row of links | `_data/pages/explore.yml`; articles: `GET /api/articles` |
| `/articles/post/?slug=<slug>` | One article | `GET /api/articles/<slug>` |
| `/contact/` | Contact: "Ready to Transform Your Care Team?", contact details and the contact form (the only page with them) | `_data/pages/contact.yml`; form: `/api/contact` |
| `/login/` | Log in; the first log in goes on to `/welcome/`, later ones to `/account/` | `POST /api/authenticate` |
| `/signup/` | Create an account | `POST /api/user` |
| `/welcome/` | First-login survey | questions: `GET /api/survey`; answers: `PUT /api/user/survey` |
| `/account/` | My Hub: recommendation, survey answers (pop-up), editable account details, links into the site | `GET /api/id`, `GET /api/survey`, `PUT /api/user` |
| `/for-clinicalteams/`, `/care-team-training/`, `/articles/` | Old addresses: redirect to their part of `/explore/` (keeping `?category=` etc.) | |
| anything else | 404 Page Not Found (`404.html`) | `_data/site.yml` (`not_found`) |

## Structure
- `_data/`: all of the site's content (see above). `_layouts/default.html` builds it into every page as JSON (`#site-data`, and `#page-data` for the page named by `data_page`).
- `_layouts/default.html`: page shell (fonts, header, slide-out menu, footer, scripts). Front matter: `data_page`, `body_class` (`is-flow` = dark page), `header` (`transparent` turns to glass when scrolled; `solid`), `footer` (`contact` adds the contact form; `none`).
- `_layouts/auth.html`: Log in (form card only) and Sign up (`auth_panel: true` adds the brand panel on the left).
- `_layouts/redirect.html`: sends an old address to its new one.
- `_includes/`: top menu bar (logo, links, Log in / Get Started, or the account chip that opens My Hub), phone/tablet slide-out menu, footer (plus the contact panel on Contact).
- `images/`: every image on the site (`_data/` and the backend's articles name them by path).
- `videos/hero-reel.mp4` (+ `.jpg` poster): the home page's background video, made from the photos in `images/` by `tools/make-hero-reel.py` (not published).
- `js/api/config.js`: backend address (`pythonURI`) and the `apiRequest` helper (same as OCS pages). Set `deployedPythonURI` once the backend is hosted.
- `js/site.js`: reads the built-in content (`getSite()`, `getPage()`), plus helpers (element builder, safe HTML for bios and articles, dates, base path).
- `js/main.js`: fills the header, menu, footer and any `data-site-*` element from `_data/site.yml` (an element keeps its own text if a key is missing), and runs the slide-out menu.
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
`.github/workflows/jekyll-gh-pages.yml` builds and publishes the site to GitHub Pages on every push to `main`, passing the Pages path (`/xrcare-frontend`) as `--baseurl` so every link, stylesheet, script and image works there; locally `baseurl` stays `""`. Once the backend is hosted, set `deployedPythonURI` in `js/api/config.js` and add the frontend's address to the backend's CORS list (`ALLOWED_ORIGINS` in its `.env`).
