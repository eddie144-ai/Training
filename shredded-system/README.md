# Shredded System

The Gironda Cut: a plan, a guide and an app for getting from 95 kg to a lean 70–75 kg. The diet is centred on Vince Gironda's meat-and-eggs approach with a planned carb-up every 72–96 hours, fixed for fibre and saturated fat. Mike Mentzer-style training supports it and Mike Dolce's prep habits make it stick.

Not medical advice. Retatrutide in particular needs a clinician.

## Folder

```text
shredded-system/
├── README.md
├── docs/            research-report (.md, .pdf), full-guide (.md, .pdf)
├── app-spec/        product-spec.md: spec and build prompt for Claude Code or Grok
├── data/            foods.csv, meal-templates.csv, workout-templates.csv, decision-rules.json
├── templates/       daily-log.csv, workout-log.csv, weekly-checkin.csv
├── sources/         source-map.md
├── app/             the working app (PWA) and a single-file copy
└── tools/           build.mjs, macros.mjs, pdf.mjs
```

## The app

Open `app/` on the site (`<site>/shredded-system/app/`), or open `app/shredded-system-single.html` straight from your phone's files. Install it on Android from Chrome's menu (**Install app**). Data stays on the phone; back it up from Setup.

Tabs: **Today** (day type, carb-up clock, meals, macros, check-in), **Food** (templates, weekly shop, food values), **Train** (Full Body A/B logger), **Progress** (trend, weekly decision, timeline, body-fat target) and **Guide**.

## Editing

The files in `data/` are the single source. After changing them or anything in `app/`:

```bash
node tools/build.mjs          # regenerates app/data.js and app/shredded-system-single.html
node tools/macros.mjs         # prints every template's macros
node tools/pdf.mjs            # re-renders the PDFs (needs: npm i marked playwright)
```

Bump `VERSION` in `app/sw.js` when app files change, so installed copies update.
