from __future__ import annotations

from datetime import date

from lib.etl.sources.apple import _parse_health_export_end_date, sync_from_icloud


class TestParseHealthExportEndDate:
    def test_step_count_filename(self):
        assert _parse_health_export_end_date(
            "Step Count-2024-09-01-2026-05-29.csv"
        ) == date(2026, 5, 29)

    def test_workouts_filename(self):
        assert _parse_health_export_end_date(
            "Workouts-20240901_000000-20260529_235959.csv"
        ) == date(2026, 5, 29)

    def test_unrecognized_returns_none(self):
        assert _parse_health_export_end_date("random.csv") is None

    def test_hae_binary_returns_none(self):
        assert _parse_health_export_end_date("20260610.hae") is None


class TestSyncFromIcloud:
    def test_missing_dir_returns_false(self, tmp_path):
        assert sync_from_icloud(str(tmp_path / "nonexistent")) is False

    def test_no_csv_files_returns_false(self, tmp_path):
        assert sync_from_icloud(str(tmp_path)) is False

    def test_imports_when_newer(self, tmp_path, dirs):
        inp, _out = dirs

        # existing input at 2026-05-01
        old_dir = inp / "apple_health-2026-05-01"
        old_dir.mkdir()
        (old_dir / "Step Count-2026-01-01-2026-05-01.csv").write_text("data")
        (old_dir / "Workouts-20260101_000000-20260501_235959.csv").write_text("data")

        # iCloud has newer export at 2026-06-01
        icloud = tmp_path / "icloud"
        icloud.mkdir()
        (icloud / "Step Count-2026-01-01-2026-06-01.csv").write_text("step,data")
        (icloud / "Workouts-20260101_000000-20260601_235959.csv").write_text(
            "workout,data"
        )

        result = sync_from_icloud(str(icloud))
        assert result is True
        new_dir = inp / "apple_health-2026-06-01"
        assert new_dir.is_dir()
        assert (new_dir / "Step Count-2026-01-01-2026-06-01.csv").exists()
        assert (new_dir / "Workouts-20260101_000000-20260601_235959.csv").exists()

    def test_skips_when_not_newer(self, tmp_path, dirs):
        inp, _out = dirs

        existing = inp / "apple_health-2026-06-01"
        existing.mkdir()

        icloud = tmp_path / "icloud"
        icloud.mkdir()
        (icloud / "Step Count-2026-01-01-2026-05-01.csv").write_text("data")
        (icloud / "Workouts-20260101_000000-20260501_235959.csv").write_text("data")

        result = sync_from_icloud(str(icloud))
        assert result is False

    def test_imports_when_no_existing_input(self, tmp_path, dirs):
        inp, _out = dirs

        icloud = tmp_path / "icloud"
        icloud.mkdir()
        (icloud / "Step Count-2026-01-01-2026-06-01.csv").write_text("step,data")
        (icloud / "Workouts-20260101_000000-20260601_235959.csv").write_text(
            "workout,data"
        )

        result = sync_from_icloud(str(icloud))
        assert result is True
        assert (inp / "apple_health-2026-06-01").is_dir()

    def test_searches_subdirectories(self, tmp_path, dirs):
        inp, _out = dirs

        icloud = tmp_path / "icloud"
        sub = icloud / "exports" / "june"
        sub.mkdir(parents=True)
        (sub / "Step Count-2026-01-01-2026-06-10.csv").write_text("data")
        (sub / "Workouts-20260101_000000-20260610_235959.csv").write_text("data")

        result = sync_from_icloud(str(icloud))
        assert result is True
        assert (inp / "apple_health-2026-06-10").is_dir()
