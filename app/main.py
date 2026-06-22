"""
transit-explorer — Flask backend API

Endpoints:
    GET /api/stations           All stations with metadata
    GET /api/pois               All POIs (optional ?station=&category=)
    GET /api/recommend          Ranked recommendations (?station=&category=&limit=)
    GET /api/station/<id>       Station summary with top picks
    GET /api/go-content         GO Transit long-wait content recommendations
    GET /data/<filename>        Raw data files (for static-mode JS fallback)
"""

import json
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from app.recommender import rank_pois, get_station_summary

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
STATIC_DIR = ROOT / "app" / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")


def _load_stations() -> list:
    return json.loads((DATA_DIR / "stations.json").read_text())["stations"]


def _load_pois() -> list:
    live_file = DATA_DIR / "pois_live.json"
    if live_file.exists():
        data = json.loads(live_file.read_text())
        return data.get("pois", [])
    return json.loads((DATA_DIR / "pois.json").read_text())["pois"]


@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


@app.route("/api/stations")
def stations():
    return jsonify(_load_stations())


@app.route("/api/pois")
def pois():
    all_pois = _load_pois()
    station_filter = request.args.get("station")
    category_filter = request.args.get("category")

    result = all_pois
    if station_filter:
        result = [p for p in result if p["station_id"] == station_filter]
    if category_filter:
        result = [p for p in result if p["category"] == category_filter]

    return jsonify(result)


@app.route("/api/recommend")
def recommend():
    all_pois = _load_pois()
    station_filter = request.args.get("station")
    category_filter = request.args.get("category") or None
    limit = min(int(request.args.get("limit", 10)), 50)

    if station_filter:
        all_pois = [p for p in all_pois if p["station_id"] == station_filter]

    ranked = rank_pois(all_pois, category_filter=category_filter)
    return jsonify(ranked[:limit])


@app.route("/api/station/<station_id>")
def station_detail(station_id: str):
    stations = _load_stations()
    station = next((s for s in stations if s["id"] == station_id), None)
    if not station:
        return jsonify({"error": "Station not found"}), 404

    all_pois = _load_pois()
    summary = get_station_summary(station, all_pois)
    return jsonify(summary)


@app.route("/api/categories")
def categories():
    all_pois = _load_pois()
    cats = sorted(set(p["category"] for p in all_pois))
    return jsonify(cats)


@app.route("/api/go-content")
def go_content():
    go_file = DATA_DIR / "go_content.json"
    if not go_file.exists():
        return jsonify({"error": "GO content data not found"}), 404
    return jsonify(json.loads(go_file.read_text()))


@app.route("/data/<path:filename>")
def serve_data(filename):
    return send_from_directory(str(DATA_DIR), filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
