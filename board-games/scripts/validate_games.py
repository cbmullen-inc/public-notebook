#!/usr/bin/env python3
"""Validate the board-games/games.json collection structure and references."""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


def reject_constant(value):
    raise ValueError(f"invalid JSON constant {value!r}")


def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON object key {key!r}")
        result[key] = value
    return result


def is_nonempty_string(value):
    return isinstance(value, str) and bool(value.strip())


def is_positive_integer(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate(data):
    errors = []

    def error(path, message, game_name=None):
        if game_name:
            errors.append(f"{path} ({game_name}): {message}")
        else:
            errors.append(f"{path}: {message}")

    if not isinstance(data, dict):
        return ["$: expected a JSON object"]

    categories = data.get("tagCategories")
    tags = data.get("tags")
    games = data.get("games")

    if not isinstance(categories, list):
        error("$.tagCategories", "expected an array")
        categories = []
    if not isinstance(tags, list):
        error("$.tags", "expected an array")
        tags = []
    if not isinstance(games, list):
        error("$.games", "expected an array")
        games = []

    category_ids = set()
    for index, category in enumerate(categories):
        path = f"$.tagCategories[{index}]"
        if not isinstance(category, dict):
            error(path, "expected an object")
            continue
        category_id = category.get("id")
        if not is_nonempty_string(category_id):
            error(f"{path}.id", "expected a non-empty string")
        elif category_id in category_ids:
            error(f"{path}.id", f"duplicate category ID {category_id!r}")
        else:
            category_ids.add(category_id)
        if not is_nonempty_string(category.get("label")):
            error(f"{path}.label", "expected a non-empty string")
        if not isinstance(category.get("showInRows"), bool):
            error(f"{path}.showInRows", "expected a boolean")

    tag_ids = set()
    for index, tag in enumerate(tags):
        path = f"$.tags[{index}]"
        if not isinstance(tag, dict):
            error(path, "expected an object")
            continue
        tag_id = tag.get("id")
        if not is_nonempty_string(tag_id):
            error(f"{path}.id", "expected a non-empty string")
        elif tag_id in tag_ids:
            error(f"{path}.id", f"duplicate tag ID {tag_id!r}")
        else:
            tag_ids.add(tag_id)
        if not is_nonempty_string(tag.get("label")):
            error(f"{path}.label", "expected a non-empty string")
        category_id = tag.get("category")
        if not isinstance(category_id, str) or category_id not in category_ids:
            error(f"{path}.category", f"unknown category ID {category_id!r}")

    seen_bgg_ids = {}
    for index, game in enumerate(games):
        path = f"$.games[{index}]"
        if not isinstance(game, dict):
            error(path, "expected an object")
            continue

        game_name = game.get("name")
        game_error = lambda message, fallback_path=None, *, game_name=game_name: error(
            fallback_path or path,
            message,
            game_name=game_name if is_nonempty_string(game_name) else None,
        )

        if not is_nonempty_string(game_name):
            error(f"{path}.name", "expected a non-empty string")

        link = game.get("link")
        if not isinstance(link, dict):
            game_error("expected an object", f"{path}.link")
        else:
            link_type = link.get("type")
            if link_type not in ("game", "search"):
                game_error("expected 'game' or 'search'", f"{path}.link.type")
            url = link.get("url")
            parsed_url = None
            if not is_nonempty_string(url):
                game_error("expected a non-empty URL", f"{path}.link.url")
            else:
                try:
                    parsed_url = urlparse(url)
                except ValueError as exc:
                    parsed_url = None
                    game_error(f"invalid URL: {exc}", f"{path}.link.url")
                if parsed_url and (
                    parsed_url.scheme != "https"
                    or parsed_url.hostname
                    not in ("boardgamegeek.com", "www.boardgamegeek.com")
                ):
                    game_error("expected an HTTPS BoardGameGeek URL", f"{path}.link.url")

            if link_type == "game":
                bgg_id = link.get("bggId")
                if not is_positive_integer(bgg_id):
                    game_error("expected a positive integer", f"{path}.link.bggId")
                else:
                    previous = seen_bgg_ids.get(bgg_id)
                    if previous is not None:
                        game_error(
                            f"duplicates BGG ID {bgg_id} used at {previous}",
                            f"{path}.link.bggId",
                        )
                    else:
                        seen_bgg_ids[bgg_id] = path
                    url_game_id = None
                    if parsed_url:
                        match = re.match(r"/boardgame/(\d+)(?:/|$)", parsed_url.path)
                        if match:
                            url_game_id = match.group(1)
                    if parsed_url and url_game_id != str(bgg_id):
                        game_error(
                            f"URL game ID must match bggId {bgg_id}",
                            f"{path}.link.url",
                        )
                if not isinstance(link.get("verified"), bool):
                    game_error("expected a boolean", f"{path}.link.verified")
            elif "bggId" in link:
                game_error(
                    "search links must not claim a BGG game ID",
                    f"{path}.link.bggId",
                )

        for key in ("playersMin", "playersMax"):
            if not is_positive_integer(game.get(key)):
                game_error("expected a positive integer", f"{path}.{key}")
        players_min = game.get("playersMin")
        players_max = game.get("playersMax")
        if (
            is_positive_integer(players_min)
            and is_positive_integer(players_max)
            and players_min > players_max
        ):
            game_error("playersMin must not exceed playersMax", path)

        minutes = game.get("minutes")
        if not isinstance(minutes, dict):
            game_error("expected an object", f"{path}.minutes")
        else:
            for key in ("min", "max"):
                if not is_positive_integer(minutes.get(key)):
                    game_error("expected a positive integer", f"{path}.minutes.{key}")
            minutes_min = minutes.get("min")
            minutes_max = minutes.get("max")
            if (
                is_positive_integer(minutes_min)
                and is_positive_integer(minutes_max)
                and minutes_min > minutes_max
            ):
                game_error("min must not exceed max", f"{path}.minutes")

        weight = game.get("weight")
        if not is_number(weight) or not 0 <= weight <= 5:
            game_error("expected a number from 0 to 5", f"{path}.weight")

        game_tags = game.get("tags")
        if not isinstance(game_tags, list):
            game_error("expected an array", f"{path}.tags")
        else:
            found_tags = set()
            for tag_index, tag_id in enumerate(game_tags):
                tag_path = f"{path}.tags[{tag_index}]"
                if not is_nonempty_string(tag_id):
                    game_error("expected a non-empty tag ID", tag_path)
                elif tag_id not in tag_ids:
                    game_error(f"unknown tag ID {tag_id!r}", tag_path)
                elif tag_id in found_tags:
                    game_error(f"duplicate tag ID {tag_id!r}", tag_path)
                else:
                    found_tags.add(tag_id)

        if not is_nonempty_string(game.get("description")):
            game_error("expected a non-empty string", f"{path}.description")
        if "owners" in game:
            owners = game["owners"]
            if not isinstance(owners, list) or not owners:
                game_error("expected a non-empty array", f"{path}.owners")
            else:
                for owner_index, owner in enumerate(owners):
                    if not is_nonempty_string(owner):
                        game_error(
                            "expected a non-empty string",
                            f"{path}.owners[{owner_index}]",
                        )
        elif not is_nonempty_string(game.get("owner")):
            game_error("expected a non-empty string", f"{path}.owner")

    return errors


def main():
    parser = argparse.ArgumentParser(
        description="Validate a BoardGameGeek board-game collection JSON file."
    )
    parser.add_argument(
        "file",
        help="path to games.json, or '-' to read JSON from standard input",
    )
    args = parser.parse_args()

    try:
        if args.file == "-":
            data = json.load(
                sys.stdin,
                parse_constant=reject_constant,
                object_pairs_hook=reject_duplicate_keys,
            )
        else:
            collection_path = Path(args.file)
            if not collection_path.is_absolute() and not collection_path.exists():
                collection_path = Path(__file__).resolve().parent.parent / collection_path
            with collection_path.open(encoding="utf-8") as collection_file:
                data = json.load(
                    collection_file,
                    parse_constant=reject_constant,
                    object_pairs_hook=reject_duplicate_keys,
                )
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        print(f"Invalid JSON: {exc}", file=sys.stderr)
        return 1

    errors = validate(data)
    if errors:
        print(f"Validation failed with {len(errors)} error(s):", file=sys.stderr)
        for message in errors:
            print(f"- {message}", file=sys.stderr)
        return 1

    print(f"Valid collection: {len(data['games'])} games, {len(data['tags'])} tags.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
