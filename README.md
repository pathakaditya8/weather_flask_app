# 🌤️ Flask Weather App (SPA + Forecasts)

This project is a small Flask-backed weather SPA that uses OpenWeather APIs to provide:

- Current weather (with icons)
- Hourly (24h) chart
- 7-day forecast
- Air quality (AQI) where available
- Location auto-detect (geolocation)
- Search history & favorites (localStorage)
- Interactive map (Leaflet)
- PWA service worker + manifest (basic)

## Run locally

1. Create a virtualenv and activate it.
2. Install requirements:

```bash
pip install -r requirements.txt
```

3. Create a `.env` file with your OpenWeather API key:

```
API_KEY=your_openweather_api_key_here
```

4. Run the app:

```bash
python app.py
```

5. Open http://127.0.0.1:10000 in your browser.

## Deploy

The app is compatible with standard WSGI hosts. Example start command:

```bash
gunicorn app:app
```

