from __future__ import annotations

import csv
import json
import logging
import os
import unicodedata
from collections import defaultdict
from datetime import datetime

from lxml import etree

from .. import config, intake, io, transforms

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


def get_latest_apple_health_data():
    export_dir = os.path.join(
        config.INPUT_DATA_DIR, intake._latest_filename("apple_health")
    )
    logging.info(f"Using Apple Health export: {export_dir}")

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
