"""
Google Places API data collector.

Fetches nearby places for each TTC station and normalizes them
into the transit-explorer POI schema. Results are cached to disk.

Usage:
    python -m app.data_collector --station finch
    python -m app.data_collector --all
"""

import json
import os
import math
import argparse
from pathlib import Path
from datetime import datetime

try:
    import googlemaps
    GMAPS_AVAILABLE = True
except ImportError:
    GMAPS_AVAILABLE = False

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
CACHE_FILE = DATA_DIR / "pois_live.json"


CATEGORY_MAP = {
    "restaurant": "restaurant",
    "cafe": "cafe",
    "bar": "restaurant",
    "bakery": "cafe",
    "food": "restaurant",
    "store": "shopping",
    "shopping_mall": "shopping",
    "supermarket": "shopping",
    "grocery_or_supermarket": "shopping",
    "park": "park",
    "museum": "culture",
    "art_gallery": "culture",
    "library": "culture",
    "tourist_attraction": "attraction",
    "point_of_interest": "attraction",
    "gym": "wellness",
    "spa": "wellness",
    "health": "wellness",
}

PRICE_MAP = {1: 1, 2: 2, 3: 3, 4: 4}


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def guess_category(types: list[str]) -> str:
    for t in types:
        if t in CATEGORY_MAP:
            return CATEGORY_MAP[t]
    return "attraction"


def walk_minutes(distance_m: float) -> int:
    return max(1, round(distance_m / 80))


def normalize_place(place: dict, station: dict) -> dict | None:
    """Convert a Google Places result to our POI schema."""
    loc = place.get("geometry", {}).get("location", {})
    if not loc:
        return None

    lat, lng = loc["lat"], loc["lng"]
    dist = haversine_m(station["lat"], station["lng"], lat, lng)
    if dist > station.get("walkingRadius_m", 800):
        return None

    types = place.get("types", [])
    category = guess_category(types)

    return {
        "id": f"live_{place['place_id'][:12]}",
        "name": place.get("name", "Unknown"),
        "category": category,
        "subcategory": types[0].replace("_", " ").title() if types else "Place",
        "station_id": station["id"],
        "lat": lat,
        "lng": lng,
        "distance_m": round(dist),
        "walk_minutes": walk_minutes(dist),
        "rating": place.get("rating", 0.0),
        "review_count": place.get("user_ratings_total", 0),
        "price_level": PRICE_MAP.get(place.get("price_level"), 2),
        "address": place.get("vicinity", ""),
        "hours_today": "See Google Maps for hours",
        "tags": [t.replace("_", " ") for t in types[:5]],
        "highlight": "",
        "tourist_tip": "",
        "google_maps_url": f"https://maps.google.com/?place_id={place['place_id']}",
        "photo_url": None,
        "_source": "google_places_live",
        "_fetched_at": datetime.utcnow().isoformat(),
    }


def fetch_for_station(gmaps, station: dict, types: list[str], radius_m: int = 600) -> list[dict]:
    """Call Places nearbySearch for a station and return normalized POIs."""
    pois = []
    for place_type in types:
        results = gmaps.places_nearby(
            location=(station["lat"], station["lng"]),
            radius=radius_m,
            type=place_type,
            open_now=False,
        )
        for place in results.get("results", []):
            poi = normalize_place(place, station)
            if poi and poi["rating"] >= 3.5 and poi["review_count"] >= 20:
                pois.append(poi)

    # Deduplicate by place_id prefix
    seen = set()
    unique = []
    for p in pois:
        if p["id"] not in seen:
            seen.add(p["id"])
            unique.append(p)
    return unique


def collect_all(api_key: str) -> list[dict]:
    """Fetch live POI data for all stations and cache to disk."""
    if not GMAPS_AVAILABLE:
        raise ImportError("Install googlemaps: pip install googlemaps")

    gmaps = googlemaps.Client(key=api_key)
    stations_path = DATA_DIR / "stations.json"
    stations = json.loads(stations_path.read_text())["stations"]

    fetch_types = ["restaurant", "cafe", "bar", "shopping_mall", "store",
                   "museum", "park", "tourist_attraction", "gym"]

    all_pois = []
    for station in stations:
        print(f"Fetching POIs for {station['name']}...")
        pois = fetch_for_station(gmaps, station, fetch_types)
        all_pois.extend(pois)
        print(f"  Found {len(pois)} qualifying POIs")

    CACHE_FILE.write_text(json.dumps({"pois": all_pois, "fetched_at": datetime.utcnow().isoformat()}, indent=2))
    print(f"\nSaved {len(all_pois)} POIs to {CACHE_FILE}")
    return all_pois


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Collect live POI data from Google Places API")
    parser.add_argument("--api-key", default=os.getenv("GOOGLE_MAPS_API_KEY"), help="Google Maps API key")
    parser.add_argument("--station", help="Collect for a specific station ID only")
    parser.add_argument("--all", action="store_true", help="Collect for all stations")
    args = parser.parse_args()

    if not args.api_key:
        print("Error: set GOOGLE_MAPS_API_KEY env var or pass --api-key")
        raise SystemExit(1)

    collect_all(args.api_key)
