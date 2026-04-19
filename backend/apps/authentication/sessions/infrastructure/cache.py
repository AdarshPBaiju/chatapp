import logging
import requests
from math import atan2, cos, radians, sin, sqrt
from typing import Any

from django.core.cache import cache

logger = logging.getLogger("core")


class GeoLocationService:
    @staticmethod
    def get_location_from_ip(ip_address: str) -> dict[str, Any]:
        cache_key = f"geoip:{ip_address}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            # Using ip-api.com for free geolocation (demo purposes)
            resp = requests.get(f"http://ip-api.com/json/{ip_address}", timeout=3)
            data = resp.json()
            if data.get("status") == "success":
                location = {
                    "city": data.get("city"),
                    "country_code": data.get("countryCode"),
                    "lat": data.get("lat"),
                    "lon": data.get("lon"),
                }
                cache.set(cache_key, location, timeout=86400)
                return location
        except Exception:
            logger.exception(f"GeoIP resolution failed for {ip_address}")

        return {"city": "", "country_code": "", "lat": None, "lon": None}

    @staticmethod
    def normalize_location(location: dict[str, Any] | None) -> dict[str, Any]:
        if not location:
            return {"city": "", "country_code": "", "lat": None, "lon": None}
        return {
            "city": location.get("city") or "",
            "country_code": location.get("country_code") or "",
            "lat": location.get("lat"),
            "lon": location.get("lon"),
        }

    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Haversine distance in km."""
        r = 6371.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = (
            sin(dlat / 2) ** 2
            + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        )
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
