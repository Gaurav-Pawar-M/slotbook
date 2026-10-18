/**
 * ===================================================================
 * Multi-Capacity Calendar Booking System - Google Apps Script Backend
 * ===================================================================
 * 
 * Instructions:
 * 1. Open your Google Sheet.
 * 2. Click "Extensions" > "Apps Script".
 * 3. Delete any default code in Code.gs and paste this entire file.
 * 4. Click "Deploy" > "New deployment".
 * 5. Select type: "Web app".
 * 6. Configuration:
 *    - Description: "Multi-Capacity Booking API"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 7. Click "Deploy" and authorize permissions if prompted.
 * 8. Copy the generated Web App URL and paste it into the Calendar Booking App settings!
 */

const SHEET_SLOTS = "Slots_Config";
const SHEET_BOOKINGS = "Bookings";
const ADMIN_PASSCODE = "Bgcc@2026";

// No automatic default slots: all slots must be explicitly added by the admin
const DEFAULT_SLOTS = [];

/**
 * Ensures the required sheets and headers exist.
 */
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Slots Config Sheet
  let slotSheet = ss.getSheetByName(SHEET_SLOTS);
  if (!slotSheet) {
    slotSheet = ss.insertSheet(SHEET_SLOTS);
    slotSheet.appendRow(["Date", "TimeSlot", "MaxCapacity", "Notes"]);
    slotSheet.getRange("A1:D1").setFontWeight("bold").setBackground("#e0e7ff");
  }

  // 2. Bookings Sheet
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
  } else {
    // If existing sheet has older headers without BitsID / Vertical, ensure header names
    const headers = bookingSheet.getRange(1, 1, 1, bookingSheet.getLastColumn() || 1).getValues()[0];
    if (headers.indexOf("BitsID") === -1) {
      bookingSheet.getRange(1, 5).setValue("BitsID");
      bookingSheet.getRange(1, 6).setValue("Vertical");
    }
  }
}

/**
 * Handle GET requests
 * Public attendees ONLY get slot availability (no attendee info).
 * Admin can fetch all bookings by passing adminKey.
 */
function doGet(e) {
  try {
    initSheets();
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "getSlots";
    const date = (e && e.parameter && e.parameter.date) ? e.parameter.date : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
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
      // Secure endpoint: only admin can view bookings list
      if (adminKey !== ADMIN_PASSCODE) {
        return jsonResponse({ success: false, error: "Unauthorized: Invalid admin credentials." });
      }
      const bookings = getBookingsList();
      return jsonResponse({ success: true, bookings: bookings });
    }

    // Default: getSlots (Public view - ONLY returns slot timing and remaining counts)
    const slots = getSlotsForDate(date);
    return jsonResponse({
      success: true,
      date: date,
      slots: slots
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handle POST requests (Book slot, set capacity, cancel)
 */
function doPost(e) {
  // Use ScriptLock to prevent double-booking
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
 * Calculates current slot availability for a date.
 * Strictly returns slot times and numbers, NEVER personal attendee data.
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
      let rowDate = row[0];
      if (rowDate instanceof Date) {
        rowDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else if (typeof rowDate === "string") {
        rowDate = rowDate.trim();
      }
      const timeSlot = String(row[1]).trim();
      const cap = Number(row[2]);

      if (rowDate === targetDate && timeSlot && !isNaN(cap)) {
        customCapacities[timeSlot] = cap;
      }
    }
  }

  // Count confirmed bookings for that date
  const bookedCounts = {};
  if (bookingSheet) {
    const bookingData = bookingSheet.getDataRange().getValues();
    for (let i = 1; i < bookingData.length; i++) {
      const row = bookingData[i];
      // Headers: BookingID (0), Timestamp (1), Name (2), Email (3), BitsID (4), Vertical (5), Date (6), TimeSlot (7), Status (8)
      let bDate = row[6];
      if (bDate instanceof Date) {
        bDate = Utilities.formatDate(bDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else if (typeof bDate === "string") {
        bDate = bDate.trim();
      }
      const bSlot = String(row[7]).trim();
      const bStatus = String(row[8] || "CONFIRMED").toUpperCase().trim();

      if (bDate === targetDate && bStatus !== "CANCELLED") {
        bookedCounts[bSlot] = (bookedCounts[bSlot] || 0) + 1;
      }
    }
  }

  const result = [];
  const processedSlots = new Set();

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

  // Sort slots chronologically
  result.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));

  return result;
}

/**
 * Atomically checks capacity and records a new booking.
 * Enforces:
 * 1. Required fields: Name, Email, BITS ID, Vertical.
 * 2. Exactly ONE slot per user (checks both BITS ID and Email across all active bookings).
 */
function processBooking(data) {
  const { date, timeSlot, name, email, bitsId, vertical } = data;

  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanBitsId = String(bitsId || "").trim().toUpperCase();
  const cleanName = String(name || "").trim();
  const cleanVertical = String(vertical || "").trim();

  if (!date || !timeSlot || !cleanName || !cleanEmail || !cleanBitsId || !cleanVertical) {
    return {
      success: false,
      error: "All fields are required: Name, Email ID, BITS ID, and Vertical."
    };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const bookingSheet = ss.getSheetByName(SHEET_BOOKINGS);

  // 1. Enforce single booking per user rule
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
            error: `BITS ID "${cleanBitsId}" has already booked a slot (${row[6]} at ${row[7]}). Each attendee can only book one slot.`
          };
        }
        if (existingEmail === cleanEmail) {
          return {
            success: false,
            error: `Email "${cleanEmail}" has already booked a slot (${row[6]} at ${row[7]}). Each attendee can only book one slot.`
          };
        }
      }
    }
  }

  // 2. Check slot capacity
  const slots = getSlotsForDate(date);
  const targetSlot = slots.find(s => s.timeSlot === timeSlot);

  if (!targetSlot) {
    return { success: false, error: "Selected time slot is invalid." };
  }

  if (targetSlot.remaining < 1) {
    return {
      success: false,
      error: `Sorry, this time slot (${timeSlot}) is already fully booked.`
    };
  }

  // 3. Record booking
  const bookingId = "BK-" + Math.floor(100000 + Math.random() * 900000);
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  bookingSheet.appendRow([
    bookingId,
    timestamp,
    cleanName,
    cleanEmail,
    cleanBitsId,
    cleanVertical,
    date,
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
      date: date,
      timeSlot: timeSlot,
      timestamp: timestamp
    }
  };
}

/**
 * Fetch all bookings - Admin only
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
    let bDate = row[6];
    if (bDate instanceof Date) {
      bDate = Utilities.formatDate(bDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
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
 * Updates slot capacity - Admin only
 */
function updateSlotCapacity(data) {
  const { date, timeSlot, capacity, notes = "" } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SLOTS);
  const rows = sheet.getDataRange().getValues();

  let foundRow = -1;
  for (let i = 1; i < rows.length; i++) {
    let rDate = rows[i][0];
    if (rDate instanceof Date) {
      rDate = Utilities.formatDate(rDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    if (rDate === date && String(rows[i][1]).trim() === timeSlot) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    sheet.getRange(foundRow, 3).setValue(Number(capacity));
    if (notes) sheet.getRange(foundRow, 4).setValue(notes);
  } else {
    sheet.appendRow([date, timeSlot, Number(capacity), notes || "Manual update"]);
  }

  return { success: true, message: `Capacity updated to ${capacity} for ${date} ${timeSlot}` };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
