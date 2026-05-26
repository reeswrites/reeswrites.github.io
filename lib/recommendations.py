"""
Incrementally builds article recommendations using sentence-transformers.
Caches embeddings per post (by content hash) so only new/changed posts
are re-encoded. Outputs to _data/recommendations.json for Jekyll to
bake into HTML at build time — no browser JS needed.
"""

import json
import hashlib
import glob
import os
import sys
from pathlib import Path

import frontmatter
import numpy as np
from sentence_transformers import SentenceTransformer

POSTS_GLOB   = "_posts/*.md"
CACHE_FILE   = ".recommendations_cache/embeddings.json"
OUTPUT_FILE  = "_data/recommendations.json"
MODEL_NAME   = "BAAI/bge-base-en-v1.5"   # ~80MB, CPU-friendly
MIN_SIMILARITY = 0.30
TOP_N        = 5


def hash_content(text: str) -> str:
    """Short hash to detect content changes."""
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def load_cache(path: str) -> dict:
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def save_cache(path: str, cache: dict):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(cache, f)


def load_posts() -> list[dict]:
    """
    Load all posts. The key used here must match what the Liquid
    template derives from page.path (see _layouts/post.html).
    Key format: '2024-01-01-my-post' (stem of filename).
    """
    posts = []
    for path in sorted(glob.glob(POSTS_GLOB)):
        post = frontmatter.load(path)
        slug = post.get("slug") or Path(path).stem  # frontmatter slug overrides filename

        # Include title and tags in encoded text so they influence similarity
        tags  = " ".join(post.get("tags", []))
        title = post.get("title", "")
        description = post.get("description", "")
        text  = f"{title} {tags} {description} {post.content}".strip()

        posts.append({
            "slug":  slug,
            "title": title or slug,
            "description": description,
            "text":  text,
            "hash":  hash_content(text),
        })
    return posts


def get_embeddings(posts: list[dict], cache: dict) -> tuple[np.ndarray, bool]:
    """
    Return an embedding matrix for all posts.
    Only encodes posts whose content hash has changed since last run.
    Returns (matrix, cache_was_updated).
    """
    model    = None
    vectors  = []
    updated  = False

    for post in posts:
        slug   = post["slug"]
        cached = cache.get(slug)

        if cached and cached["hash"] == post["hash"]:
            vectors.append(np.array(cached["embedding"], dtype=np.float32))
        else:
            if model is None:
                print("  Loading model (first run or new posts found)...")
                model = SentenceTransformer(MODEL_NAME)
            print(f"  Encoding: {slug}")
            vec = model.encode(post["text"], normalize_embeddings=True)
            vectors.append(vec)
            cache[slug] = {"hash": post["hash"], "embedding": vec.tolist()}
            updated = True

    # Purge deleted posts from cache to keep it tidy
    live_slugs = {p["slug"] for p in posts}
    for stale in [k for k in cache if k not in live_slugs]:
        del cache[stale]
        updated = True

    return np.array(vectors, dtype=np.float32), updated


def compute_recommendations(posts: list[dict], embeddings: np.ndarray) -> dict:
    """
    Cosine similarity matrix (embeddings already L2-normalised,
    so dot product == cosine similarity). Returns top-N per post.
    """
    scores = embeddings @ embeddings.T  # shape: (n_posts, n_posts)
    recommendations = {}

    for i, post in enumerate(posts):
        row = scores[i]
        # Get indices sorted by score, excluding self
        ranked = [(j, float(row[j])) for j in np.argsort(-row) if j != i]
        # Apply threshold, then cap at TOP_N
        top = [
            {"slug": posts[j]["slug"], "title": posts[j]["title"], "description": posts[j]["description"]}
            for j, score in ranked
            if score >= MIN_SIMILARITY
        ][:TOP_N]
        recommendations[post["slug"]] = top  # may be fewer than TOP_N

    return recommendations


def main():
    posts = load_posts()
    if not posts:
        print("No posts found — nothing to do.")
        sys.exit(0)

    cache = load_cache(CACHE_FILE)
    print(f"Posts: {len(posts)} total, {len(cache)} previously cached.")

    embeddings, cache_changed = get_embeddings(posts, cache)

    if cache_changed:
        save_cache(CACHE_FILE, cache)
        print("  Cache saved.")
    else:
        print("  All embeddings up to date, cache unchanged.")

    recommendations = compute_recommendations(posts, embeddings)

    os.makedirs("_data", exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(recommendations, f, indent=2)

    print(f"Done. {len(recommendations)} posts → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()