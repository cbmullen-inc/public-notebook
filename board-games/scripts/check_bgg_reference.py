#!/usr/bin/env python3
"""Check that the board-game shelf stats match the BGG CSV reference."""

import argparse
import csv
import json
import re
import subprocess
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import StringIO
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
JSON_RELATIVE_PATH = "board-games/games.json"
CSV_RELATIVE_PATH = "board-games/scripts/board-games-bgg-reference.csv"
ONE_DECIMAL = Decimal("0.1")
FIELDS = (
    "objectid",
    "minplayers",
    "maxplayers",
    "minplaytime",
    "maxplaytime",
    "avgweight",
    "average",
    "bggrecagerange",
)


def read_staged_file(relative_path):
    result = subprocess.run(
        ["git", "-C", str(ROOT), "show", f":{relative_path}"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode:
        raise ValueError(
            f"Could not read staged {relative_path}; stage the file before committing."
        )
    return result.stdout


def read_inputs(staged):
    if staged:
        return (
            read_staged_file(JSON_RELATIVE_PATH),
            read_staged_file(CSV_RELATIVE_PATH),
        )

    return (
        (ROOT / JSON_RELATIVE_PATH).read_text(encoding="utf-8"),
        (ROOT / CSV_RELATIVE_PATH).read_text(encoding="utf-8-sig"),
    )


def parse_integer(value, game_name, label):
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"{game_name}: CSV value for {label} is not an integer: {value!r}"
        ) from exc


def parse_decimal(value, game_name, label):
    try:
        return Decimal(value).quantize(ONE_DECIMAL, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(
            f"{game_name}: CSV value for {label} is not a number: {value!r}"
        ) from exc


def display(value, unit=""):
    if value is None:
        return "not specified"
    return f"{value}{unit}"


def compare_collections(json_text, csv_text):
    collection = json.loads(json_text)
    if not isinstance(collection, dict) or not isinstance(
        collection.get("games"), list
    ):
        raise ValueError("games.json must contain a 'games' array")

    reader = csv.DictReader(StringIO(csv_text))
    if reader.fieldnames is None:
        raise ValueError("the BGG reference CSV is empty")
    missing_columns = [field for field in FIELDS if field not in reader.fieldnames]
    if missing_columns:
        raise ValueError(
            "the BGG reference CSV is missing columns: "
            + ", ".join(missing_columns)
        )

    reference = {}
    for row_number, row in enumerate(reader, start=2):
        raw_id = (row.get("objectid") or "").strip()
        if not raw_id:
            raise ValueError(f"CSV row {row_number} has no object ID")
        try:
            bgg_id = int(raw_id)
        except ValueError as exc:
            raise ValueError(
                f"CSV row {row_number} has an invalid object ID: {raw_id!r}"
            ) from exc
        if bgg_id in reference:
            raise ValueError(f"CSV contains duplicate object ID {bgg_id}")
        reference[bgg_id] = row

    differences = []
    matched_ids = set()
    for game in collection["games"]:
        if not isinstance(game, dict):
            differences.append("A games.json entry is not a game object.")
            continue

        name = game.get("name", "Unnamed game")
        link = game.get("link")
        bgg_id = link.get("bggId") if isinstance(link, dict) else None
        if not isinstance(bgg_id, int) or isinstance(bgg_id, bool):
            rpggeek_id = link.get("rpgGeekId") if isinstance(link, dict) else None
            url = link.get("url") if isinstance(link, dict) else None
            parsed_url = urlparse(url) if isinstance(url, str) else None
            rpggeek_match = (
                re.match(r"/rpgitem/(\d+)(?:/|$)", parsed_url.path)
                if parsed_url is not None
                else None
            )
            if (
                isinstance(rpggeek_id, int)
                and not isinstance(rpggeek_id, bool)
                and rpggeek_id > 0
                and parsed_url is not None
                and parsed_url.scheme == "https"
                and parsed_url.hostname in ("rpggeek.com", "www.rpggeek.com")
                and rpggeek_match is not None
                and rpggeek_match.group(1) == str(rpggeek_id)
            ):
                continue
            differences.append(f"{name}: no valid BGG ID to match against the CSV.")
            continue

        row = reference.get(bgg_id)
        if row is None:
            differences.append(f"{name} (BGG {bgg_id}): no matching CSV entry.")
            continue
        matched_ids.add(bgg_id)

        expected = (
            ("playersMin", "minplayers", "Minimum players", "", int),
            ("playersMax", "maxplayers", "Maximum players", "", int),
            ("minutes.min", "minplaytime", "Minimum play time", " min", int),
            ("minutes.max", "maxplaytime", "Maximum play time", " min", int),
            ("weight", "avgweight", "Complexity", " / 5", "decimal"),
            ("averageRating", "average", "Average rating", " / 10", "decimal"),
        )

        for json_path, csv_field, label, unit, value_type in expected:
            raw_value = (row.get(csv_field) or "").strip()
            if value_type == int:
                expected_value = parse_integer(raw_value, name, label)
            else:
                expected_value = parse_decimal(raw_value, name, label)

            actual_value = game
            path_parts = json_path.split(".")
            for part in path_parts:
                actual_value = (
                    actual_value.get(part)
                    if isinstance(actual_value, dict)
                    else None
                )
            if (
                value_type == "decimal"
                and isinstance(actual_value, (int, float))
                and not isinstance(actual_value, bool)
            ):
                try:
                    actual_value = Decimal(str(actual_value))
                except InvalidOperation:
                    pass
            if actual_value != expected_value:
                differences.append(
                    f"{name} (BGG {bgg_id}):\n"
                    f"  {label}: JSON has {display(actual_value, unit)}; "
                    f"CSV expects {display(expected_value, unit)}"
                )

        raw_age = (row.get("bggrecagerange") or "").strip()
        actual_age = game.get("recommendedAge")
        expected_age = raw_age or None
        if actual_age != expected_age:
            differences.append(
                f"{name} (BGG {bgg_id}):\n"
                f"  Recommended age: JSON has {display(actual_age)}; "
                f"CSV expects {display(expected_age)}"
            )

    return differences, len(collection["games"]), len(matched_ids), len(reference)


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Check that player counts, play time, complexity, recommended age, "
            "and average rating in games.json match the BGG reference CSV."
        )
    )
    parser.add_argument(
        "--staged",
        action="store_true",
        help="compare the versions staged for commit instead of working-tree files",
    )
    args = parser.parse_args()

    try:
        json_text, csv_text = read_inputs(args.staged)
        differences, game_count, matched_count, reference_count = compare_collections(
            json_text, csv_text
        )
    except (
        OSError,
        UnicodeError,
        json.JSONDecodeError,
        csv.Error,
        ValueError,
        subprocess.CalledProcessError,
    ) as exc:
        print(f"Could not check the BGG reference: {exc}", file=sys.stderr)
        return 1

    scope = "staged " if args.staged else ""
    if differences:
        print(f"BGG reference check found {len(differences)} difference(s):")
        for difference in differences:
            print(f"- {difference}")
        return 1

    unmatched_reference_count = reference_count - matched_count
    print(
        f"BGG reference check passed: {matched_count} BGG-linked games match "
        f"{scope}CSV values."
    )
    non_bgg_count = game_count - matched_count
    if non_bgg_count:
        print(
            f"Note: {non_bgg_count} non-BGG "
            f"game{' was' if non_bgg_count == 1 else 's were'} skipped."
        )
    if unmatched_reference_count:
        print(
            f"Note: {unmatched_reference_count} CSV entr"
            f"{'y is' if unmatched_reference_count == 1 else 'ies are'} "
            "not represented in games.json and were ignored."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
