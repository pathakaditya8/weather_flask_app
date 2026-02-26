from flask import Flask, render_template, request, jsonify
import requests
import requests_cache
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

# Cache API responses for 10 minutes to greatly reduce latency on subsequent identical requests
requests_cache.install_cache('weather_cache', backend='sqlite', expire_after=600)

app = Flask(__name__, static_folder='static', template_folder='templates')

API_KEY = os.environ.get("API_KEY")
if not API_KEY:
    print("Warning: API_KEY not set in environment. Set API_KEY in your .env file.")

GEOCODE_URL = "http://api.openweathermap.org/geo/1.0/direct"
CURRENT_URL = "https://api.openweathermap.org/data/2.5/weather"
FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
AIR_POLLUTION_URL = "http://api.openweathermap.org/data/2.5/air_pollution"


@app.route("/")
def index():
    # main single-page app; frontend will call /api/weather for data
    return render_template("index.html")


def geocode_city(city, limit=1):
    params = {"q": city, "limit": limit, "appid": API_KEY}
    res = requests.get(GEOCODE_URL, params=params, timeout=10)
    res.raise_for_status()
    data = res.json()
    if not data:
        return None
    return data[0]


@app.route('/api/weather')
def api_weather():
    # Accept either q=city or lat & lon. Optional units and lang.
    q = request.args.get('q')
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    units = request.args.get('units', 'metric')
    lang = request.args.get('lang', 'en')

    if not API_KEY:
        return jsonify({"error": "API_KEY not configured on server"}), 500

    try:
        if q and (not lat or not lon):
            geo = geocode_city(q)
            if not geo:
                return jsonify({"error": "Location not found"}), 404
            lat = geo['lat']
            lon = geo['lon']
            location_name = f"{geo.get('name')}, {geo.get('country') or ''}"
        else:
            location_name = request.args.get('label') or ''

        params = {
            'lat': lat,
            'lon': lon,
            'units': units,
            'lang': lang,
            'appid': API_KEY
        }
        
        # Current Weather
        cur_res = requests.get(CURRENT_URL, params=params, timeout=10)
        cur_res.raise_for_status()
        cur_data = cur_res.json()

        # Forecast (5 day / 3 hour)
        fc_res = requests.get(FORECAST_URL, params=params, timeout=10)
        fc_res.raise_for_status()
        fc_data = fc_res.json()

        current_formatted = {
            'temp': cur_data['main']['temp'],
            'humidity': cur_data['main']['humidity'],
            'wind_speed': cur_data['wind']['speed'],
            'wind_deg': cur_data['wind'].get('deg'),
            'weather': cur_data['weather'],
            'dt': cur_data.get('dt'),
            'sunrise': cur_data.get('sys', {}).get('sunrise'),
            'sunset': cur_data.get('sys', {}).get('sunset')
        }

        hourly_formatted = []
        daily_dict = {}

        for item in fc_data.get('list', []):
            dt = item['dt']
            item_temp = item['main']['temp']
            item_pop = item.get('pop', 0)
            
            hourly_formatted.append({
                'dt': dt,
                'temp': item_temp,
                'pop': item_pop
            })

            # Format YYYY-MM-DD
            from datetime import datetime
            date_str = datetime.utcfromtimestamp(dt).strftime('%Y-%m-%d')
            if date_str not in daily_dict:
                daily_dict[date_str] = {
                    'dt': dt,
                    'temp_max': item['main']['temp_max'],
                    'temp_min': item['main']['temp_min'],
                    'weather': item['weather']
                }
            else:
                daily_dict[date_str]['temp_max'] = max(daily_dict[date_str]['temp_max'], item['main']['temp_max'])
                daily_dict[date_str]['temp_min'] = min(daily_dict[date_str]['temp_min'], item['main']['temp_min'])

        daily_formatted = [{
            'dt': v['dt'],
            'temp': {'max': v['temp_max'], 'min': v['temp_min']},
            'weather': v['weather']
        } for v in daily_dict.values()]

        # air pollution (AQI)
        aqi = None
        try:
            ap = requests.get(AIR_POLLUTION_URL, params={'lat': lat, 'lon': lon, 'appid': API_KEY}, timeout=8)
            ap.raise_for_status()
            aqi = ap.json()
        except Exception:
            aqi = None

        payload = {
            'location': cur_data.get('name') or location_name,
            'timezone': cur_data.get('timezone', 0),
            'lat': lat,
            'lon': lon,
            'units': units,
            'lang': lang,
            'current': current_formatted,
            'hourly': hourly_formatted,
            'daily': daily_formatted,
            'alerts': [], # Free tier doesn't include alerts
            'air_pollution': aqi
        }
        return jsonify(payload)

    except requests.HTTPError as e:
        return jsonify({"error": "Upstream API error", "detail": str(e)}), 502
    except Exception as e:
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500


@app.route('/config')
def config():
    # expose only what is safe for public clients (tile API key may be needed)
    return jsonify({
        'tile_api_key': API_KEY or ''
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
