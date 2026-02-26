from flask import Flask, render_template, request
import requests
import requests_cache
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

# Cache API responses for 10 minutes to greatly reduce latency on subsequent identical requests
requests_cache.install_cache('weather_cache', backend='sqlite', expire_after=600)

app = Flask(__name__)

API_KEY = os.environ.get("API_KEY")
BASE_URL = "https://api.openweathermap.org/data/2.5/weather"

@app.route("/", methods=["GET", "POST"])
def index():
    weather_data = None
    error = None
    if request.method == "POST":
        city = request.form.get("city")
        time_format = request.form.get("time_format", "24")
        if city:
            params = {
                "q": city,
                "appid": API_KEY,
                "units": "metric"
            }
            try:
                res = requests.get(BASE_URL, params=params)
                data = res.json()
                if data.get("cod") == 200:
                    tz_offset = data["timezone"]
                    sunrise_unix = data["sys"]["sunrise"]
                    sunset_unix = data["sys"]["sunset"]
                    local_now_unix = int(datetime.utcnow().timestamp()) + tz_offset

                    fmt = "%I:%M %p" if time_format == "12" else "%H:%M"

                    sunrise_local = datetime.utcfromtimestamp(sunrise_unix + tz_offset).strftime(fmt)
                    sunset_local = datetime.utcfromtimestamp(sunset_unix + tz_offset).strftime(fmt)
                    current_local_time = datetime.utcfromtimestamp(local_now_unix).strftime(fmt)
                    current_date = datetime.utcfromtimestamp(local_now_unix).strftime("%d %B %Y")
                    tz_hours = tz_offset // 3600
                    tz_formatted = f"{'+' if tz_hours >= 0 else ''}{tz_hours}:00"

                    weather_data = {
                        "city": data["name"],
                        "country": data["sys"]["country"],
                        "description": data["weather"][0]["description"],
                        "temperature": data["main"]["temp"],
                        "humidity": data["main"]["humidity"],
                        "wind_speed": data["wind"]["speed"],
                        "sunrise": sunrise_local,
                        "sunset": sunset_local,
                        "timezone": tz_formatted,
                        "current_time": current_local_time,
                        "date": current_date,
                        "time_format": time_format,
                        "sunrise_raw": sunrise_unix,
                        "sunset_raw": sunset_unix,
                        "timezone_raw": tz_offset
                    }
                else:
                    error = "City not found!"
            except Exception:
                error = "Could not fetch weather data. Please try again later."

    return render_template("index.html", weather=weather_data, error=error)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
