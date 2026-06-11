from __future__ import annotations

import csv
import json
import logging
import os
import re
import shutil
import unicodedata
from collections import defaultdict
from datetime import date, datetime

from lxml import etree

from .. import config, intake, io, transforms

_HEALTH_EXPORT_ICLOUD_DIR = os.path.expanduser(
    "~/Library/Mobile Documents/iCloud~com~ifunography~HealthExport/Documents"
)
_STALE_DAYS = 7

WORKOUT_FIELD_MAPPING = {
    "@workoutActivityType": "workoutType",
    "@duration": "duration",
    "@startDate": "startTime",
    "@endDate": "endTime",
    "ActiveEnergyBurned": "activeCalories",
    "BasalEnergyBurned": "basalCalories",
    "DistanceWalkingRunning": "distance",
}

WORKOUT_DROP_FIELDS = (
    "WorkoutRoute",
    "MetadataEntry",
    "WorkoutEvent",
    "@durationUnit",
    "@sourceName",
    "@sourceVersion",
    "@device",
    "@creationDate",
)


def get_latest_apple_workouts_data():
    logging.info("Parsing Apple Health data...")

    apple_health_files = intake.get_files_by_source("apple_health")
    latest_apple_health_file = intake.get_latest_data_file(apple_health_files)

    daily_steps: dict = defaultdict(int)
    workout_list = []

    with open(os.path.join(config.INPUT_DATA_DIR, latest_apple_health_file)) as file:
        tree = etree.parse(file)

        for record in tree.getroot().xpath(
            "Record[@type='HKQuantityTypeIdentifierStepCount']"
        ):
            date_obj = (
                datetime.strptime(record.get("startDate"), "%Y-%m-%d %H:%M:%S %z")
                .date()
                .isoformat()
            )
            if "Apple Watch" in unicodedata.normalize("NFKD", record.get("sourceName")):
                daily_steps[date_obj] += int(record.get("value"))

        for record in tree.getroot().xpath("Workout"):
            workout = {}
            for child in record.xpath("WorkoutStatistics"):
                if child.get("type") == "HKQuantityTypeIdentifierHeartRate":
                    workout["averageHR"] = child.get("average")
                    workout["minimumHR"] = child.get("minimum")
                    workout["maximumHR"] = child.get("maximum")
                elif child.get("type"):
                    workout[
                        child.get("type").replace("HKQuantityTypeIdentifier", "")
                    ] = child.get("sum")

            workout["@workoutActivityType"] = (
                record.get("workoutActivityType")
                .replace("HKWorkoutActivityType", "")
                .lower()
            )
            workout["@startDate"] = datetime.strftime(
                datetime.strptime(record.get("startDate"), "%Y-%m-%d %H:%M:%S %z"),
                "%Y-%m-%d %H:%M:%S",
            )
            workout["@endDate"] = datetime.strftime(
                datetime.strptime(record.get("endDate"), "%Y-%m-%d %H:%M:%S %z"),
                "%Y-%m-%d %H:%M:%S",
            )
            mins, sec_dec = record.get("duration").split(".")
            workout["@duration"] = (
                f"{mins} minute(s) and {round(60 * float('.' + sec_dec))} second(s)"
            )
            workout_list.append(workout)

    step_counts = [{"date": k, "steps": v} for k, v in daily_steps.items()]
    dropped_data = transforms.drop_fields(workout_list, WORKOUT_DROP_FIELDS)
    mapped_fields = transforms.map_fields(dropped_data, WORKOUT_FIELD_MAPPING)

    io.save_formatted_data("workouts", {"workouts": mapped_fields})
    io.save_formatted_data("step_counts", {"daily_steps": step_counts})


def _parse_health_export_end_date(filename: str) -> date | None:
    """Parse end date from Health Auto Export CSV filenames."""
    m = re.match(r"Step Count-\d{4}-\d{2}-\d{2}-(\d{4}-\d{2}-\d{2})\.csv", filename)
    if m:
        return datetime.strptime(m.group(1), "%Y-%m-%d").date()
    m = re.match(r"Workouts-\d{8}_\d{6}-(\d{8})_\d{6}\.csv", filename)
    if m:
        return datetime.strptime(m.group(1), "%Y%m%d").date()
    return None


def sync_from_icloud(icloud_dir: str = _HEALTH_EXPORT_ICLOUD_DIR) -> bool:
    """
    Scan iCloud Health Export folder for CSV exports newer than the current input.

    Health Auto Export → Export → Save to Files → iCloud Drive is the trigger.
    Returns True if a new export was imported into input/.
    """
    if not os.path.isdir(icloud_dir):
        logging.debug("Health Export iCloud folder not found: %s", icloud_dir)
        return False

    step_files: dict[date, str] = {}
    workout_files: dict[date, str] = {}

    for root, _dirs, files in os.walk(icloud_dir):
        for fname in files:
            end_date = _parse_health_export_end_date(fname)
            if end_date is None:
                continue
            path = os.path.join(root, fname)
            if fname.startswith("Step Count"):
                step_files[end_date] = path
            elif fname.startswith("Workouts"):
                workout_files[end_date] = path

    complete_dates = sorted(set(step_files) & set(workout_files))
    if not complete_dates:
        logging.debug("No complete Health Auto Export CSV pairs found in iCloud.")
        return False

    latest = complete_dates[-1]

    existing = intake.get_files_by_source("apple_health")
    if existing:
        current_date = intake.get_source_file_date(
            intake.get_latest_data_file(existing)
        )
        if current_date >= latest:
            logging.info(
                "iCloud export (%s) not newer than current input (%s), skipping.",
                latest,
                current_date,
            )
            return False

    dest_dir = os.path.join(config.INPUT_DATA_DIR, f"apple_health-{latest.isoformat()}")
    os.makedirs(dest_dir, exist_ok=True)
    shutil.copy2(step_files[latest], dest_dir)
    shutil.copy2(workout_files[latest], dest_dir)
    logging.info("Imported Apple Health export dated %s from iCloud.", latest)
    return True


def get_latest_apple_health_data():
    sync_from_icloud()

    existing = intake.get_files_by_source("apple_health")
    if existing:
        latest_file = intake.get_latest_data_file(existing)
        current_date = intake.get_source_file_date(latest_file)
        days_old = (date.today() - current_date).days
        if days_old > _STALE_DAYS:
            logging.warning(
                "Apple Health export is %d days old (last: %s). "
                "Export from Health Auto Export → Save to iCloud to refresh.",
                days_old,
                current_date,
            )

    export_dir = os.path.join(
        config.INPUT_DATA_DIR, intake._latest_filename("apple_health")
    )
    logging.info("Using Apple Health export: %s", export_dir)

    # --- step counts ---
    daily_steps: dict[str, int] = defaultdict(int)
    with open(intake.find_in_dir(export_dir, "Step Count*.csv")) as f:
        reader = csv.DictReader(f)
        date_col = "Date/Time" if "Date/Time" in reader.fieldnames else "Date"
        steps_col = (
            "Step Count (count)"
            if "Step Count (count)" in reader.fieldnames
            else "Step Count (steps)"
        )
        for row in reader:
            daily_steps[transforms.get_date_from_datetime(row[date_col])] = int(
                row[steps_col]
            )

    new_steps = [{"date": d, "steps": s} for d, s in sorted(daily_steps.items())]
    steps_path = os.path.join(config.OUTPUT_DATA_DIR, "step_counts.json")
    with open(steps_path) as f:
        old_steps = json.load(f)["daily_steps"]
    upserted_steps = transforms.upsert_data(old_steps, new_steps, pk="date")
    with open(steps_path, "w") as f:
        f.write(json.dumps({"daily_steps": upserted_steps}, indent=4))

    # --- cardio workouts ---
    workouts = []
    with open(intake.find_in_dir(export_dir, "Workouts*.csv")) as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["Workout Type"] == "Traditional Strength Training":
                continue
            workout = {
                "workoutType": row["Workout Type"],
                "duration": row["Duration"],
                "date": transforms.get_date_from_datetime(row["Start"]),
                "startTime": row["Start"],
                "endTime": row["End"],
                "activeCalories": str(round(float(row["Active Energy (kcal)"]), 2)),
                "basalCalories": str(round(float(row["Resting Energy (kcal)"]), 2)),
            }
            dist_col = "Distance (mi)" if "Distance (mi)" in row else None
            dist = (
                float(row["Distance (mi)"])
                if dist_col
                else float(row["Distance (km)"]) * 0.621371
            )
            if dist > 0:
                workout["distance"] = str(round(dist, 2))
            hr_col = (
                "Avg. Heart Rate (bpm)"
                if "Avg. Heart Rate (bpm)" in row
                else "Avg. Heart Rate (count/min)"
            )
            if row[hr_col]:
                workout["averageHR"] = str(round(float(row[hr_col]), 2))
            workouts.append(workout)

    new_workouts = sorted(workouts, key=lambda x: x["startTime"])
    cardio_path = os.path.join(config.OUTPUT_DATA_DIR, "cardio.json")
    with open(cardio_path) as f:
        old_workouts = json.load(f)["workouts"]
    upserted_workouts = transforms.upsert_data(
        old_workouts, new_workouts, pk="startTime"
    )
    with open(cardio_path, "w") as f:
        f.write(json.dumps({"workouts": upserted_workouts}, indent=4))
