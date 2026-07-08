# Design — Home / Dashboard

Source artifact: [`home-concepts.html`](home-concepts.html) — a self-contained, interactive mockup
of the ranked home screen (open it in a browser). It bundles two competing concepts; the
**chosen direction is 1a "Workshop Ledger."** 1b is retained in the file as a recorded alternative.

## Chosen direction — 1a "Workshop Ledger"

- **Top bar**: `diy·shed` wordmark (rotated amber diamond glyph) on the left, `+ Add Project` button on the right.
- **Weight control**: full-width slider directly under the bar, labelled *"More time than money ↔ More money than time"*, with a live readout (`N% effort · M% cost`). Adjusting it re-ranks the list immediately (FR5.3).
- **Ranked list**: spacious cards, one per project. Each card shows rank number, name, priority pill, description, an effort bar (Low/Med/High), `N missing item(s)`, and estimated cost `$X` (FR5.5).
- **Researching state**: projects still being researched render as a dashed card with pulsing dots and *"Researching guides, tools & cost…"* until they flip to `ready` (FR2.3).
- **Add Project**: a slide-over panel from the right with Name, Description, and a Priority picker (4 levels); primary action is *"Add & Start Research."*

1b "Shop Floor Table" is the same data as a dense table (`# · Project · Priority · Effort · Missing · Cost`)
with a dark sidebar and centered modal — kept as a fallback if the card layout doesn't scale to many projects.

## Design language

| Token | Value |
|-------|-------|
| Heading / project-name font | **Bitter** (serif), weights 700–800 |
| UI / body font | **Karla** (sans-serif), weights 400–700 |
| Page background | `oklch(94% 0.015 75)` — warm cream |
| Header / dark surfaces | `oklch(28% 0.045 50)` (1a bar) / `oklch(21% 0.035 45)` (sidebar) — dark brown |
| Accent (buttons, logo glyph) | `oklch(64% 0.13 75)` — amber/gold |
| Primary / links / cost | `oklch(48% 0.09 55)` — rust |
| Surfaces | rounded cards (`10–12px`), pill priority badges (`100px`), soft shadows |

## Priority → colour (matches FR1.5 / FR5.4)

| Priority | Weight | Badge colour |
|----------|--------|--------------|
| Urgent Fix | `1.0` | red `oklch(52% 0.16 30)` |
| Highly Desired | `0.75` | gold `oklch(60% 0.13 65)` |
| Slightly Desired | `0.3` | green `oklch(55% 0.09 145)` |
| Dreams | `0.05` | muted `oklch(58% 0.025 90)` |

## Ranking model shown in the mockup (reconciles FR5.2 / TR4)

The mockup implements FR5 exactly, with one clarification: the effort-vs-cost weighting is a **single
slider** where the two weights are complementary — `w_cost = 1 − w_effort` — rather than two independent
settings. So only one value needs to be stored (see the `w_effort` note in TR4 / FR5.2).

```
effort_norm = {Low:1, Medium:2, High:3}[effort] / 3
cost_norm   = cost / max_cost_across_ready_projects
base_score  = w_effort · effort_norm + w_cost · cost_norm      // w_cost = 1 − w_effort
final_score = base_score / priority_weight                      // lower ranks higher
```
