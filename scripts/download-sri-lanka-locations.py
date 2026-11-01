"""Download and extract the upstream location dump without executing its SQL."""

import ast
import json
from pathlib import Path
import re
from urllib.request import urlopen

REVISION = "6f8532405d67c9ee6763f2f27691ff1ea943d075"
BASE = f"https://raw.githubusercontent.com/shendew/provinces_cities_srilanka/{REVISION}"
OUTPUT = Path(__file__).resolve().parents[1] / "src/data/sri-lanka"


def download(path):
    with urlopen(f"{BASE}/{path}", timeout=30) as response:
        return response.read().decode("utf-8")


def rows(sql, table):
    match = re.search(rf"INSERT INTO `{table}` .*? VALUES\s*(.*?);", sql, re.S)
    if not match:
        raise ValueError(f"Missing {table} records")
    return [ast.literal_eval(line.rstrip(",")) for line in match[1].splitlines()]


def main():
    sql = download("Database%20Files/thedevsl_provinces_cities_api.sql")
    provinces = [
        {"id": r[0], "name": r[1].strip(), "nameSi": r[2].strip(), "nameTa": r[3].strip()}
        for r in rows(sql, "Provinces")
    ]
    districts = [
        {"id": r[0], "name": r[1].strip(), "provinceId": r[2], "nameSi": r[3].strip(), "nameTa": r[4].strip()}
        for r in rows(sql, "Districts")
    ]
    cities = [
        {"id": r[0], "name": r[1].strip(), "nameSi": r[2].strip(), "nameTa": r[3].strip(), "districtId": r[4], "provinceId": r[5]}
        for r in rows(sql, "Cities")
    ]
    province_ids = {p["id"] for p in provinces}
    district_provinces = {d["id"]: d["provinceId"] for d in districts}
    if len(provinces) != 9 or len(districts) != 25 or len(cities) != 331:
        raise ValueError("Unexpected upstream record counts; review the source before updating")
    for records in (provinces, districts, cities):
        if len({r["id"] for r in records}) != len(records) or any(not r["name"] for r in records):
            raise ValueError("Duplicate IDs or empty location names")
    if any(d["provinceId"] not in province_ids for d in districts):
        raise ValueError("Invalid district province reference")
    if any(district_provinces.get(c["districtId"]) != c["provinceId"] for c in cities):
        raise ValueError("Invalid city district/province reference")
    data = {"provinces": provinces, "districts": districts, "cities": cities}
    license_text = download("LICENSE")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "locations.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    (OUTPUT / "LICENSE").write_text(license_text)
    print(f"Downloaded {len(provinces)} provinces, {len(districts)} districts and {len(cities)} cities/divisions")


if __name__ == "__main__":
    main()
