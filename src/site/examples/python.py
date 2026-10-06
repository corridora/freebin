import json
import os
import urllib.request

BASE_URL = os.getenv("FREEBIN_URL", "https://freebin.org").rstrip("/")
API_KEY = os.environ["FREEBIN_API_KEY"]


def freebin(path, method="GET", payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Authorization": f"Bearer {API_KEY}"}
    if body:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(BASE_URL + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def list_bins():
    return freebin("/api/v1/bins")


def create_bin(name):
    return freebin("/api/v1/bins", "POST", {"name": name, "termsAccepted": True})


def list_requests(bin_id, limit=50):
    return freebin(f"/api/v1/bins/{bin_id}/interactions?limit={limit}")
