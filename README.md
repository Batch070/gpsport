# 28th H.P. Inter Polytechnic Sports Meet 2026 — Live Results & Fixtures Portal

Official static multi-page website built with HTML5, CSS3, and vanilla JavaScript, integrated in real-time with the master Google Sheet.

**Google Sheet URL:** [28th H.P. Inter-Polytechnic Sports Meet Google Sheet](https://docs.google.com/spreadsheets/d/1y0masQaA-ulnkQshPy7_Rno8837PkYcN/edit?usp=sharing)  
**Spreadsheet ID:** `1y0masQaA-ulnkQshPy7_Rno8837PkYcN`

---

## ⚡ How the Live Google Sheet Sync Works

1. **Direct Client-Side Integration**:  
   The website uses the Google Visualization API (`gviz/tq`) with JSONP fallback to query the spreadsheet directly from the viewer's browser.
   - **No backend server, PHP, or database is required.**
   - **Zero API keys or OAuth setup needed** — as long as the spreadsheet is set to *"Anyone with the link can view"*, the website reads the data in real time.

2. **Automatic 30-Second Refresh**:  
   Every 30 seconds (`SPORTS_CONFIG.REFRESH_INTERVAL_MS = 30000`), the frontend polls the Google Sheet in the background. Whenever organizers enter a winner, update a score, or adjust match times, the website updates automatically without requiring a full page reload.

3. **Manual Refresh Button**:  
   Viewers can click the **↻ Refresh** button anytime to instantly pull the freshest match data.

4. **Offline / Fallback Resilience**:  
   An initial data snapshot is embedded in `assets/js/sheets.js`. If viewers have slow or spotty internet, the site loads instantly with the latest cached state and seamlessly synchronizes as soon as connection is available.

---

## 🏆 Sports Disciplines & Worksheets Mapped

The website pulls and reconciles data across 12 worksheets in the Google Sheet:

| Discipline | Schedule Sheet | Results Sheet | Total Matches |
| :--- | :--- | :--- | :--- |
| **Badminton** | `Badminton_schedule` | `Result_Badminton` | 14 |
| **Table Tennis** | `TT_schedule ` | `Result_TT` | 13 |
| **Volleyball** | `VolleyBallschedule` | `Result_VolleyBall` | 14 |
| **Basketball** | `BasketBallschedule` | `Result_BasketBall` | 10 |
| **Kabaddi** | `Kabaddischedule` | `Result_Kabaddi` | 14 |
| **Champions Summary** | `Champions_Summary` | — | 5 Disciplines |
| **Participating Teams**| `Name of Institutes` | — | 15 Government Polytechnics |

---

## 📝 How Organizers Update Match Details & Results

When organizers edit the Google Sheet:
1. **Match Winners & Scores**: Enter the winning institute in the `WINNER` column of `Result_<Sport>`. The website will automatically display the green `🏆 Winner: [Institute]` badge on fixture cards and list them on the Results page.
2. **Schedule Times & Dates**: Update the `Time` or `Date` in `<Sport>_schedule` or `Result_<Sport>`. The website reflects the updated timetable immediately.
3. **Tournament Champions**: As finals conclude, update `Champions_Summary` with the Champion and Runner-up. The overview and results leaderboards update live.

---

## 🚀 How to Run and Preview the Website

Simply open `index.html` in any web browser, or use a local static server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js npx
npx serve .
```

Then visit `http://localhost:8000` in your browser.
