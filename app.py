from flask import Flask, render_template, jsonify
import csv
import os

app = Flask(__name__)

# -------------------------------------------------------
# CONFIGURATION
# -------------------------------------------------------
DATA_FILE = "temperature_daily.csv"
LEVEL2_YEAR_COUNT = 10  # Number of recent years to show in Level 2

# -------------------------------------------------------
# HELPER FUNCTIONS
# -------------------------------------------------------

def load_temperature_data():
    """
    Reads the CSV file and returns a list of dictionaries,
    each containing date, max_temperature, and min_temperature.
    """
    data = []
    with open(DATA_FILE, newline="") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            data.append({
                "date": row["date"],
                "max_temperature": int(row["max_temperature"]),
                "min_temperature": int(row["min_temperature"])
            })
    return data


def get_recent_years(data, num_years):
    """
    Filters data to only include the most recent num_years years.
    Used for Level 2 where we only show last 5-10 years.
    """
    all_years = sorted(set(row["date"][:4] for row in data))
    recent_years = all_years[-num_years:]
    return [row for row in data if row["date"][:4] in recent_years]


# -------------------------------------------------------
# ROUTES
# -------------------------------------------------------

@app.route("/")
def index():
    """Serves the main HTML page."""
    return render_template("index.html")


@app.route("/api/data/level1")
def get_level1_data():
    """
    Returns all temperature data for Level 1 heatmap.
    Frontend will aggregate this by year and month.
    """
    data = load_temperature_data()
    return jsonify(data)


@app.route("/api/data/level2")
def get_level2_data():
    """
    Returns only the last 10 years of data for Level 2.
    """
    data = load_temperature_data()
    recent_data = get_recent_years(data, LEVEL2_YEAR_COUNT)
    return jsonify(recent_data)

if __name__ == "__main__":
    app.run(debug=True)