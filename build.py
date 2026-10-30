"""Build the NSA working-group site from content/ into _site/.

    python build.py            build once
    python build.py --serve    build, then preview at http://localhost:8000/nsa/

Everything a person edits lives in site.yml and content/. Templates are in
templates/, styles and scripts in assets/. GitHub Actions runs this same script
on every push to main and publishes _site/ to GitHub Pages.
"""

import argparse
import datetime as dt
import functools
import hashlib
import http.server
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import quote, urlparse
from zoneinfo import ZoneInfo

import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
OUT = ROOT / "_site"

FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?(.*)\Z", re.S)


def md(text):
    return markdown.markdown(text or "", extensions=["extra", "smarty", "sane_lists"])


def read_page(path):
    text = path.read_text(encoding="utf-8")
    m = FRONT_MATTER.match(text)
    meta, body = (yaml.safe_load(m.group(1)) or {}, m.group(2)) if m else ({}, text)
    meta["slug"] = path.stem
    meta["body"] = md(body).strip()
    return meta


def read_collection(folder):
    # Files starting with "_" are templates to copy, not entries.
    return [read_page(p) for p in sorted((CONTENT / folder).glob("*.md")) if not p.name.startswith("_")]


def parse_clock(value):
    # YAML 1.1 reads an unquoted 10:00 as the integer 600 (base-60), but 09:00 as a string.
    if isinstance(value, int):
        return divmod(value, 60)
    h, m = str(value).strip().split(":")
    return int(h), int(m)


def add_times(item, site, now):
    """Give an event start/end datetimes and the strings the templates show."""
    tz = ZoneInfo(item.get("timezone") or site["timezone"])
    d = item["date"]
    if isinstance(d, str):
        d = dt.date.fromisoformat(d)
    item["date"] = d
    item["date_text"] = f"{d.day} {d:%B %Y}"
    item["weekday"] = f"{d:%A}"
    if item.get("time") is not None:
        h, m = parse_clock(item["time"])
        start = dt.datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
        end = start + dt.timedelta(minutes=int(item.get("duration", 90)))
        clock = f"{start:%I:%M}".lstrip("0")
        ampm = "a.m." if start.hour < 12 else "p.m."
        item["time_text"] = f"{clock} {ampm} {start:%Z}"
        item["start_iso"] = start.isoformat()
    else:
        start = None
        end = dt.datetime(d.year, d.month, d.day, 23, 59, tzinfo=tz)
        item["time_text"] = None
        item["start_iso"] = None
    item["start"], item["end"] = start, end
    item["end_iso"] = end.isoformat()
    item["upcoming"] = end >= now
    item["has_ics"] = start is not None
    return item


def ordinal(n):
    n = int(n)
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def ics_escape(text):
    return str(text).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def ics_for(item, summary, url, site):
    utc = dt.timezone.utc
    stamp = dt.datetime.now(utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//{ics_escape(site['short_name'])} working group//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{item['slug']}.{site['short_name'].lower()}@{urlparse(site['url']).netloc}",
        f"DTSTAMP:{stamp}",
        f"DTSTART:{item['start'].astimezone(utc):%Y%m%dT%H%M%SZ}",
        f"DTEND:{item['end'].astimezone(utc):%Y%m%dT%H%M%SZ}",
        f"SUMMARY:{ics_escape(summary)}",
        f"URL:{url}",
        f"DESCRIPTION:{ics_escape(url)}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"


def file_hash(path):
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]


def build():
    site = yaml.safe_load((ROOT / "site.yml").read_text(encoding="utf-8"))
    site["url"] = site["url"].rstrip("/")
    base = urlparse(site["url"]).path.rstrip("/") + "/"
    now = dt.datetime.now(dt.timezone.utc)

    meetings = read_collection("meetings")
    for m in meetings:
        add_times(m, site, now)
        m["ordinal"] = ordinal(m["number"])
        m["url"] = f"meetings/{m['slug']}/"
    meetings.sort(key=lambda m: m["number"], reverse=True)
    for newer, older in zip(meetings, meetings[1:]):
        newer["prev"], older["next"] = older, newer

    conversations = read_collection("conversations")
    for c in conversations:
        add_times(c, site, now)
        c["url"] = f"long-view/{c['slug']}/"
    conversations.sort(key=lambda c: c["date"])

    long_view = read_page(CONTENT / "long-view.md")
    about = read_page(CONTENT / "about.md")

    upcoming = sorted(
        [dict(m, kind="meeting") for m in meetings if m["upcoming"]]
        + [dict(c, kind="conversation") for c in conversations if c["upcoming"]],
        key=lambda e: e["end"],
    )

    countries = sorted({i["country"] for i in site.get("community", [])})

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / "assets", OUT / "assets")
    (OUT / ".nojekyll").write_text("")

    env = Environment(
        loader=FileSystemLoader(ROOT / "templates"),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.globals.update(
        site=site,
        base=base,
        year=now.year,
        version={
            "css": file_hash(ROOT / "assets/css/site.css"),
            "js": file_hash(ROOT / "assets/js/site.js"),
            "chain": file_hash(ROOT / "assets/js/chain.js"),
        },
        mailto=lambda subject: "mailto:{}?subject={}".format(
            ",".join(o["email"] for o in site["organizers"]), quote(subject)
        ),
    )

    def render(template, path, **ctx):
        dest = OUT / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        page_url = site["url"] + "/" + path.removesuffix("index.html")
        html = env.get_template(template).render(page_url=page_url, **ctx)
        dest.write_text(html, encoding="utf-8")

    common = dict(meetings=meetings, conversations=conversations, long_view=long_view)
    render("home.html", "index.html", about=about, upcoming=upcoming, countries=countries, nav="home", **common)
    render("long_view.html", "long-view/index.html", nav="long-view", **common)
    render("meetings.html", "meetings/index.html", nav="meetings", **common)
    render("404.html", "404.html", nav="", **common)

    for m in meetings:
        render("meeting.html", f"{m['url']}index.html", m=m, nav="meetings", **common)
        if m["has_ics"]:
            summary = f"{site['short_name']} meeting: {m['title']}"
            (OUT / m["url"] / "event.ics").write_text(ics_for(m, summary, site["url"] + "/" + m["url"], site), encoding="utf-8", newline="")

    for c in conversations:
        render("conversation.html", f"{c['url']}index.html", c=c, nav="long-view", **common)
        if c["has_ics"]:
            summary = f"The Long View: {c['guest']}"
            (OUT / c["url"] / "event.ics").write_text(ics_for(c, summary, site["url"] + "/" + c["url"], site), encoding="utf-8", newline="")

    print(f"built {len(meetings)} meetings, {len(conversations)} conversations -> {OUT}")
    return base


def serve(base, port):
    class Handler(http.server.SimpleHTTPRequestHandler):
        # Serve _site/ under the same path GitHub Pages uses, so links behave identically.
        def translate_path(self, path):
            if path.startswith(base):
                path = "/" + path[len(base):]
            return super().translate_path(path)

    handler = functools.partial(Handler, directory=str(OUT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"preview at http://localhost:{port}{base}  (Ctrl+C to stop)")
        httpd.serve_forever()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serve", action="store_true", help="preview the site after building")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    base = build()
    if args.serve:
        serve(base, args.port)
