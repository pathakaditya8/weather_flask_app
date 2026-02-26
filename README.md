# 🌤️ Flask Weather App (Deploy Ready)

## 🚀 Deployment Steps (Render)

1. Push this folder to GitHub.
2. Go to https://render.com → New Web Service.
3. Connect your repo.
4. Build Command:
   pip install -r requirements.txt
5. Start Command:
   gunicorn app:app
6. Add Environment Variable:
   Key: API_KEY
   Value: Your OpenWeather API Key
