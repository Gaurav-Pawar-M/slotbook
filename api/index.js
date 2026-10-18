import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const ADMIN_PASSCODE = process.env.ADMIN_PIN || 'Bgcc@2026';
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

app.use(cors());
app.use(express.json());

const PERMANENT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbz_zM--uO3xakGO61E34G-Wn7jlReIezQcYrx3eVp4UDDcTMm8uhnLV_vfbj5tb9TOh/exec';

// Persistent config helper
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (data && data.googleSheetUrl) return data;
    }
  } catch (e) {
    // Read-only filesystem in some serverless environments, fallback to env/permanent
  }
  return {
    googleSheetUrl: process.env.GOOGLE_SHEET_WEBHOOK_URL || PERMANENT_SHEET_URL
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    // If running in read-only serverless environment, in-memory config is used
  }
}

let config = loadConfig();

// Helper: Sanitize Google Apps Script Web App URL
export function sanitizeGoogleSheetUrl(inputUrl) {
  if (!inputUrl) return '';
  let url = inputUrl.trim();
  // If user pasted edit link: https://script.google.com/macros/s/.../edit
  url = url.replace(/\/edit(\?.*)?$/, '/exec$1');
  // If user pasted without /exec: https://script.google.com/macros/s/AKfy...
  if (url.includes('/macros/s/') && !url.includes('/exec')) {
    url = url.replace(/\/+$/, '') + '/exec';
  }
  return url;
}

// No automatic default slots: all slots must be explicitly added by the admin
const DEFAULT_SCHEDULE = [];

const localCapacityOverrides = {};

const localBookings = [
  {
    bookingId: 'BK-102941',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    name: 'Aman Sharma',
    email: 'f20220199@pilani.bits-pilani.ac.in',
    bitsId: '2022A7PS0199P',
    vertical: 'Client Acquisition',
    date: new Date().toISOString().split('T')[0],
    timeSlot: '17:00 - 18:00',
    status: 'CONFIRMED'
  }
];

function getLocalSlots(dateStr) {
  const overrides = localCapacityOverrides[dateStr] || {};
  const counts = {};
  localBookings.forEach(b => {
    if (b.date === dateStr && b.status !== 'CANCELLED') {
      counts[b.timeSlot] = (counts[b.timeSlot] || 0) + 1;
    }
  });

  const slots = [];
  for (const timeSlot in overrides) {
    const capacity = overrides[timeSlot];
    if (capacity > 0) {
      const booked = counts[timeSlot] || 0;
      const remaining = Math.max(0, capacity - booked);
      slots.push({
        timeSlot,
        capacity,
        booked,
        remaining,
        isAvailable: remaining > 0
      });
    }
  }

  slots.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
  return slots;
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Verify Admin Passcode (Bgcc@2026)
app.post('/api/verify-admin', (req, res) => {
  const { passcode } = req.body;
  if (passcode === ADMIN_PASSCODE) {
    return res.json({ success: true, message: 'Authentication successful.' });
  }
  return res.status(401).json({ success: false, error: 'Incorrect admin passcode.' });
});

// 2. Get current configuration
app.get('/api/config', (req, res) => {
  const isConnected = !!config.googleSheetUrl;
  res.json({
    isConnected,
    googleSheetUrl: config.googleSheetUrl ? config.googleSheetUrl.replace(/(\/exec).*/, '$1') : '',
    hasUrl: isConnected
  });
});

// 3. Update Google Sheet Webhook URL (Admin required)
app.post('/api/config', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== ADMIN_PASSCODE) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin access required.' });
  }

  const sanitizedUrl = sanitizeGoogleSheetUrl(req.body.googleSheetUrl);
  config.googleSheetUrl = sanitizedUrl;
  saveConfig(config);

  res.json({
    success: true,
    message: config.googleSheetUrl ? 'Google Sheet Webhook configured successfully!' : 'Switched to Local Mode',
    isConnected: !!config.googleSheetUrl,
    sanitizedUrl
  });
});

// 4. Test Google Sheet Connection with intelligent diagnostic error parsing
app.post('/api/test-connection', async (req, res) => {
  let url = sanitizeGoogleSheetUrl(req.body.googleSheetUrl || config.googleSheetUrl);
  if (!url) {
    return res.status(400).json({ success: false, error: 'No Google Sheet Webhook URL provided.' });
  }

  try {
    const testUrl = url.includes('?') ? `${url}&action=test` : `${url}?action=test`;
    const response = await fetch(testUrl, { method: 'GET', redirect: 'follow' });
    const rawText = await response.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      // Diagnostic check on HTML returned by Google
      const lowerText = rawText.toLowerCase();

      if (lowerText.includes('accounts.google.com') || lowerText.includes('sign in') || lowerText.includes('service login')) {
        return res.status(400).json({
          success: false,
          error: `Google is requiring a Sign-In (Private Access Error).
CAUSE: You likely created the Google Sheet using a BITS Pilani college account (@pilani.bits-pilani.ac.in) which blocks public Web App access.
FIX: Create the Google Sheet on a PERSONAL Gmail account (@gmail.com), paste Code.gs, and deploy with "Who has access: Anyone". Personal Gmail accounts have zero domain restrictions.`
        });
      }

      if (lowerText.includes('authorization') || lowerText.includes('permission')) {
        return res.status(400).json({
          success: false,
          error: `Google Apps Script requires Authorization.
FIX: In your Google Sheet, click Extensions > Apps Script > Run any function (like initSheets) to trigger and accept the "Review Permissions" dialog, then redeploy.`
        });
      }

      if (!url.endsWith('/exec')) {
        return res.status(400).json({
          success: false,
          error: `Invalid URL format. Your Web App URL must end with "/exec". Currently it is: ${url}`
        });
      }

      return res.status(400).json({
        success: false,
        error: `Received non-JSON response from Google Apps Script. Please verify:
1. "Who has access" is set to "Anyone" (not "Anyone within BITS Pilani").
2. The deployment type is "Web app" and ends with "/exec".
3. If using a college email, please switch to a personal @gmail.com account.`
      });
    }

    if (data && data.success) {
      return res.json({
        success: true,
        message: 'Successfully connected to Google Sheet!',
        sheetTitle: data.sheetTitle,
        timeZone: data.timeZone
      });
    } else {
      return res.status(400).json({ success: false, error: (data && data.error) || 'Failed to connect to Google Sheet.' });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Network error connecting to Google Sheet: ${err.message}`
    });
  }
});

// 5. Get Slots for a specific date (Public - attendees see ONLY timings and remaining slots)
app.get('/api/slots', async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];

  if (config.googleSheetUrl) {
    try {
      const targetUrl = config.googleSheetUrl.includes('?') 
        ? `${config.googleSheetUrl}&action=getSlots&date=${date}`
        : `${config.googleSheetUrl}?action=getSlots&date=${date}`;
      
      const response = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
      const rawText = await response.text();
      const data = JSON.parse(rawText);

      if (data && data.success) {
        return res.json({
          source: 'google-sheets',
          date,
          slots: data.slots
        });
      }
    } catch (err) {
      console.error('Error fetching from Google Sheet, falling back to local:', err);
    }
  }

  const slots = getLocalSlots(date);
  res.json({
    source: 'local',
    date,
    slots
  });
});

// 6. Book a Slot (Single slot per attendee + collects Name, Email, BITS ID, Vertical)
app.post('/api/book', async (req, res) => {
  const { date, timeSlot, name, email, bitsId, vertical } = req.body;

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanBitsId = String(bitsId || '').trim().toUpperCase();
  const cleanName = String(name || '').trim();
  const cleanVertical = String(vertical || '').trim();

  if (!date || !timeSlot || !cleanName || !cleanEmail || !cleanBitsId || !cleanVertical) {
    return res.status(400).json({
      success: false,
      error: 'Please fill in all required fields: Name, Email ID, BITS ID, and Vertical.'
    });
  }

  // If connected to Google Sheet, forward to Google Apps Script
  if (config.googleSheetUrl) {
    try {
      const params = new URLSearchParams({
        action: 'book',
        date,
        timeSlot,
        name: cleanName,
        email: cleanEmail,
        bitsId: cleanBitsId,
        vertical: cleanVertical
      });
      const targetUrl = config.googleSheetUrl.includes('?')
        ? `${config.googleSheetUrl}&${params.toString()}`
        : `${config.googleSheetUrl}?${params.toString()}`;

      const response = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('Google Sheet raw booking response:', rawText);
        return res.status(500).json({
          success: false,
          error: 'Google Sheet returned an error: ' + rawText.replace(/<[^>]*>?/gm, '').substring(0, 200)
        });
      }

      if (data && data.success) {
        return res.json(data);
      } else {
        return res.status(400).json(data || { success: false, error: 'Failed to book slot on Google Sheet.' });
      }
    } catch (err) {
      console.error('Failed to book via Google Sheet:', err);
      return res.status(500).json({
        success: false,
        error: `Google Sheet error: ${err.message}`
      });
    }
  }

  // Local processing
  const existing = localBookings.find(b =>
    b.status !== 'CANCELLED' && (
      b.bitsId.toUpperCase() === cleanBitsId ||
      b.email.toLowerCase() === cleanEmail
    )
  );

  if (existing) {
    return res.status(400).json({
      success: false,
      error: `You have already reserved a slot on ${existing.date} at ${existing.timeSlot}. Each attendee can only book one slot.`
    });
  }

  const slots = getLocalSlots(date);
  const targetSlot = slots.find(s => s.timeSlot === timeSlot);

  if (!targetSlot) {
    return res.status(400).json({ success: false, error: 'Selected time slot does not exist.' });
  }

  if (targetSlot.remaining < 1) {
    return res.status(400).json({
      success: false,
      error: `Sorry! Slot ${timeSlot} is now completely full.`
    });
  }

  const bookingId = 'BK-' + Math.floor(100000 + Math.random() * 900000);
  const newBooking = {
    bookingId,
    timestamp: new Date().toISOString(),
    name: cleanName,
    email: cleanEmail,
    bitsId: cleanBitsId,
    vertical: cleanVertical,
    date,
    timeSlot,
    status: 'CONFIRMED'
  };

  localBookings.unshift(newBooking);

  res.json({
    success: true,
    bookingId,
    message: 'Slot successfully booked!',
    details: newBooking
  });
});

// 7. Get all Bookings (PROTECTED - ONLY Admin can view who booked what)
app.get('/api/bookings', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (adminKey !== ADMIN_PASSCODE) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Only administrators are permitted to view the bookings list.'
    });
  }

  if (config.googleSheetUrl) {
    try {
      const targetUrl = config.googleSheetUrl.includes('?')
        ? `${config.googleSheetUrl}&action=getBookings&adminKey=${ADMIN_PASSCODE}`
        : `${config.googleSheetUrl}?action=getBookings&adminKey=${ADMIN_PASSCODE}`;
      const response = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
      const rawText = await response.text();
      const data = JSON.parse(rawText);
      if (data.success) {
        return res.json({ success: true, bookings: data.bookings, source: 'google-sheets' });
      }
    } catch (err) {
      console.error('Error fetching bookings from Google Sheet:', err);
    }
  }

  res.json({ success: true, bookings: localBookings, source: 'local' });
});

// 8. Update capacity for a slot (PROTECTED - Admin only)
app.post('/api/capacity', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  if (adminKey !== ADMIN_PASSCODE) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin access required.' });
  }

  const { date, timeSlot, capacity } = req.body;
  const numCap = parseInt(capacity, 10);

  if (!date || !timeSlot || isNaN(numCap) || numCap < 0) {
    return res.status(400).json({ success: false, error: 'Invalid capacity update data.' });
  }

  if (config.googleSheetUrl) {
    try {
      const params = new URLSearchParams({
        action: 'setCapacity',
        date,
        timeSlot,
        capacity: numCap,
        adminKey: ADMIN_PASSCODE
      });
      const targetUrl = config.googleSheetUrl.includes('?')
        ? `${config.googleSheetUrl}&${params.toString()}`
        : `${config.googleSheetUrl}?${params.toString()}`;

      const response = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('Google Sheet raw setCapacity response:', rawText);
        return res.status(500).json({
          success: false,
          error: 'Google Sheet returned an error: ' + rawText.replace(/<[^>]*>?/gm, '').substring(0, 200)
        });
      }

      if (data && data.success) {
        return res.json(data);
      } else {
        return res.status(400).json(data || { success: false, error: 'Failed to update capacity on Google Sheet.' });
      }
    } catch (err) {
      console.error('Failed to update capacity in Google Sheet:', err);
      return res.status(500).json({
        success: false,
        error: `Google Sheet error: ${err.message}`
      });
    }
  }

  if (!localCapacityOverrides[date]) {
    localCapacityOverrides[date] = {};
  }
  localCapacityOverrides[date][timeSlot] = numCap;

  res.json({
    success: true,
    message: numCap > 0
      ? `Updated capacity for ${timeSlot} on ${date} to ${numCap} slots.`
      : `Closed slot ${timeSlot} on ${date}.`
  });
});

export default app;
