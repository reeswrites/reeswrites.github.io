"""
embed.py
Generates both _data/recommendations.json and _data/graph.json from Jekyll posts.

Embeddings are cached by slug (keyed on content hash) so only new/changed
posts are re-encoded. UMAP layout and cosine similarity are computed from
the same embedding matrix in one pass.
"""

import glob
import hashlib
import json
import os
import re
import sys
from collections import Counter
from datetime import date as _today_date
from pathlib import Path

import frontmatter
import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from sentence_transformers import SentenceTransformer

try:
    from umap import UMAP
except ImportError:
    sys.exit("Missing dep — run: pip install umap-learn")

# ── Config ────────────────────────────────────────────────────────────────────

POSTS_GLOB = "_posts/*.md"
CACHE_FILE = ".recommendations_cache/embeddings.json"
MEDIA_CACHE_FILE = ".recommendations_cache/media_embeddings.json"
RECS_OUTPUT = "_data/recommendations.json"
MEDIA_RECS_OUTPUT = "_data/recommendations-media.json"
GRAPH_OUTPUT = "_data/graph.json"
CITATIONS_OUTPUT = "_data/citations.json"
TOPICS_OUTPUT = "_data/topics.json"
MODEL_NAME = "BAAI/bge-large-en-v1.5"

# Recommendations
MIN_SIMILARITY = 0.30
TOP_N_RECS = 5

# Graph semantic edges (also used as cross-type media threshold)
SIMILARITY_THRESHOLD = 0.75
TOP_N_SEMANTIC = 5

# Topic tree
NUM_TOP_TOPICS = 10  # number of clusters to cut the Ward dendrogram to


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
        citations = (post.metadata.get("links") or {}).get("citations") or []

        encode_text = f"{title} {' '.join(tags)} {desc} {post.content}".strip()

        posts[slug] = {
            "slug": slug,
            "title": title,
            "description": desc,
            "date": date,
            "tags": tags,
            "type": str(post.get("type") or ""),
            "url": f"/posts/{slug}",
            "internal_links": internal_links,
            "citations": citations,
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


# ── Media loading ─────────────────────────────────────────────────────────────


def _media_encode_text(*parts: str | list | None) -> str:
    """Join non-empty parts, flattening lists, into an encode_text string."""
    tokens = []
    for p in parts:
        if isinstance(p, list):
            tokens.extend(str(x) for x in p if x)
        elif p:
            tokens.append(str(p))
    return " ".join(tokens).strip()


def load_media() -> dict[str, dict]:
    """Load media items from _data/, keyed by 'type:id'."""
    items: dict[str, dict] = {}

    def _add(
        item_id: str, item_type: str, title: str, encode_text: str, owned=None
    ) -> None:
        items[item_id] = {
            "id": item_id,
            "type": item_type,
            "title": title,
            "encode_text": encode_text,
            "hash": hash_content(encode_text),
            "owned": owned,
        }

    movies_path = Path("_data/media/movies.json")
    if movies_path.exists():
        data = json.loads(movies_path.read_text())
        for m in data.get("watched", []):
            tmdb_id = m.get("tmdb_id")
            item_id = (
                f"movie:{tmdb_id}"
                if tmdb_id
                else f"movie:{m.get('name', '')}|{m.get('year', '')}"
            )
            _add(
                item_id,
                "movie",
                m.get("name", ""),
                _media_encode_text(
                    m.get("name"),
                    m.get("director"),
                    m.get("genres"),
                    m.get("overview"),
                ),
                owned=m.get("owned"),
            )

    books_path = Path("_data/media/books.json")
    if books_path.exists():
        data = json.loads(books_path.read_text())
        for b in data.get("read", []):
            isbn = b.get("isbn13") or b.get("isbn") or b.get("title", "")
            item_id = f"book:{isbn}"
            _add(
                item_id,
                "book",
                b.get("title", ""),
                _media_encode_text(
                    b.get("title"),
                    b.get("author"),
                    b.get("genres"),
                    b.get("description"),
                ),
                owned=b.get("owned"),
            )

    tv_path = Path("_data/media/tv.json")
    if tv_path.exists():
        data = json.loads(tv_path.read_text())
        for s in data.get("shows", []):
            tmdb_id = s.get("tmdb_id")
            item_id = (
                f"tv:{tmdb_id}"
                if tmdb_id
                else f"tv:{s.get('title', '')}|{s.get('year', '')}"
            )
            _add(
                item_id,
                "tv",
                s.get("title", ""),
                _media_encode_text(
                    s.get("title"),
                    s.get("genres"),
                    s.get("overview"),
                ),
                owned=s.get("owned"),
            )

    records_path = Path("_data/inventory/records.json")
    if records_path.exists():
        data = json.loads(records_path.read_text())
        for r in data.get("owned", []):
            item_id = f"record:{r.get('artist_name', '')}|{r.get('album_name', '')}"
            _add(
                item_id,
                "record",
                r.get("album_name", ""),
                _media_encode_text(
                    r.get("album_name"),
                    r.get("artist_name"),
                    r.get("genre"),
                    r.get("artist_bio"),
                ),
            )

    return items


# ── Media recommendations ─────────────────────────────────────────────────────


def compute_media_recommendations(
    items: dict[str, dict],
    slugs: list[str],
    sim: np.ndarray,
) -> dict[str, dict]:
    """Within-type (≥ MIN_SIMILARITY) + cross-type (≥ SIMILARITY_THRESHOLD) recs."""
    results: dict[str, dict] = {}
    for i, item_id in enumerate(slugs):
        item_type = items[item_id]["type"]
        within: list[dict] = []
        cross: list[dict] = []

        ranked = sorted(
            ((j, float(sim[i, j])) for j in range(len(slugs)) if j != i),
            key=lambda x: -x[1],
        )

        for j, score in ranked:
            if len(within) >= TOP_N_RECS and len(cross) >= 3:
                break
            other = items[slugs[j]]
            if (
                other["type"] == item_type
                and score >= MIN_SIMILARITY
                and len(within) < TOP_N_RECS
            ):
                within.append(
                    {
                        "id": other["id"],
                        "title": other["title"],
                        "type": other["type"],
                        "score": round(score, 4),
                    }
                )
            elif (
                other["type"] != item_type
                and score >= SIMILARITY_THRESHOLD
                and len(cross) < 3
            ):
                cross.append(
                    {
                        "id": other["id"],
                        "title": other["title"],
                        "type": other["type"],
                        "score": round(score, 4),
                    }
                )

        results[item_id] = {"within": within, "cross": cross}
    return results


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
    cited_media: dict[str, dict] | None = None,
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

    # Post nodes — add category: "post" for type discrimination in the graph renderer
    nodes = [
        {
            "id": slug,
            "title": post["title"],
            "url": post["url"],
            "tags": post["tags"],
            "description": post["description"],
            "date": post["date"],
            "category": "post",
            **(
                {"umap_x": umap_coords[slug][0], "umap_y": umap_coords[slug][1]}
                if slug in umap_coords
                else {}
            ),
        }
        for slug, post in posts.items()
    ]

    # Media nodes — cited items only, no embeddings/UMAP
    citation_edges: list[dict] = []
    if cited_media:
        for media_key, item in cited_media.items():
            item_type = item["type"]
            # Derive the bare item id and the data-page URL from the media_key
            bare_id = media_key.split(":", 1)[1]
            # Build the URL using the reverse of CITABLE_PAGES
            page_map = {"movie": "movies", "book": "books-read", "tv": "tv"}
            page = page_map.get(item_type, item_type)
            url = f"/data/{page}?item={bare_id}"
            nodes.append(
                {
                    "id": media_key,
                    "title": item["title"],
                    "url": url,
                    "tags": [],
                    "description": "",
                    "date": "",
                    "category": "media",
                    "media_type": item_type,
                    "owned": item.get("owned"),
                }
            )

        # Citation edges: post → media item (directed, shown with backlinks toggle)
        citation_set: set[tuple[str, str]] = set()
        for slug, post in posts.items():
            for cit in post.get("citations", []):
                item_type = cit.get("type", "")
                item_id = str(cit.get("id", ""))
                media_key = f"{item_type}:{item_id}"
                if media_key in cited_media and (slug, media_key) not in citation_set:
                    citation_set.add((slug, media_key))
                    citation_edges.append({"source": slug, "target": media_key})

        print(
            f"  {len(cited_media)} cited media nodes, {len(citation_edges)} citation edges"
        )

    return {
        "nodes": nodes,
        "backlink_edges": backlink_edges,
        "semantic_edges": semantic_edges,
        "citation_edges": citation_edges,
    }


# ── Citations ─────────────────────────────────────────────────────────────────


def compute_citations(
    posts: dict[str, dict],
    media_items: dict[str, dict],
) -> tuple[dict, dict[str, dict]]:
    """
    Build the citation reverse-index and identify cited media items.

    The index (`by_item`) is keyed by media type → bare item id → entry, where
    each entry lists all posts that cite that item.  This is written to
    _data/citations.json so data-page modals can render "Referenced in…" lists.

    Returns:
        (index, cited_media) where:
          index       — the full by_item structure for citations.json
          cited_media — dict of media_key → media item dict for matched items only
                        (used by compute_graph to add media nodes + citation_edges)
    """
    # Map from CITABLE_PAGES page name to embed.py type prefix (must match jekyll_tools.py)
    PAGE_TO_TYPE = {"movies": "movie", "books-read": "book", "tv": "tv"}

    # by_item[type][bare_id] = {title, url, type, posts: [...]}
    by_item: dict[str, dict] = {}
    cited_media: dict[str, dict] = {}  # media_key → item dict

    for slug, post in posts.items():
        for cit in post.get("citations", []):
            item_type = cit.get("type", "")
            item_id = str(cit.get("id", ""))
            item_url = cit.get("url", "")
            item_title = cit.get("title", "")

            if not item_type or not item_id:
                continue

            # Construct the key used by load_media()
            media_key = f"{item_type}:{item_id}"

            if media_key not in media_items:
                print(
                    f"  [citation] WARNING: unmatched citation in '{slug}': "
                    f"{item_type}:{item_id} (url={item_url!r})"
                )
                continue

            # Register in cited_media for the graph
            if media_key not in cited_media:
                cited_media[media_key] = media_items[media_key]

            # Build the reverse index
            if item_type not in by_item:
                by_item[item_type] = {}
            if item_id not in by_item[item_type]:
                by_item[item_type][item_id] = {
                    "title": item_title or media_items[media_key]["title"],
                    "url": item_url,
                    "type": item_type,
                    "posts": [],
                }
            by_item[item_type][item_id]["posts"].append(
                {
                    "slug": slug,
                    "title": post["title"],
                    "url": post["url"],
                    "date": post["date"],
                }
            )

    return {"by_item": by_item}, cited_media


# ── Topic tree ────────────────────────────────────────────────────────────────


def _post_leaf(slug: str, post: dict) -> dict:
    """Serialize a post as a leaf node in the topic tree JSON."""
    return {
        "kind": "post",
        "slug": slug,
        "title": post["title"],
        "description": post["description"],
        "url": post["url"],
        "type": post.get("type", ""),
        "date": post["date"],
    }


def label_cluster(
    member_slugs: list[str],
    posts: dict[str, dict],
    embeddings: np.ndarray,
    slugs: list[str],
    global_tag_freq: Counter,
) -> tuple[str, str]:
    """
    Generate a human-readable label and a representative post title for a cluster.

    Label: top distinguishing tags (ranked by local over-representation vs corpus).
    Representative: post nearest the L2-normalised cluster centroid.

    # TODO(llm): replace with cached LLM label keyed by frozenset(member_slugs).
    # The label_cluster signature is intentionally isolated for this purpose.
    """
    n_corpus = len(posts)

    # ── Label: distinguishing tags ────────────────────────────────────────────
    tag_local_freq: Counter = Counter()
    for slug in member_slugs:
        for t in posts[slug]["tags"]:
            if not re.fullmatch(r"\d{4}", t):
                tag_local_freq[t] += 1

    # Score = (local proportion) / (global proportion) — relative over-representation
    scored: list[tuple[float, int, str]] = []
    for tag, local_f in tag_local_freq.items():
        global_f = max(global_tag_freq.get(tag, 1), 1)
        score = (local_f / len(member_slugs)) / (global_f / n_corpus)
        scored.append((score, local_f, tag))
    scored.sort(reverse=True)

    top_tags = [tag for _, _, tag in scored[:3]]
    label = " · ".join(top_tags) if top_tags else "Uncategorised"

    # ── Representative: post nearest the cluster centroid ────────────────────
    slug_to_idx = {s: i for i, s in enumerate(slugs)}
    member_indices = [slug_to_idx[s] for s in member_slugs if s in slug_to_idx]
    member_vecs = embeddings[member_indices]
    centroid = member_vecs.mean(axis=0)
    norm = float(np.linalg.norm(centroid))
    if norm > 0:
        centroid = centroid / norm
    sims = member_vecs @ centroid
    best_local_idx = int(np.argmax(sims))
    representative = posts[member_slugs[best_local_idx]]["title"]

    return label, representative


def compute_topics(
    posts: dict[str, dict],
    slugs: list[str],
    embeddings: np.ndarray,
) -> dict:
    """
    Build a shallow 2-level topic taxonomy using Ward-linkage HAC.

    The dendrogram is cut to NUM_TOP_TOPICS flat clusters via fcluster.
    Each cluster becomes a labeled topic node whose children are post leaves
    sorted by date descending.  No nesting beyond root → topic → posts.
    """
    global_tag_freq: Counter = Counter()
    for post in posts.values():
        for t in post["tags"]:
            if not re.fullmatch(r"\d{4}", t):
                global_tag_freq[t] += 1

    n = len(slugs)
    if n < 2:
        slug = slugs[0]
        return {
            "last_updated": str(_today_date.today()),
            "tree": _post_leaf(slug, posts[slug]),
        }

    k = min(NUM_TOP_TOPICS, n - 1)
    print(f"  Running Ward HAC on {n} posts, cutting to {k} clusters…")
    Z = linkage(embeddings, method="ward")
    cluster_ids = fcluster(Z, t=k, criterion="maxclust")  # 1-indexed

    clusters: dict[int, list[str]] = {}
    for i, cid in enumerate(cluster_ids):
        clusters.setdefault(int(cid), []).append(slugs[i])

    topic_nodes: list[dict] = []
    for member_slugs in clusters.values():
        label, representative = label_cluster(
            member_slugs, posts, embeddings, slugs, global_tag_freq
        )
        children = sorted(
            [_post_leaf(s, posts[s]) for s in member_slugs],
            key=lambda p: p["date"],
            reverse=True,
        )
        topic_nodes.append(
            {
                "kind": "topic",
                "label": label,
                "representative": representative,
                "count": len(member_slugs),
                "children": children,
            }
        )

    topic_nodes.sort(key=lambda t: -t["count"])

    root_label, _ = label_cluster(
        list(posts.keys()), posts, embeddings, slugs, global_tag_freq
    )
    tree = {
        "kind": "topic",
        "label": root_label,
        "representative": "",
        "count": n,
        "children": topic_nodes,
    }
    return {
        "last_updated": str(_today_date.today()),
        "tree": tree,
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

    print("\nLoading media items…")
    media_items = load_media()
    if media_items:
        print(f"  {len(media_items)} media items loaded.")
    else:
        print("  No media data found — skipping media recommendations and citations.")

    print("Computing citations…")
    cited_media: dict[str, dict] = {}
    if media_items:
        citations_index, cited_media = compute_citations(posts, media_items)
        citations_index["last_updated"] = str(_today_date.today())
        with open(CITATIONS_OUTPUT, "w") as f:
            json.dump(citations_index, f, indent=2, ensure_ascii=False)
        print(f"  → {CITATIONS_OUTPUT} ({len(cited_media)} cited items)")
    else:
        print("  Skipped (no media data).")

    print("Computing graph…")
    graph = compute_graph(
        posts, slugs, embeddings, sim, cited_media=cited_media or None
    )
    with open(GRAPH_OUTPUT, "w") as f:
        json.dump(graph, f, indent=2, ensure_ascii=False)
    print(f"  → {GRAPH_OUTPUT}")

    print("Computing topics…")
    topics = compute_topics(posts, slugs, embeddings)
    with open(TOPICS_OUTPUT, "w") as f:
        json.dump(topics, f, indent=2, ensure_ascii=False)
    print(f"  → {TOPICS_OUTPUT}")

    print(
        f"\nDone. {len(posts)} posts | "
        f"{len(graph['backlink_edges'])} backlink edges | "
        f"{len(graph['semantic_edges'])} semantic edges | "
        f"{len(graph.get('citation_edges', []))} citation edges"
    )

    if not media_items:
        return

    media_cache = load_cache(MEDIA_CACHE_FILE)
    print(f"  {len(media_cache)} previously cached media embeddings.")

    print("Getting media embeddings…")
    media_embeddings, media_slugs, media_cache_changed = get_embeddings(
        media_items, media_cache
    )

    if media_cache_changed:
        save_cache(MEDIA_CACHE_FILE, media_cache)
        print("  Media cache saved.")
    else:
        print("  All media embeddings up to date.")

    media_sim = similarity_matrix(media_embeddings)

    print("Computing media recommendations…")
    media_recs = compute_media_recommendations(media_items, media_slugs, media_sim)
    with open(MEDIA_RECS_OUTPUT, "w") as f:
        json.dump(media_recs, f, indent=2)
    print(f"  → {MEDIA_RECS_OUTPUT}")


if __name__ == "__main__":
    main()
