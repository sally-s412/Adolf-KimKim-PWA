"""Trusted scheduler entry point. Credentials come only from environment."""
import json
import os
import sys
import urllib.request
from urllib.parse import urlsplit

origin = os.environ["CAPSULE_PUBLIC_ORIGIN"].rstrip("/")
secret = os.environ["CAPSULE_DISPATCH_SECRET"]
parts = urlsplit(origin)
if parts.scheme != "https" or not parts.hostname or parts.path or parts.query or parts.fragment or len(secret) < 32:
    sys.exit("Invalid capsule scheduler configuration")
request = urllib.request.Request(origin + "/api/capsules/dispatch", method="POST",
    headers={"X-Capsule-Secret": secret})
try:
    with urllib.request.urlopen(request, timeout=90) as response:
        if response.status != 200:
            sys.exit("Capsule dispatch failed")
        result = json.load(response)
        if result.get("failed") or result.get("deliveryUnknown"):
            sys.exit("Capsule deliveries need review; inspect backend delivery status")
        print("Capsule dispatch completed")
except Exception:
    sys.exit("Capsule dispatch failed; inspect backend delivery status")
