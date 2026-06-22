# Transit Explorer — North York Town Centre

A transit-native recommendation agent for the TTC Line 1 corridor between Finch and Sheppard-Yonge stations.

Built as a portfolio piece for the **Transit App Business Intelligence Analyst** role.

---

## The problem

Transit apps tell you how to get from A to B. They don't help you decide what to do when you get off. Most "nearby" feeds are generic distance sorts — they don't know what station you're at, how much time you have, or where you're going next.

Transit Explorer is a proof-of-concept that asks: *what if the app understood your stop?*

---

## Three features

### 1 — Time-budget discovery (Nearby tab)

Riders select a time budget — **Quick** (<5 min), **Explore** (30 min), or **Experience** (1 hr+) — and see the highest-scored POIs for that window at their current station.

Each station has a distinct character baked in:
- **Finch** — Korean dining corridor; multicultural food hub
- **North York Centre** — arts, culture, civic core
- **Sheppard-Yonge** — urban retail, direct concourse access

The scoring model surfaces the *right* venue, not just the most-reviewed one:

```
score = rating × log10(review_count + 1) × distance_factor × category_weight
```

`distance_factor` penalizes walk time linearly up to 800 m. `category_weight` gives a 10% bump to attractions and culture (tourist-relevance tuning). The full formula is in [`app/recommender.py`](app/recommender.py).

---

### 2 — Route detour card (Plan tab)

When a rider's route passes through a station with a high-scoring nearby venue, a detour card appears inline in the stop list. It shows:
- The venue (Meridian Arts Centre at North York Centre)
- Tonight's event
- Time cost of the detour
- Walk from the exit
- How long until the next train if they stay

This is the core BI insight: **known route + scored POI data = proactive suggestion the rider didn't have to search for.** The trigger rule is: `station_id ∈ route_stops AND score > threshold`.

---

### 3 — Intercity content recommendations (GO Transit tab)

When riders have a 30–60 min wait at a transit hub (e.g., Union Station for the Barrie GO line), spatial POI recommendations break down — there isn't much walkable. But the app already knows where they're going.

The GO Transit tab uses that destination knowledge to show:
- **Discover** — short videos and articles about Barrie (preview the destination while waiting)
- **Eat & drink** — where to eat when they arrive, sorted by walk from the GO station
- **Shop local** — local merchants, with a "Promoted" slot for paid placement

This is an untapped **monetization surface**: long-wait passengers are captive, and destination merchants have clear intent-to-purchase alignment.

---

## Key findings

| Station | Dominant category | Median walk | Top-scored venue |
|---------|-------------------|-------------|------------------|
| Finch | Restaurant (8 POIs) | ~175 m | Owl of Minerva (Korean BBQ, score 14.1) |
| North York Centre | Culture + Restaurant | ~175 m | Toronto Public Library (score 14.4) |
| Sheppard-Yonge | Shopping | ~55 m | Whole Foods — direct concourse (score 12.0) |

**Scoring observations:**
- Attractions and culture score disproportionately well relative to walk distance — users tolerate longer walks for unique experiences. The category weight captures this.
- Finch is underserved in the "Experience" time budget (only 2 venues) vs. North York Centre (6 venues). A product recommendation: surface this gap to content/partnership teams.
- Review count is a noisy signal on its own — `log10(review_count + 1)` compresses the tail and prevents a venue with 10,000 reviews from dominating a venue with 1,000 reviews that has a meaningfully higher rating.

**Business model connection:**
GO Transit carries ~60K daily riders, many with 30+ min wait windows. A 5% engagement rate on promoted destination content during waits represents a meaningful new revenue surface without modifying the core navigation product. The "Save for later" mechanic tracks intent across the session and creates a handoff moment when the rider arrives.

---

## Project structure

```
transit-explorer/
├── app/
│   ├── main.py              # Flask REST API (6 endpoints)
│   ├── recommender.py       # Composite scoring engine
│   ├── data_collector.py    # Google Places API collector
│   └── static/
│       ├── index.html       # Mobile phone-frame shell (3 screens)
│       ├── style.css        # Mobile-first styles
│       └── app.js           # Station discovery, detour toggle, GO content
├── data/
│   ├── stations.json        # TTC station metadata + character tags
│   ├── pois.json            # 28 curated POIs with budget classification
│   └── go_content.json      # GO Transit content (discover, eat, shop)
├── notebooks/
│   └── transit_explorer_analysis.ipynb   # 9-section BI analysis
├── run.py
└── requirements.txt
```

---

## Quick start

```bash
git clone <repo-url> && cd transit-explorer
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

python run.py
# → http://localhost:5001
```

No API key needed. The app uses curated JSON data out of the box.

### With live Google Places data

```bash
cp .env.example .env
# Add your GOOGLE_MAPS_API_KEY to .env
python -m app.data_collector --all
python run.py
```

---

## REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/stations` | All stations with metadata |
| `GET /api/recommend?station=finch&category=restaurant&limit=10` | Ranked recommendations |
| `GET /api/station/finch` | Station summary with top picks by category |
| `GET /api/pois?station=sheppard_yonge` | Raw POI list with filters |
| `GET /api/categories` | Available category values |
| `GET /api/go-content` | GO Transit long-wait content feed |

---

## Jupyter notebook

`notebooks/transit_explorer_analysis.ipynb` covers:

1. Dataset overview and schema validation
2. Category distribution by station (reveals station persona)
3. Rating vs. review count scatter (validates log-scaling choice)
4. Walk distance histograms per station
5. Top 15 POIs by composite score
6. Score sensitivity surface — rating vs. distance interaction
7. Station persona profiles (qualitative + quantitative)
8. Five actionable product insights
9. Limitations and what real-world data would change

All cells are pre-run — viewable in GitHub's notebook renderer without a Python environment.

---

## Design decisions

**Why rule-based scoring, not ML?**
The scoring formula is fully explainable. Every weight has a clear rationale. A BI team can audit it, tune it, and A/B test individual parameters. A black-box model can't do that. For a portfolio piece aimed at a BI Analyst role, explainability *is* the feature.

**Why no map?**
Transit App is already a map. The interesting design question is: what happens *after* you exit the station? A mobile-first, station-first UI is more appropriate than a Google Maps clone.

**Why GO Transit content?**
Spatial recommendations break down in intercity terminal scenarios. The app already knows the destination — using that knowledge for destination-based content is a natural extension that doesn't require new data collection, just a new rendering mode.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Python, Flask |
| Frontend | Vanilla JS, CSS (no build step, no framework) |
| Data | Google Places API (live mode), curated JSON (offline mode) |
| Analysis | pandas, matplotlib, seaborn, Jupyter |

---

## Author

Built by [Tim Nie](https://www.linkedin.com/in/tim-nie) · [timnie791@gmail.com](mailto:timnie791@gmail.com)

Portfolio project for the Transit App Business Intelligence Analyst role.
