from __future__ import annotations

import json

import pytest

from lib.etl import config, sources
from lib.tests.sources.conftest import _FakeResponse, _FakeXMLResponse


def _make_letterboxd_rss(items: list[dict]) -> str:
    item_xml = ""
    for it in items:
        item_xml += "    <item>\n"
        for key, val in it.items():
            item_xml += f"      <{key}>{val}</{key}>\n"
        item_xml += "    </item>\n"
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<rss version="2.0" xmlns:letterboxd="https://letterboxd.com">\n'
        "  <channel>\n"
        "    <title>Test Diary</title>\n" + item_xml + "  </channel>\n</rss>"
    )


def _make_letterboxd_item(
    guid: str,
    title: str,
    year: str,
    watched: str,
    rating: str = "4.0",
    review: str = "",
) -> dict:
    return {
        "guid": guid,
        "link": f"https://letterboxd.com/test/film/{title.lower().replace(' ', '-')}/",
        "letterboxd:watchedDate": watched,
        "letterboxd:filmTitle": title,
        "letterboxd:filmYear": year,
        "letterboxd:memberRating": rating,
        "description": f"&lt;p&gt;{review}&lt;/p&gt;" if review else "",
    }


def _make_tmdb_search_response(tmdb_id: int = 496243) -> dict:
    return {"results": [{"id": tmdb_id, "title": "Parasite"}]}


def _make_tmdb_details_response(tmdb_id: int = 496243) -> dict:
    return {
        "id": tmdb_id,
        "genres": [{"id": 18, "name": "Drama"}, {"id": 53, "name": "Thriller"}],
        "runtime": 132,
        "imdb_id": "tt6751668",
        "overview": "A poor family schemes to become employed by a wealthy family.",
        "poster_path": "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
        "credits": {
            "crew": [
                {"job": "Director", "department": "Directing", "name": "Bong Joon-ho"},
                {"job": "Director of Photography", "department": "Camera", "name": "Hong Kyung-pyo"},
                {"job": "Editor", "department": "Editing", "name": "Yang Jin-mo"},
                {"job": "Original Music Composer", "department": "Sound", "name": "Jung Jae-il"},
                {"job": "Screenplay", "department": "Writing", "name": "Bong Joon-ho"},
                {"job": "Story", "department": "Writing", "name": "Han Jin-won"},
                {"job": "Producer", "department": "Production", "name": "Kwak Sin-ae"},
            ],
            "cast": [
                {"name": "Song Kang-ho"},
                {"name": "Lee Sun-kyun"},
                {"name": "Cho Yeo-jeong"},
                {"name": "Choi Woo-shik"},
                {"name": "Park So-dam"},
                {"name": "Extra Actor"},
            ],
        },
    }


def _make_tmdb_fake_get(tmdb_id: int = 496243):
    call_count = {"n": 0}

    def fake_get(url, params=None, **kw):
        call_count["n"] += 1
        if "/search/movie" in url:
            return _FakeResponse(_make_tmdb_search_response(tmdb_id))
        return _FakeResponse(_make_tmdb_details_response(tmdb_id))

    return fake_get, call_count


class TestFetchLetterboxdDiary:
    @pytest.fixture()
    def api_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("LETTERBOXD_USER", "testuser")
        return tmp_path

    def test_basic_row_shape(self, api_dirs, monkeypatch):
        item = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15", "5.0")
        xml = _make_letterboxd_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        rows = sources.fetch_letterboxd_diary()

        assert len(rows) == 1
        row = rows[0]
        assert row["name"] == "Parasite"
        assert row["year"] == "2019"
        assert row["date"] == "2024-01-15"
        assert row["rating"] == "5.0"
        assert "letterboxd_uri" in row
        assert "_guid" in row

    def test_non_diary_items_skipped(self, api_dirs, monkeypatch):
        diary_item = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15")
        list_item = {
            "guid": "guid-list",
            "link": "https://letterboxd.com/test/list/faves/",
        }
        xml = _make_letterboxd_rss([diary_item, list_item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        rows = sources.fetch_letterboxd_diary()
        assert len(rows) == 1
        assert rows[0]["name"] == "Parasite"

    def test_dedup_by_guid(self, api_dirs, monkeypatch):
        item = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15")
        xml = _make_letterboxd_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        sources.fetch_letterboxd_diary()
        rows = sources.fetch_letterboxd_diary()

        assert len(rows) == 1

    def test_new_item_appended(self, api_dirs, monkeypatch):
        item1 = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15")
        item2 = _make_letterboxd_item("guid-2", "Knives Out", "2019", "2024-01-20")
        xmls = [_make_letterboxd_rss([item1]), _make_letterboxd_rss([item1, item2])]
        call_count = {"n": 0}

        def fake_get(*a, **kw):
            resp = _FakeXMLResponse(xmls[call_count["n"]])
            call_count["n"] += 1
            return resp

        monkeypatch.setattr("requests.get", fake_get)

        sources.fetch_letterboxd_diary()
        rows = sources.fetch_letterboxd_diary()

        assert len(rows) == 2

    def test_cache_written(self, api_dirs, monkeypatch):
        item = _make_letterboxd_item("guid-1", "Parasite", "2019", "2024-01-15")
        xml = _make_letterboxd_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        sources.fetch_letterboxd_diary()

        cache_path = api_dirs / sources.LETTERBOXD_CACHE_FILENAME
        assert cache_path.exists()
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        assert "watched" in cache
        assert len(cache["watched"]) == 1

    def test_html_stripped_from_review(self, api_dirs, monkeypatch):
        item = _make_letterboxd_item(
            "guid-1", "Parasite", "2019", "2024-01-15", review="Great film!"
        )
        xml = _make_letterboxd_rss([item])
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeXMLResponse(xml))

        rows = sources.fetch_letterboxd_diary()
        assert rows[0].get("review") == "Great film!"

    def test_missing_env_raises(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.delenv("LETTERBOXD_USER", raising=False)

        with pytest.raises(ValueError, match="LETTERBOXD"):
            sources.fetch_letterboxd_diary()


class TestTmdbHelpers:
    def test_search_returns_first_result_id(self, monkeypatch):
        monkeypatch.setattr(
            "requests.get", lambda *a, **kw: _FakeResponse(_make_tmdb_search_response())
        )
        assert sources._search_tmdb_movie("Parasite", "2019", "fake-key") == 496243

    def test_search_no_results_returns_none(self, monkeypatch):
        monkeypatch.setattr(
            "requests.get", lambda *a, **kw: _FakeResponse({"results": []})
        )
        assert sources._search_tmdb_movie("Unknown Film", "2099", "fake-key") is None

    def test_details_genres_extracted_as_strings(self, monkeypatch):
        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: _FakeResponse(_make_tmdb_details_response()),
        )
        result = sources._fetch_tmdb_movie_details(496243, "fake-key")
        assert result["genres"] == ["Drama", "Thriller"]

    def test_details_empty_imdb_id_returns_none(self, monkeypatch):
        resp = {**_make_tmdb_details_response(), "imdb_id": ""}
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(resp))
        result = sources._fetch_tmdb_movie_details(496243, "fake-key")
        assert result["imdb_id"] is None

    def test_details_full_shape(self, monkeypatch):
        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: _FakeResponse(_make_tmdb_details_response()),
        )
        result = sources._fetch_tmdb_movie_details(496243, "fake-key")
        assert result["tmdb_id"] == 496243
        assert result["runtime"] == 132
        assert result["imdb_id"] == "tt6751668"
        assert result["director"] == "Bong Joon-ho"
        assert result["dop"] == "Hong Kyung-pyo"
        assert result["editor"] == "Yang Jin-mo"
        assert result["composer"] == "Jung Jae-il"
        assert result["writers"] == ["Bong Joon-ho", "Han Jin-won"]
        assert (
            result["overview"]
            == "A poor family schemes to become employed by a wealthy family."
        )
        assert result["poster_path"] == "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg"
        assert result["cast"] == [
            "Song Kang-ho",
            "Lee Sun-kyun",
            "Cho Yeo-jeong",
            "Choi Woo-shik",
            "Park So-dam",
        ]
        assert "tmdb_score" not in result

    def test_details_director_extracted(self, monkeypatch):
        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: _FakeResponse(_make_tmdb_details_response()),
        )
        result = sources._fetch_tmdb_movie_details(496243, "fake-key")
        assert result["director"] == "Bong Joon-ho"

    def test_details_crew_extracted(self, monkeypatch):
        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: _FakeResponse(_make_tmdb_details_response()),
        )
        result = sources._fetch_tmdb_movie_details(496243, "fake-key")
        assert result["dop"] == "Hong Kyung-pyo"
        assert result["editor"] == "Yang Jin-mo"
        assert result["composer"] == "Jung Jae-il"
        assert result["writers"] == ["Bong Joon-ho", "Han Jin-won"]

    def test_details_writers_deduped(self, monkeypatch):
        resp = _make_tmdb_details_response()
        # same name appears twice under different writing jobs
        resp["credits"]["crew"].append(
            {"job": "Writer", "department": "Writing", "name": "Bong Joon-ho"}
        )
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(resp))
        result = sources._fetch_tmdb_movie_details(496243, "fake-key")
        assert result["writers"].count("Bong Joon-ho") == 1

    def test_details_no_director_returns_none(self, monkeypatch):
        resp = {**_make_tmdb_details_response(), "credits": {"crew": []}}
        monkeypatch.setattr("requests.get", lambda *a, **kw: _FakeResponse(resp))
        result = sources._fetch_tmdb_movie_details(496243, "fake-key")
        assert result["director"] is None
        assert result["dop"] is None
        assert result["editor"] is None
        assert result["composer"] is None
        assert result["writers"] is None


class TestEnrichLetterboxdWithTmdb:
    @pytest.fixture()
    def tmdb_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setattr(sources.letterboxd, "sleep", lambda *a: None)
        return tmp_path

    def test_merges_tmdb_fields_onto_entry(self, tmdb_dirs, monkeypatch):
        fake_get, _ = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [
            {"name": "Parasite", "year": "2019", "date": "2024-01-01", "rating": "5"}
        ]

        result = sources.enrich_letterboxd_with_tmdb(entries, "fake-key")

        assert result[0]["tmdb_id"] == 496243
        assert result[0]["genres"] == ["Drama", "Thriller"]
        assert result[0]["runtime"] == 132

    def test_original_fields_preserved(self, tmdb_dirs, monkeypatch):
        fake_get, _ = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [
            {"name": "Parasite", "year": "2019", "date": "2024-01-01", "rating": "5"}
        ]

        result = sources.enrich_letterboxd_with_tmdb(entries, "fake-key")

        assert result[0]["name"] == "Parasite"
        assert result[0]["date"] == "2024-01-01"
        assert result[0]["rating"] == "5"

    def test_cache_written_after_fetch(self, tmdb_dirs, monkeypatch):
        fake_get, _ = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [{"name": "Parasite", "year": "2019", "date": "2024-01-01"}]

        sources.enrich_letterboxd_with_tmdb(entries, "fake-key")

        cache_path = tmdb_dirs / sources.TMDB_MOVIES_CACHE_FILENAME
        assert cache_path.exists()
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
        assert "Parasite|2019" in cache
        assert cache["Parasite|2019"]["tmdb_id"] == 496243

    def test_cache_hit_skips_fetch(self, tmdb_dirs, monkeypatch):
        fake_get, call_count = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [{"name": "Parasite", "year": "2019", "date": "2024-01-01"}]

        sources.enrich_letterboxd_with_tmdb(entries, "fake-key")
        first_call_count = call_count["n"]
        sources.enrich_letterboxd_with_tmdb(entries, "fake-key")

        assert call_count["n"] == first_call_count

    def test_not_found_stores_none_sentinel(self, tmdb_dirs, monkeypatch):
        monkeypatch.setattr(
            "requests.get", lambda *a, **kw: _FakeResponse({"results": []})
        )
        entries = [{"name": "Obscure Film", "year": "1900", "date": "2024-01-01"}]

        sources.enrich_letterboxd_with_tmdb(entries, "fake-key")

        cache = json.loads((tmdb_dirs / sources.TMDB_MOVIES_CACHE_FILENAME).read_text())
        assert "Obscure Film|1900" in cache
        assert cache["Obscure Film|1900"] is None

    def test_not_found_entry_unchanged(self, tmdb_dirs, monkeypatch):
        monkeypatch.setattr(
            "requests.get", lambda *a, **kw: _FakeResponse({"results": []})
        )
        entries = [{"name": "Obscure Film", "year": "1900", "date": "2024-01-01"}]

        result = sources.enrich_letterboxd_with_tmdb(entries, "fake-key")

        assert "tmdb_id" not in result[0]
        assert result[0]["name"] == "Obscure Film"

    def test_none_sentinel_not_refetched(self, tmdb_dirs, monkeypatch):
        call_count = {"n": 0}

        def fake_get(*a, **kw):
            call_count["n"] += 1
            return _FakeResponse({"results": []})

        monkeypatch.setattr("requests.get", fake_get)
        entries = [{"name": "Obscure Film", "year": "1900", "date": "2024-01-01"}]

        sources.enrich_letterboxd_with_tmdb(entries, "fake-key")
        first_count = call_count["n"]
        sources.enrich_letterboxd_with_tmdb(entries, "fake-key")

        assert call_count["n"] == first_count

    def test_multiple_entries_all_enriched(self, tmdb_dirs, monkeypatch):
        id_map = {"Parasite": 496243, "Knives Out": 546554}

        def fake_get(url, params=None, **kw):
            if "/search/movie" in url:
                query = (params or {}).get("query", "")
                tmdb_id = id_map.get(query, 1)
                return _FakeResponse({"results": [{"id": tmdb_id}]})
            return _FakeResponse(_make_tmdb_details_response())

        monkeypatch.setattr("requests.get", fake_get)
        entries = [
            {"name": "Parasite", "year": "2019", "date": "2024-01-01"},
            {"name": "Knives Out", "year": "2019", "date": "2024-01-02"},
        ]

        result = sources.enrich_letterboxd_with_tmdb(entries, "fake-key")

        assert all("tmdb_id" in e for e in result)
        assert result[0]["tmdb_id"] == 496243
        assert result[1]["tmdb_id"] == 546554


class TestEnrichLetterboxdWithTmdbEnrichMode:
    @pytest.fixture()
    def tmdb_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setattr(sources.letterboxd, "sleep", lambda *a: None)
        return tmp_path

    def test_enrich_true_requeries_entry_missing_required_field(
        self, tmdb_dirs, monkeypatch
    ):
        """An entry cached without poster_path is re-queried when enrich=True."""
        partial = {
            "tmdb_id": 496243,
            "genres": ["Drama"],
            "runtime": 132,
            "poster_path": None,  # missing required field
            "imdb_id": "tt6751668",
        }
        cache_path = tmdb_dirs / sources.TMDB_MOVIES_CACHE_FILENAME
        cache_path.write_text(json.dumps({"Parasite|2019": partial}))

        fake_get, call_count = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [{"name": "Parasite", "year": "2019", "date": "2024-01-01"}]
        sources.enrich_letterboxd_with_tmdb(entries, "fake-key", enrich=True)
        assert call_count["n"] > 0  # re-queried

    def test_enrich_true_skips_entry_with_all_required_fields(
        self, tmdb_dirs, monkeypatch
    ):
        """An entry cached with all required fields is NOT re-queried when enrich=True."""
        complete = {
            "tmdb_id": 496243,
            "genres": ["Drama"],
            "runtime": 132,
            "poster_path": "/path.jpg",
            "overview": "A poor family schemes to become employed by a wealthy family.",
            "dop": "Hong Kyung-pyo",
            "editor": "Yang Jin-mo",
            "composer": "Jung Jae-il",
            "writers": ["Bong Joon-ho"],
        }
        cache_path = tmdb_dirs / sources.TMDB_MOVIES_CACHE_FILENAME
        cache_path.write_text(json.dumps({"Parasite|2019": complete}))

        call_count = {"n": 0}
        monkeypatch.setattr(
            "requests.get",
            lambda *a, **kw: (
                call_count.__setitem__("n", call_count["n"] + 1) or _FakeResponse({})
            ),
        )
        entries = [{"name": "Parasite", "year": "2019", "date": "2024-01-01"}]
        sources.enrich_letterboxd_with_tmdb(entries, "fake-key", enrich=True)
        assert call_count["n"] == 0

    def test_enrich_true_fill_blanks_on_cached_entry(self, tmdb_dirs, monkeypatch):
        """Re-queried fields fill blanks in the cache entry, not overwrite non-empty values."""
        partial = {
            "tmdb_id": 496243,
            "genres": ["Drama"],
            "runtime": 132,
            "poster_path": None,
        }
        cache_path = tmdb_dirs / sources.TMDB_MOVIES_CACHE_FILENAME
        cache_path.write_text(json.dumps({"Parasite|2019": partial}))

        fake_get, _ = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [{"name": "Parasite", "year": "2019", "date": "2024-01-01"}]
        result = sources.enrich_letterboxd_with_tmdb(entries, "fake-key", enrich=True)
        assert result[0]["poster_path"] is not None  # filled in
        assert result[0]["genres"] == ["Drama"]  # existing value preserved

    def test_two_arg_call_still_works(self, tmdb_dirs, monkeypatch):
        fake_get, _ = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [{"name": "Parasite", "year": "2019", "date": "2024-01-01"}]
        result = sources.enrich_letterboxd_with_tmdb(entries, "fake-key")
        assert result[0]["tmdb_id"] == 496243


class TestGetLetterboxdDataApiTmdb:
    @pytest.fixture()
    def dirs(self, tmp_path, monkeypatch):
        inp = tmp_path / "input"
        out = tmp_path / "output"
        (out / "media").mkdir(parents=True)
        inp.mkdir()
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(inp))
        monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))
        return inp, out

    def _fake_diary(self):
        return [
            {
                "name": "Parasite",
                "year": "2019",
                "date": "2024-01-01",
                "rating": "5",
                "_guid": "g1",
            }
        ]

    def test_enrichment_called_when_api_key_set(self, dirs, monkeypatch):
        monkeypatch.setenv("TMDB_API_KEY", "fake-key")
        monkeypatch.setattr(
            sources.letterboxd, "fetch_letterboxd_diary", lambda: self._fake_diary()
        )
        calls = {"n": 0}

        def fake_enrich(entries, api_key, enrich=False):
            calls["n"] += 1
            assert api_key == "fake-key"
            return [{k: v for k, v in entries[0].items() if k != "_guid"}]

        monkeypatch.setattr(
            sources.letterboxd, "enrich_letterboxd_with_tmdb", fake_enrich
        )
        sources.get_letterboxd_data_api()

        assert calls["n"] == 1

    def test_enrichment_skipped_when_no_api_key(self, dirs, monkeypatch):
        monkeypatch.delenv("TMDB_API_KEY", raising=False)
        monkeypatch.setattr(
            sources.letterboxd, "fetch_letterboxd_diary", lambda: self._fake_diary()
        )
        calls = {"n": 0}
        monkeypatch.setattr(
            sources.letterboxd,
            "enrich_letterboxd_with_tmdb",
            lambda e, k: calls.__setitem__("n", calls["n"] + 1) or e,
        )

        sources.get_letterboxd_data_api()

        assert calls["n"] == 0

    def test_guid_stripped_from_output(self, dirs, monkeypatch):
        _, out = dirs
        monkeypatch.delenv("TMDB_API_KEY", raising=False)
        monkeypatch.setattr(
            sources.letterboxd, "fetch_letterboxd_diary", lambda: self._fake_diary()
        )

        sources.get_letterboxd_data_api()

        data = json.loads((out / "media" / "movies.json").read_text())
        assert "_guid" not in data["watched"][0]


class TestTmdbOverviewScreening:
    """TMDB overviews that score above the profanity threshold are dropped."""

    @pytest.fixture()
    def tmdb_dirs(self, tmp_path, monkeypatch):
        monkeypatch.setattr(config, "INPUT_DATA_DIR", str(tmp_path))
        monkeypatch.setattr(sources.letterboxd, "sleep", lambda *a: None)
        return tmp_path

    def test_clean_overview_kept(self, tmdb_dirs, monkeypatch):
        import lib.etl.sources._helpers as helpers

        monkeypatch.setattr(helpers, "predict_prob", lambda texts: [0.1])
        fake_get, _ = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [{"name": "Parasite", "year": "2019", "date": "2024-01-01"}]
        result = sources.enrich_letterboxd_with_tmdb(entries, "fake-key")
        assert result[0].get("overview") is not None

    def test_flagged_overview_dropped(self, tmdb_dirs, monkeypatch):
        import lib.etl.sources._helpers as helpers

        monkeypatch.setattr(helpers, "predict_prob", lambda texts: [0.9])
        fake_get, _ = _make_tmdb_fake_get()
        monkeypatch.setattr("requests.get", fake_get)
        entries = [{"name": "Parasite", "year": "2019", "date": "2024-01-01"}]
        result = sources.enrich_letterboxd_with_tmdb(entries, "fake-key")
        assert result[0].get("overview") is None
