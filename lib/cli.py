import argparse
import logging
import sys

from dotenv import load_dotenv

from git_tools import update_changelog
from jekyll_tools import create_draft, enrich_frontmatter, promote_draft
from lib.etl import config, sources
from stats import get_posts, show_posts_by_type, show_recent_post_stats

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
    sources_to_run = args.sources if args.sources else sources.DEFAULT_SOURCES
    for source_key in sources_to_run:
        logging.info(f"Regenerating {source_key}...")
        entry = sources.SOURCE_MAP[source_key]
        if isinstance(entry, sources.Source):
            sources.run_source(entry)
        else:
            entry()


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


if __name__ == "__main__":
    COMMANDS: dict[str, tuple] = {
        "changelog": (update_changelog, "Update changelog with recent commits", None),
        "draft": (create_draft, "Create a new draft post", _add_post_args),
        "enrich": (enrich_frontmatter, "Enrich frontmatter of existing posts", None),
        "prepare": (prepare, "Regenerate personal data JSON files", _add_prepare_args),
        "promote": (promote_draft, "Promote a draft to a post", None),
        "stats": (get_stats, "Show stats about posts", None),
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
