# Neutrons, Soft Matters and Algorithms (NSA)

The website of the NSA working group and its seminar series, *The Long View*.

**Live:** <https://cw-do.github.io/nsa/>

Every push to `main` rebuilds and publishes the site in about a minute (see the
*Actions* tab). You can edit any file below directly on github.com: open it,
click the pencil, commit. No local setup is needed.

## What to edit

| To change | Edit |
|---|---|
| The group's name, the home-page intro, organizers, contact emails, the list of institutions | `site.yml` |
| The "About the group" text | `content/about.md` |
| The Long View's title lines and description | `content/long-view.md` |
| A meeting | `content/meetings/<date>-<name>.md` |
| A Long View conversation | `content/conversations/<date>-<name>.md` |

The counts on the home page ("12 institutions in 8 countries") are computed from
the `community:` list in `site.yml`.

## Add a meeting

Copy an existing file in `content/meetings/` to a new name, e.g.
`content/meetings/2026-11-20-smith.md`, and edit the top block:

```yaml
---
number: 5
date: 2026-11-20
time: "09:00"          # quote it. Read as US Eastern unless you add `timezone:`
duration: 90           # minutes, optional
title: The title of the talk
speakers:
  - name: Jane Smith
    affiliation: Some University, Country
host: Wei-Ren Chen     # optional
register_url:          # optional: a registration form
join_url:              # optional: a Zoom link, shown only until the meeting ends
---
The abstract goes here, in Markdown. *Italic*, **bold**, lists and
[links](https://example.org) all work.
```

Until the meeting has ended, it appears under **Coming up** on the home page with
the time in Knoxville and in the reader's own time zone, and an *Add to
calendar* file. Afterwards it moves into the archive by itself. Nothing needs
to be taken down by hand.

A public Zoom link can be found by anyone. For a large audience, prefer a
`register_url` and send the link to people who register.

## Add a Long View conversation

Copy `content/conversations/_example.md` (files starting with `_` are not
published) to e.g. `content/conversations/2027-01-15-surname.md` and fill it in.
The first one replaces "The first conversation will be announced here" on
the series page. After the event, add `recording_url:` if there is one.

## Preview on your own computer

```
pip install -r requirements.txt
python build.py --serve
```

then open <http://localhost:8000/nsa/>.

## How it is built

`build.py` reads `site.yml` and `content/`, fills in the Jinja templates in
`templates/`, copies `assets/`, and writes the site to `_site/` (not committed).
`.github/workflows/pages.yml` runs the same script on GitHub and publishes
`_site/`.

The animation at the top of the home page (`assets/js/chain.js`) is a real
calculation: a semiflexible chain of 120 segments twists at random about its own
bonds, its scattering is computed from all pairs of segments with the Debye
equation, and it is drawn against Debye's 1947 formula for an ideal chain with the
same radius of gyration. Readers who ask their system for reduced motion see one
still frame.

Fonts are Source Serif and Source Sans by Adobe, under the SIL Open Font License
(`assets/fonts/OFL.txt`). The Long View artwork is the group's own poster.
