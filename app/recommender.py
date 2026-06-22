"""
Recommendation scoring engine for transit-explorer.

Scores POIs based on rating quality, review volume, and walking distance
from a transit station. Designed for tourist-friendly recommendations.
"""

import math
from typing import Optional


CATEGORY_WEIGHTS = {
    "restaurant": 1.0,
    "cafe": 0.95,
    "attraction": 1.1,
    "culture": 1.05,
    "park": 0.9,
    "shopping": 0.85,
    "wellness": 0.8,
}

WALK_PENALTY_PER_100M = 0.05


def score_poi(
    rating: float,
    review_count: int,
    distance_m: float,
    category: str,
    max_distance_m: float = 800,
) -> float:
    """
    Composite tourist-friendliness score.

    Formula:
        base = rating * log10(reviews + 1)
        distance_factor = 1 - (distance / max_distance) * walk_penalty
        category_weight = lookup by category type
        score = base * distance_factor * category_weight

    Returns a float in roughly [0, 10]. Higher is better.
    """
    if distance_m > max_distance_m:
        return 0.0

    base = rating * math.log10(review_count + 1)
    distance_factor = max(0.0, 1.0 - (distance_m / max_distance_m) * WALK_PENALTY_PER_100M * 8)
    weight = CATEGORY_WEIGHTS.get(category, 1.0)

    return round(base * distance_factor * weight, 3)


def rank_pois(pois: list, category_filter: Optional[str] = None) -> list:
    """
    Score and rank a list of POI dicts, optionally filtered by category.
    Attaches a 'score' field to each POI and returns sorted descending.
    """
    results = []
    for poi in pois:
        if category_filter and poi.get("category") != category_filter:
            continue

        poi_copy = dict(poi)
        poi_copy["score"] = score_poi(
            rating=poi["rating"],
            review_count=poi["review_count"],
            distance_m=poi["distance_m"],
            category=poi["category"],
        )
        results.append(poi_copy)

    return sorted(results, key=lambda p: p["score"], reverse=True)


def get_station_summary(station: dict, pois: list) -> dict:
    """
    Build a summary dict for a station including top picks by category.
    """
    station_pois = [p for p in pois if p["station_id"] == station["id"]]
    ranked = rank_pois(station_pois)

    categories = {}
    for poi in ranked:
        cat = poi["category"]
        if cat not in categories:
            categories[cat] = []
        if len(categories[cat]) < 3:
            categories[cat].append(poi)

    return {
        "station": station,
        "total_pois": len(station_pois),
        "top_picks": ranked[:5],
        "by_category": categories,
        "avg_rating": round(
            sum(p["rating"] for p in station_pois) / len(station_pois), 2
        ) if station_pois else 0,
    }
