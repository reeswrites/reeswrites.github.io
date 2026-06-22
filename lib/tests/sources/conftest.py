"""Shared fixtures and test helpers for lib/tests/sources/."""

from __future__ import annotations

import csv
import json
import os

import pytest

from lib.etl import config


@pytest.fixture()
def dirs(tmp_path, monkeypatch):
    inp = tmp_path / "input"
    out = tmp_path / "output"
    inp.mkdir()
    out.mkdir()
    monkeypatch.setattr(config, "INPUT_DATA_DIR", str(inp))
    monkeypatch.setattr(config, "OUTPUT_DATA_DIR", str(out))
    return inp, out


def write_csv(path, rows: list[dict]):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def load_output(out_dir, name: str) -> dict:
    with open(os.path.join(str(out_dir), f"{name}.json"), encoding="utf-8") as f:
        return json.load(f)


class _FakeResponse:
    """Minimal requests.Response stand-in for monkeypatching."""

    status_code = 200

    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self) -> dict:
        return self._payload


class _FakeXMLResponse:
    """Minimal requests.Response stub that returns XML text."""

    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self):
        pass
