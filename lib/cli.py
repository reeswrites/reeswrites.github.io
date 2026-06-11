import argparse
import logging
import sys
import time

import requests
from dotenv import load_dotenv
from git_tools import update_changelog
from jekyll_tools import create_draft, enrich_frontmatter, promote_draft
from stats import get_posts, show_posts_by_type, show_recent_post_stats

from lib.etl import config, sources

draft_directory = "_drafts"
post_directory = "_posts"


def get_stats(args: argparse.Namespace):
    posts = get_posts()
    show_posts_by_type(posts)
    show_recent_post_stats(posts)


def prepare(args: argparse.Namespace):
    load_dotenv()
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%y-%m-%d %H:%M:%S",
    )
    if args.dest:
        config.OUTPUT_DEST = args.dest
    if getattr(args, "force_enrich", False):
        config.FORCE_ENRICH = True
    sources_to_run = args.sources if args.sources else sources.DEFAULT_SOURCES
    for source_key in sources_to_run:
        logging.info(f"Regenerating {source_key}...")
        entry = sources.SOURCE_MAP[source_key]
        if isinstance(entry, sources.Source):
            sources.run_source(entry)
        else:
            entry()


def trakt_auth(args: argparse.Namespace) -> None:
    """One-time OAuth device-code flow for Trakt.  Prints tokens to copy into .env."""
    load_dotenv()
    client_id = args.client_id
    client_secret = args.client_secret
    if not client_id or not client_secret:
        print(
            "Usage: python lib/cli.py trakt-auth --client-id <id> --client-secret <secret>\n"
            "Create a Trakt application at https://trakt.tv/oauth/applications/new first."
        )
        sys.exit(1)

    # Step 1: request a device code
    resp = requests.post(
        "https://api.trakt.tv/oauth/device/code",
        json={"client_id": client_id},
    )
    resp.raise_for_status()
    code_data = resp.json()
    device_code = code_data["device_code"]
    interval = code_data.get("interval", 5)
    expires_in = code_data.get("expires_in", 600)

    print(f"\n  Visit: {code_data['verification_url']}")
    print(f"  Enter code: {code_data['user_code']}\n")
    print(f"Waiting for authorization (expires in {expires_in}s)...")

    # Step 2: poll until authorized or expired
    deadline = time.time() + expires_in
    while time.time() < deadline:
        time.sleep(interval)
        poll = requests.post(
            "https://api.trakt.tv/oauth/device/token",
            json={
                "code": device_code,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        if poll.status_code == 200:
            token_data = poll.json()
            print("\n✅  Authorized!  Add these to your .env file:\n")
            print(f"TRAKT_CLIENT_ID={client_id}")
            print("TRAKT_CLIENT_SECRET=<redacted>")
            print("TRAKT_ACCESS_TOKEN=<redacted>")
            print("TRAKT_REFRESH_TOKEN=<redacted>")
            return
        elif poll.status_code == 400:
            # authorization pending — keep polling
            print(".", end="", flush=True)
        elif poll.status_code == 409:
            print("\nDevice code already used.")
            sys.exit(1)
        elif poll.status_code == 410:
            print("\nDevice code expired.")
            sys.exit(1)
        else:
            print(f"\nUnexpected response {poll.status_code}: {poll.text}")
            sys.exit(1)

    print("\nAuthorization timed out.")
    sys.exit(1)


def _add_trakt_auth_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--client-id", help="Trakt API client ID")
    parser.add_argument("--client-secret", help="Trakt API client secret")


def _add_post_args(parser: argparse.ArgumentParser) -> None:
    """Shared flags reused across any subcommand that creates a post."""
    parser.add_argument("-t", "--title", help="Article title")
    parser.add_argument("-s", "--slug", help="URL slug")
    parser.add_argument("-d", "--description", help="Short description", default="")


def _add_prepare_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "sources",
        nargs="*",
        choices=list(sources.SOURCE_MAP.keys()),
        help=f"Data sources to regenerate (default: {', '.join(sources.DEFAULT_SOURCES)})",
    )
    parser.add_argument("--dest", help="Override output directory (default: ./_data)")
    parser.add_argument(
        "--force-enrich",
        action="store_true",
        default=False,
        help="Force TMDB re-enrichment even without a new export (fills missing fields)",
    )


if __name__ == "__main__":
    COMMANDS: dict[str, tuple] = {
        "changelog": (update_changelog, "Update changelog with recent commits", None),
        "draft": (create_draft, "Create a new draft post", _add_post_args),
        "enrich": (enrich_frontmatter, "Enrich frontmatter of existing posts", None),
        "prepare": (prepare, "Regenerate personal data JSON files", _add_prepare_args),
        "promote": (promote_draft, "Promote a draft to a post", None),
        "stats": (get_stats, "Show stats about posts", None),
        "trakt-auth": (
            trakt_auth,
            "One-time Trakt OAuth device-code authorization",
            _add_trakt_auth_args,
        ),
    }

    parser = argparse.ArgumentParser(
        description="Jekyll post scaffold generator.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", metavar="<command>")

    for name, (handler, help_text, add_args) in COMMANDS.items():
        p = sub.add_parser(name, help=help_text)
        if add_args:
            add_args(p)
        p.set_defaults(func=handler)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    args.func(args)
