#!/usr/bin/env python3
"""Check or repair complexity tags using each game's rounded BGG weight."""

import argparse
import json
import subprocess
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
JSON_RELATIVE_PATH = "board-games/games.json"
COMPLEXITY_TAGS = ("light", "medium", "heavy")
ONE_DECIMAL = Decimal("0.1")


def read_collection(staged):
    if staged:
        result = subprocess.run(
            ["git", "-C", str(ROOT), "show", f":{JSON_RELATIVE_PATH}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if result.returncode:
            raise ValueError(
                "Could not read staged games.json; stage the file before committing."
            )
        content = result.stdout
    else:
        content = (ROOT / JSON_RELATIVE_PATH).read_text(encoding="utf-8")

    return json.loads(content)


def expected_complexity_tag(weight, game_name):
    if isinstance(weight, bool) or not isinstance(weight, (int, float)):
        raise ValueError(f"{game_name}: complexity weight must be a number")
    try:
        rounded_weight = Decimal(str(weight)).quantize(
            ONE_DECIMAL, rounding=ROUND_HALF_UP
        )
    except InvalidOperation as exc:
        raise ValueError(f"{game_name}: invalid complexity weight {weight!r}") from exc

    if not Decimal("0") <= rounded_weight <= Decimal("5"):
        raise ValueError(f"{game_name}: complexity weight must be from 0 to 5")
    if rounded_weight == Decimal("0"):
        return None
    if rounded_weight < Decimal("2"):
        return "light"
    if rounded_weight < Decimal("3"):
        return "medium"
    return "heavy"


def complexity_tag_mismatches(collection):
    if not isinstance(collection, dict) or not isinstance(collection.get("games"), list):
        raise ValueError("games.json must contain a 'games' array")

    mismatches = []
    for game in collection["games"]:
        if not isinstance(game, dict):
            raise ValueError("games.json contains an entry that is not a game object")
        name = game.get("name", "Unnamed game")
        expected = expected_complexity_tag(game.get("weight"), name)
        tags = game.get("tags")
        if not isinstance(tags, list):
            raise ValueError(f"{name}: tags must be an array")
        actual = [tag for tag in tags if tag in COMPLEXITY_TAGS]
        if actual != ([expected] if expected else []):
            mismatches.append((game, actual, expected))
    return mismatches


def replace_complexity_tag(game, expected):
    tags = game["tags"]
    existing_indexes = [
        index for index, tag in enumerate(tags) if tag in COMPLEXITY_TAGS
    ]
    insert_at = min(existing_indexes) if existing_indexes else len(tags)
    retained_tags = [tag for tag in tags if tag not in COMPLEXITY_TAGS]
    insert_at = min(insert_at, len(retained_tags))
    if expected is not None:
        retained_tags.insert(insert_at, expected)
    game["tags"] = retained_tags


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Check that each game's light/medium/heavy tag matches its "
            "complexity weight rounded to one decimal place."
        )
    )
    parser.add_argument(
        "--staged",
        action="store_true",
        help="check the staged games.json instead of the working-tree file",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="repair stale complexity tags in the working-tree games.json",
    )
    args = parser.parse_args()
    if args.staged and args.fix:
        parser.error("--fix cannot be used with --staged")

    try:
        collection = read_collection(args.staged)
        mismatches = complexity_tag_mismatches(collection)
        if mismatches and args.fix:
            for game, _, expected in mismatches:
                replace_complexity_tag(game, expected)
            json_path = ROOT / JSON_RELATIVE_PATH
            with json_path.open("w", encoding="utf-8", newline="\n") as output:
                json.dump(collection, output, ensure_ascii=False, indent=2)
                output.write("\n")
            fixed_count = len(mismatches)
            mismatches = complexity_tag_mismatches(collection)
            print(f"Updated complexity tags for {fixed_count} game(s).")
    except (
        OSError,
        UnicodeError,
        json.JSONDecodeError,
        ValueError,
        subprocess.SubprocessError,
    ) as exc:
        print(f"Could not check complexity tags: {exc}", file=sys.stderr)
        return 1

    if mismatches:
        print(f"Complexity tag check found {len(mismatches)} mismatch(es):")
        for game, actual, expected in mismatches:
            name = game.get("name", "Unnamed game")
            weight = Decimal(str(game["weight"])).quantize(
                ONE_DECIMAL, rounding=ROUND_HALF_UP
            )
            actual_text = ", ".join(actual) if actual else "none"
            expected_text = f"'{expected}' tag" if expected else "no complexity tag"
            print(
                f"- {name}: weight {weight:.1f} expects {expected_text}; "
                f"found {actual_text}"
            )
        return 1

    print(f"Complexity tag check passed: all {len(collection['games'])} games match.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
