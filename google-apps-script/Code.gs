/**
 * ===================================================================
 * BGCC Slot Booking System - Google Apps Script Backend
 * ===================================================================
 * 
 * Deployment Checklist:
 * 1. Open your Google Sheet.
 * 2. Extensions > Apps Script > Paste this entire file into Code.gs.
 * 3. Click "Deploy" > "Manage deployments" > Edit (pencil) > New version > Deploy.
 *    (Ensure "Execute as" is "Me" and "Who has access" is "Anyone").
 */

const SHEET_SLOTS = "Slots_Config";
const SHEET_BOOKINGS = "Bookings";
const ADMIN_PASSCODE = "Bgcc@2026";

/**
 * Normalizes any Date object or string (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY) into YYYY-MM-DD.
 */
function normalizeDateStr(d, timeZone) {
  if (!d) return "";
  if (d instanceof Date) {
    return Utilities.formatDate(d, timeZone || Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const s = String(d).trim();
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) { // YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) { // DD-MM-YYYY or DD/MM/YYYY
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return s;
}

/**
 * Ensures required sheets and headers exist.
 */
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let slotSheet = ss.getSheetByName(SHEET_SLOTS);
  if (!slotSheet) {
    slotSheet = ss.insertSheet(SHEET_SLOTS);
    slotSheet.appendRow(["Date", "TimeSlot", "MaxCapacity", "Notes"]);
    slotSheet.getRange("A1:D1").setFontWeight("bold").setBackground("#e0e7ff");
  }

  let bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!bookingSheet) {
    bookingSheet = ss.insertSheet(SHEET_BOOKINGS);
    bookingSheet.appendRow([
      "BookingID",
      "Timestamp",
      "Name",
      "Email",
      "BitsID",
      "Vertical",
      "Date",
      "TimeSlot",
      "Status"
    ]);
    bookingSheet.getRange("A1:I1").setFontWeight("bold").setBackground("#c7d2fe");
  }
}

/**
 * Handles GET requests.
 * Supports getSlots, getBookings, setCapacity, and book (seamless URL support).
 */
function doGet(e) {
  try {
    initSheets();
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "getSlots";
    const rawDate = (e && e.parameter && e.parameter.date) ? e.parameter.date : "";
    const date = normalizeDateStr(rawDate || new Date());
    const adminKey = (e && e.parameter && e.parameter.adminKey) ? e.parameter.adminKey : "";

    if (action === "test") {
      return jsonResponse({
        success: true,
        message: "Google Sheet connection successful!",
        sheetTitle: SpreadsheetApp.getActiveSpreadsheet().getName(),
        timeZone: Session.getScriptTimeZone()
      });
    }

    if (action === "getBookings") {
      if (adminKey !== ADMIN_PASSCODE) {
        return jsonResponse({ success: false, error: "Unauthorized: Invalid admin credentials." });
      }
      return jsonResponse({ success: true, bookings: getBookingsList() });
    }

    if (action === "setCapacity") {
      if (adminKey !== ADMIN_PASSCODE) {
        return jsonResponse({ success: false, error: "Unauthorized: Invalid admin passcode." });
      }
      const timeSlot = (e && e.parameter && e.parameter.timeSlot) ? e.parameter.timeSlot.trim() : "";
      const capacity = Number((e && e.parameter && e.parameter.capacity) || 0);
      const result = updateSlotCapacity({ date, timeSlot, capacity });
      return jsonResponse(result);
    }

    if (action === "book") {
      const result = processBooking({
        date: date,
        timeSlot: (e && e.parameter && e.parameter.timeSlot) ? e.parameter.timeSlot.trim() : "",
        name: (e && e.parameter && e.parameter.name) ? e.parameter.name.trim() : "",
        email: (e && e.parameter && e.parameter.email) ? e.parameter.email.trim() : "",
        bitsId: (e && e.parameter && e.parameter.bitsId) ? e.parameter.bitsId.trim() : "",
        vertical: (e && e.parameter && e.parameter.vertical) ? e.parameter.vertical.trim() : ""
      });
      return jsonResponse(result);
    }

    // Default: getSlots
    return jsonResponse({
      success: true,
      date: date,
      slots: getSlotsForDate(date)
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handles POST requests.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonResponse({
      success: false,
      error: "System busy processing bookings. Please retry in a few seconds."
    });
  }

  try {
    initSheets();
    const rawData = e.postData ? e.postData.contents : "{}";
    const data = JSON.parse(rawData);
    const action = data.action || "book";

    if (action === "book") {
      const result = processBooking(data);
      lock.releaseLock();
      return jsonResponse(result);
    } else if (action === "setCapacity") {
      if (data.adminKey !== ADMIN_PASSCODE) {
        lock.releaseLock();
        return jsonResponse({ success: false, error: "Unauthorized: Invalid admin passcode." });
      }
      const result = updateSlotCapacity(data);
      lock.releaseLock();
      return jsonResponse(result);
    }

    lock.releaseLock();
    return jsonResponse({ success: false, error: "Unknown action" });
  } catch (err) {
    lock.releaseLock();
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Calculates slot availability for a date.
 * Only returns slots explicitly configured by admin where capacity > 0.
 */
function getSlotsForDate(targetDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const slotSheet = ss.getSheetByName(SHEET_SLOTS);
  const bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);

  const customCapacities = {};
  if (slotSheet) {
    const slotData = slotSheet.getDataRange().getValues();
    for (let i = 1; i < slotData.length; i++) {
      const row = slotData[i];
      const rowDate = normalizeDateStr(row[0]);
      const timeSlot = String(row[1]).trim();
      const cap = Number(row[2]);

      if (rowDate === targetDate && timeSlot && !isNaN(cap)) {
        customCapacities[timeSlot] = cap;
      }
    }
  }

  // Count confirmed bookings
  const bookedCounts = {};
  if (bookingSheet) {
    const bookingData = bookingSheet.getDataRange().getValues();
    for (let i = 1; i < bookingData.length; i++) {
      const row = bookingData[i];
      const bDate = normalizeDateStr(row[6]);
      const bSlot = String(row[7]).trim();
      const bStatus = String(row[8] || "CONFIRMED").toUpperCase().trim();

      if (bDate === targetDate && bStatus !== "CANCELLED") {
        bookedCounts[bSlot] = (bookedCounts[bSlot] || 0) + 1;
      }
    }
  }

  const result = [];
  for (const slotName in customCapacities) {
    const capacity = Number(customCapacities[slotName]);
    if (capacity > 0) {
      const booked = bookedCounts[slotName] || 0;
      const remaining = Math.max(0, capacity - booked);
      result.push({
        timeSlot: slotName,
        capacity: capacity,
        booked: booked,
        remaining: remaining,
        isAvailable: remaining > 0
      });
    }
  }

  result.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
  return result;
}

/**
 * Records a new booking.
 */
function processBooking(data) {
  const { timeSlot, name, email, bitsId, vertical } = data;
  const targetDate = normalizeDateStr(data.date);

  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanBitsId = String(bitsId || "").trim().toUpperCase();
  const cleanName = String(name || "").trim();
  const cleanVertical = String(vertical || "").trim();

  if (!targetDate || !timeSlot || !cleanName || !cleanEmail || !cleanBitsId || !cleanVertical) {
    return {
      success: false,
      error: "All fields are required: Name, Email ID, BITS ID, and Vertical."
    };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);

  // Enforce single booking per user
  if (bookingSheet) {
    const existingData = bookingSheet.getDataRange().getValues();
    for (let i = 1; i < existingData.length; i++) {
      const row = existingData[i];
      const existingEmail = String(row[3] || "").trim().toLowerCase();
      const existingBitsId = String(row[4] || "").trim().toUpperCase();
      const existingStatus = String(row[8] || "CONFIRMED").toUpperCase().trim();

      if (existingStatus !== "CANCELLED") {
        if (existingBitsId === cleanBitsId) {
          return {
            success: false,
            error: `BITS ID "${cleanBitsId}" has already reserved a slot (${row[6]} at ${row[7]}). Each attendee can only book one slot.`
          };
        }
        if (existingEmail === cleanEmail) {
          return {
            success: false,
            error: `Email "${cleanEmail}" has already reserved a slot (${row[6]} at ${row[7]}). Each attendee can only book one slot.`
          };
        }
      }
    }
  }

  // Check capacity
  const slots = getSlotsForDate(targetDate);
  const targetSlot = slots.find(s => s.timeSlot === timeSlot);

  if (!targetSlot) {
    return { success: false, error: "Selected time slot is invalid or not open." };
  }

  if (targetSlot.remaining < 1) {
    return {
      success: false,
      error: `Sorry, slot ${timeSlot} is already full.`
    };
  }

  const bookingId = "BK-" + Math.floor(100000 + Math.random() * 900000);
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  bookingSheet.appendRow([
    bookingId,
    timestamp,
    cleanName,
    cleanEmail,
    cleanBitsId,
    cleanVertical,
    targetDate,
    timeSlot,
    "CONFIRMED"
  ]);

  return {
    success: true,
    bookingId: bookingId,
    message: "Slot successfully booked!",
    details: {
      bookingId: bookingId,
      name: cleanName,
      email: cleanEmail,
      bitsId: cleanBitsId,
      vertical: cleanVertical,
      date: targetDate,
      timeSlot: timeSlot,
      timestamp: timestamp
    }
  };
}

/**
 * Returns all bookings - Admin only
 */
function getBookingsList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const bookings = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const bDate = normalizeDateStr(row[6]);
    let bTimestamp = row[1];
    if (bTimestamp instanceof Date) {
      bTimestamp = Utilities.formatDate(bTimestamp, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    }

    bookings.push({
      bookingId: row[0],
      timestamp: bTimestamp,
      name: row[2],
      email: row[3],
      bitsId: row[4],
      vertical: row[5],
      date: bDate,
      timeSlot: row[7],
      status: row[8] || "CONFIRMED"
    });
  }

  return bookings.reverse();
}

/**
 * Updates slot capacity in Slots_Config.
 */
function updateSlotCapacity(data) {
  const targetDate = normalizeDateStr(data.date);
  const timeSlot = String(data.timeSlot || "").trim();
  const capacity = Number(data.capacity);
  const notes = data.notes || "";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SLOTS);
  const rows = sheet.getDataRange().getValues();

  let foundRow = -1;
  for (let i = 1; i < rows.length; i++) {
    const rDate = normalizeDateStr(rows[i][0]);
    if (rDate === targetDate && String(rows[i][1]).trim() === timeSlot) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    sheet.getRange(foundRow, 3).setValue(capacity);
    if (notes) sheet.getRange(foundRow, 4).setValue(notes);
  } else {
    sheet.appendRow([targetDate, timeSlot, capacity, notes || "Set from Admin Portal"]);
  }

  return {
    success: true,
    message: capacity > 0
      ? `Updated capacity for ${timeSlot} on ${targetDate} to ${capacity} slots.`
      : `Closed slot ${timeSlot} on ${targetDate}.`
  };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
