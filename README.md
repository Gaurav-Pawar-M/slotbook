# 📅 SlotBook - Multi-Capacity Calendar Booking App (Google Sheets Integrated)

A simple, modern calendar booking web application designed specifically for **multi-capacity time slots**. Unlike standard Google Calendar (which only allows 1 booking per time slot), SlotBook allows you to set any capacity (e.g., **10 slots for 5:00 PM – 6:00 PM**) and tracks remaining availability dynamically in real-time.

All data is synchronized with your own **Google Sheet**.

---

## 🚀 Quick Start

### 1. Run the App Locally
Open a terminal in the project directory (`d:\calendar-booking-app`):

```bash
npm install
npm run dev
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000

*The app works immediately in Local Demo Mode even before connecting a Google Sheet.*

---

## 📊 How to Link Your Google Sheet (1-Minute Setup)

You don't need any complex Google Cloud credentials or API keys. Follow these 4 simple steps:

### Step 1: Open Google Sheets
1. Create a blank Google Sheet in your Google Drive (e.g., name it `My Bookings`).
2. In the top menu, click **Extensions** > **Apps Script**.

### Step 2: Paste the Script
1. Delete any existing code in the editor (`Code.gs`).
2. Open the file `google-apps-script/Code.gs` in this repository, copy everything, and paste it into the Google Apps Script editor.
3. Click the **Save** disk icon (or press `Ctrl+S`).

### Step 3: Deploy as Web App
1. Click the blue **Deploy** button at top right > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description**: `Calendar Booking Backend`
   - **Execute as**: `Me (<your-email>)`
   - **Who has access**: `Anyone` *(Crucial: allows the booking app to communicate with your sheet securely)*
4. Click **Deploy** and grant permissions if prompted by Google.
5. Copy the generated **Web app URL** (looks like `https://script.google.com/macros/s/AKfycb.../exec`).

### Step 4: Paste into SlotBook
1. Open http://localhost:3000 in your browser.
2. Click the **Settings (gear icon)** or the **Connection Badge** in the top navigation bar.
3. Paste your Web app URL into the box and click **Test & Save Connection**.
4. That's it! Your Google Sheet will automatically generate two tabs:
   - `Slots_Config`: Defines date, time slot, and total capacity (e.g. 5:00 - 6:00 PM with 10 slots).
   - `Bookings`: Automatically records every confirmed reservation with Booking ID, attendee name, email, seats, and timestamp.

---

## ⚡ Features

- **Multi-Capacity Slots**: Set any capacity per slot (e.g. 10 people at 5:00 PM).
- **Dynamic Capacity Meter**: Real-time progress bar and remaining slot counter (e.g. "7 of 10 available", "2 left!").
- **Multi-Seat Selection**: Users can book 1 or multiple slots up to the available capacity.
- **Concurrency & Overbooking Protection**: Google Apps Script `LockService` guarantees that simultaneous bookings never exceed the capacity.
- **Admin Dashboard**:
  - Live log of all bookings with instant search/filter.
  - Interactive capacity manager to change capacities for any date and slot on the fly.
- **Dual Mode**: Runs in instant Local Mock Mode or 100% Synced Google Sheets Mode.

---

## 🛠️ Project Structure

```
d:/calendar-booking-app/
├── google-apps-script/
│   └── Code.gs            # Ready-to-paste Google Apps Script backend
├── src/
│   ├── App.jsx            # Main React Booking & Admin UI
│   ├── main.jsx           # React root
│   └── index.css          # Tailwind CSS styles
├── server.js              # Express API & Google Sheets bridge
├── vite.config.js         # Vite configuration with API proxy
├── package.json           # Dependencies and scripts
└── README.md              # Documentation
```
