"""
build_data.py
Generates both _data/recommendations.json and _data/graph.json from Jekyll posts.

Embeddings are cached by slug (keyed on content hash) so only new/changed
posts are re-encoded. UMAP layout and cosine similarity are computed from
the same embedding matrix in one pass.
"""

import glob
import hashlib
import json
import os
import sys
from pathlib import Path

import frontmatter
import numpy as np
from sentence_transformers import SentenceTransformer

try:
    from umap import UMAP
except ImportError:
    sys.exit("Missing dep — run: pip install umap-learn")

# ── Config ────────────────────────────────────────────────────────────────────

POSTS_GLOB = "_posts/*.md"
CACHE_FILE = ".recommendations_cache/embeddings.json"
RECS_OUTPUT = "_data/recommendations.json"
GRAPH_OUTPUT = "_data/graph.json"
MODEL_NAME = "BAAI/bge-large-en-v1.5"

# Recommendations
MIN_SIMILARITY = 0.30
TOP_N_RECS = 5

# Graph semantic edges
SIMILARITY_THRESHOLD = 0.75
TOP_N_SEMANTIC = 5


# ── Post loading ──────────────────────────────────────────────────────────────


def normalise_tags(raw) -> list[str]:
    if not raw:
        return []
    return [str(t) for t in raw] if isinstance(raw, list) else [str(raw)]


def slug_from_url(url: str) -> str:
    return url.rstrip("/").split("/")[-1]


def hash_content(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def load_posts() -> dict[str, dict]:
    """
    Load all posts, keyed by slug. The encoded text blends title, tags,
    description, and body so all fields influence embedding similarity.
    """
    posts = {}
    for path in sorted(glob.glob(POSTS_GLOB)):
        post = frontmatter.load(path)
        slug = str(post.get("slug") or Path(path).stem)
        title = str(post.get("title") or slug)
        tags = normalise_tags(post.get("tags"))
        desc = str(post.get("description") or "")
        date = str(post.get("publish_datetime") or post.get("date") or "")[:10]

        internal_links = (post.metadata.get("links") or {}).get("internal") or []

        encode_text = f"{title} {' '.join(tags)} {desc} {post.content}".strip()

        posts[slug] = {
            "slug": slug,
            "title": title,
            "description": desc,
            "date": date,
            "tags": tags,
            "url": f"/posts/{slug}",
            "internal_links": internal_links,
            "encode_text": encode_text,
            "hash": hash_content(encode_text),
        }
    return posts


# ── Embedding cache ───────────────────────────────────────────────────────────


def load_cache(path: str) -> dict:
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def save_cache(path: str, cache: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(cache, f)


def get_embeddings(
    posts: dict[str, dict], cache: dict
) -> tuple[np.ndarray, list[str], bool]:
    """
    Return (embedding_matrix, ordered_slugs, cache_was_updated).
    Embeddings are L2-normalised, so dot product == cosine similarity.
    Only re-encodes posts whose content hash has changed.
    """
    model = None
    vectors = []
    slugs = []
    updated = False

    for slug, post in posts.items():
        cached = cache.get(slug)
        if cached and cached.get("hash") == post["hash"]:
            vectors.append(np.array(cached["embedding"], dtype=np.float32))
        else:
            if model is None:
                print("  Loading model (first run or new/changed posts found)…")
                model = SentenceTransformer(MODEL_NAME)
            print(f"  Encoding: {slug}")
            vec = model.encode(post["encode_text"], normalize_embeddings=True)
            vectors.append(vec)
            cache[slug] = {"hash": post["hash"], "embedding": vec.tolist()}
            updated = True
        slugs.append(slug)

    # Purge stale slugs from cache
    for stale in [k for k in list(cache) if k not in posts]:
        del cache[stale]
        updated = True

    return np.array(vectors, dtype=np.float32), slugs, updated


# ── Similarity matrix (shared) ────────────────────────────────────────────────


def similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """
    Cosine similarity via dot product (embeddings are L2-normalised).
    Shape: (n, n).
    """
    return embeddings @ embeddings.T


# ── Recommendations ───────────────────────────────────────────────────────────


def compute_recommendations(
    posts: dict[str, dict],
    slugs: list[str],
    sim: np.ndarray,
) -> dict[str, list[dict]]:
    recommendations = {}
    for i, slug in enumerate(slugs):
        ranked = sorted(
            ((j, float(sim[i, j])) for j in range(len(slugs)) if j != i),
            key=lambda x: -x[1],
        )
        top = [
            {
                "slug": slugs[j],
                "title": posts[slugs[j]]["title"],
                "description": posts[slugs[j]]["description"],
            }
            for j, score in ranked
            if score >= MIN_SIMILARITY
        ][:TOP_N_RECS]
        recommendations[slug] = top
    return recommendations


# ── Graph ─────────────────────────────────────────────────────────────────────


def compute_umap(
    embeddings: np.ndarray, slugs: list[str]
) -> dict[str, tuple[float, float]]:
    print("  Running UMAP…")
    reducer = UMAP(
        n_components=2,
        n_neighbors=min(15, len(slugs) - 1),
        min_dist=0.1,
        random_state=42,
        low_memory=False,
    )
    coords = reducer.fit_transform(embeddings)

    # Normalise each axis to [-1, 1]
    for dim in range(2):
        col = coords[:, dim]
        lo, hi = col.min(), col.max()
        span = (hi - lo) or 1.0
        coords[:, dim] = 2.0 * (col - lo) / span - 1.0

    return {
        slug: (float(coords[i, 0]), float(coords[i, 1])) for i, slug in enumerate(slugs)
    }


def compute_graph(
    posts: dict[str, dict],
    slugs: list[str],
    embeddings: np.ndarray,
    sim: np.ndarray,
) -> dict:
    # Backlink edges from front-matter internal links
    # Directed: source is the post containing the link, target is the linked post.
    backlink_set: set[tuple[str, str]] = set()
    for slug, post in posts.items():
        for link in post["internal_links"]:
            url = link.get("url", "") if isinstance(link, dict) else ""
            target = slug_from_url(url)
            if target in posts and target != slug:
                backlink_set.add((slug, target))

    backlink_edges = [{"source": a, "target": b} for a, b in backlink_set]
    print(f"  {len(backlink_edges)} backlink edges")

    # UMAP layout
    umap_coords = compute_umap(embeddings, slugs)

    # Semantic edges from cosine similarity
    semantic_set: set[tuple[str, str]] = set()
    semantic_sims: dict[tuple[str, str], float] = {}

    for i, slug_i in enumerate(slugs):
        candidates = sorted(
            (
                (j, float(sim[i, j]))
                for j in range(len(slugs))
                if j != i and float(sim[i, j]) >= SIMILARITY_THRESHOLD
            ),
            key=lambda x: -x[1],
        )[:TOP_N_SEMANTIC]

        for j, sim_val in candidates:
            key: tuple[str, str] = tuple(sorted([slug_i, slugs[j]]))  # type: ignore[assignment]
            if key not in semantic_set:
                semantic_set.add(key)
                semantic_sims[key] = round(sim_val, 4)

    semantic_edges = [
        {"source": a, "target": b, "similarity": semantic_sims[(a, b)]}
        for a, b in semantic_set
    ]
    print(f"  {len(semantic_edges)} semantic edges")

    nodes = [
        {
            "id": slug,
            "title": post["title"],
            "url": post["url"],
            "tags": post["tags"],
            "description": post["description"],
            "date": post["date"],
            **(
                {"umap_x": umap_coords[slug][0], "umap_y": umap_coords[slug][1]}
                if slug in umap_coords
                else {}
            ),
        }
        for slug, post in posts.items()
    ]

    return {
        "nodes": nodes,
        "backlink_edges": backlink_edges,
        "semantic_edges": semantic_edges,
    }


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    print("Loading posts…")
    posts = load_posts()
    if not posts:
        print("No posts found — nothing to do.")
        sys.exit(0)
    print(f"  {len(posts)} posts loaded.")

    cache = load_cache(CACHE_FILE)
    print(f"  {len(cache)} previously cached embeddings.")

    print("Getting embeddings…")
    embeddings, slugs, cache_changed = get_embeddings(posts, cache)

    if cache_changed:
        save_cache(CACHE_FILE, cache)
        print("  Cache saved.")
    else:
        print("  All embeddings up to date.")

    sim = similarity_matrix(embeddings)

    os.makedirs("_data", exist_ok=True)

    print("Computing recommendations…")
    recs = compute_recommendations(posts, slugs, sim)
    with open(RECS_OUTPUT, "w") as f:
        json.dump(recs, f, indent=2)
    print(f"  → {RECS_OUTPUT}")

    print("Computing graph…")
    graph = compute_graph(posts, slugs, embeddings, sim)
    with open(GRAPH_OUTPUT, "w") as f:
        json.dump(graph, f, indent=2, ensure_ascii=False)
    print(f"  → {GRAPH_OUTPUT}")

    print(
        f"\nDone. {len(posts)} posts | "
        f"{len(graph['backlink_edges'])} backlink edges | "
        f"{len(graph['semantic_edges'])} semantic edges"
    )


if __name__ == "__main__":
    main()
