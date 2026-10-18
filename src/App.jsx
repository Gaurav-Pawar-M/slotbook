import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Mail,
  CreditCard,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Settings,
  Lock,
  Unlock,
  FileSpreadsheet,
  RefreshCw,
  X,
  Search,
  Sliders,
  LogOut,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

const COMMON_VERTICALS = [
  'Client Acquisition',
  'Marketing',
  'Product',
  'Education'
];

export default function App() {
  // Navigation & Role
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminPasscodeInput, setAdminPasscodeInput] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminKey, setAdminKey] = useState('');

  // Booking Page State
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [sourceMode, setSourceMode] = useState('local');

  // Booking Modal
  const [bookingModalSlot, setBookingModalSlot] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    name: '',
    email: '',
    bitsId: '',
    vertical: 'Client Acquisition',
    customVertical: ''
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // Settings Modal (Admin only)
  const [showSettings, setShowSettings] = useState(false);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [settingsTesting, setSettingsTesting] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState(null);

  // Admin Data: Bookings & Capacities
  const [allBookings, setAllBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [searchBookingQuery, setSearchBookingQuery] = useState('');
  const [capacityDate, setCapacityDate] = useState(selectedDate);
  const [capacitySlot, setCapacitySlot] = useState('17:00 - 18:00');
  const [capacityValue, setCapacityValue] = useState(10);
  const [updatingCapacity, setUpdatingCapacity] = useState(false);
  const [capacityFeedback, setCapacityFeedback] = useState(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (isAdminLoggedIn) {
      fetchAdminBookings(adminKey);
    }
  }, [isAdminLoggedIn, adminKey]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setIsConnected(data.isConnected);
      if (data.googleSheetUrl) {
        setSheetUrlInput(data.googleSheetUrl);
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  const fetchSlots = async (date) => {
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/slots?date=${date}`);
      const data = await res.json();
      setSlots(data.slots || []);
      setSourceMode(data.source || 'local');
    } catch (err) {
      console.error('Failed to fetch slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Admin Login
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminLoginError('');
    try {
      const res = await fetch('/api/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: adminPasscodeInput })
      });
      const data = await res.json();
      if (data.success) {
        setIsAdminLoggedIn(true);
        setAdminKey(adminPasscodeInput);
        setShowAdminLoginModal(false);
        setAdminPasscodeInput('');
        fetchAdminBookings(adminPasscodeInput);
      } else {
        setAdminLoginError(data.error || 'Incorrect passcode.');
      }
    } catch (err) {
      setAdminLoginError('Connection error validating passcode.');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setAdminKey('');
    setAllBookings([]);
  };

  // Fetch Bookings (Admin Only)
  const fetchAdminBookings = async (key) => {
    setLoadingBookings(true);
    try {
      const res = await fetch('/api/bookings', {
        headers: { 'x-admin-key': key || adminKey }
      });
      const data = await res.json();
      if (data.success) {
        setAllBookings(data.bookings || []);
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    } finally {
      setLoadingBookings(false);
    }
  };

  // Submit Booking (Attendee)
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setBookingSubmitting(true);
    setBookingError('');

    const resolvedVertical =
      bookingForm.vertical === 'Other' && bookingForm.customVertical.trim()
        ? bookingForm.customVertical.trim()
        : bookingForm.vertical;

    try {
      const payload = {
        date: selectedDate,
        timeSlot: bookingModalSlot.timeSlot,
        name: bookingForm.name.trim(),
        email: bookingForm.email.trim(),
        bitsId: bookingForm.bitsId.trim(),
        vertical: resolvedVertical
      };

      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        setConfirmedBooking(data.details || {
          ...payload,
          bookingId: data.bookingId
        });
        setBookingModalSlot(null);
        setBookingForm({
          name: '',
          email: '',
          bitsId: '',
          vertical: 'Client Acquisition',
          customVertical: ''
        });
        // Refresh availability
        fetchSlots(selectedDate);
      } else {
        setBookingError(data.error || 'Failed to complete booking. Please try again.');
      }
    } catch (err) {
      setBookingError('Network error connecting to booking server.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  // Update Slot Capacity (Admin)
  const handleUpdateCapacity = async (e) => {
    e.preventDefault();
    setUpdatingCapacity(true);
    setCapacityFeedback(null);

    try {
      const res = await fetch('/api/capacity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        },
        body: JSON.stringify({
          date: capacityDate,
          timeSlot: capacitySlot,
          capacity: capacityValue
        })
      });
      const data = await res.json();
      if (data.success) {
        setCapacityFeedback({ type: 'success', message: data.message });
        if (capacityDate === selectedDate) {
          fetchSlots(selectedDate);
        }
      } else {
        setCapacityFeedback({ type: 'error', message: data.error || 'Failed to update capacity' });
      }
    } catch (err) {
      setCapacityFeedback({ type: 'error', message: err.message });
    } finally {
      setUpdatingCapacity(false);
    }
  };

  // Save / Test Google Sheet URL (Admin)
  const handleSaveSheetConfig = async (testFirst = false) => {
    setSettingsTesting(true);
    setSettingsFeedback(null);

    try {
      if (testFirst && sheetUrlInput.trim()) {
        const testRes = await fetch('/api/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleSheetUrl: sheetUrlInput.trim() })
        });
        const testData = await testRes.json();
        if (!testData.success) {
          setSettingsFeedback({ type: 'error', message: testData.error });
          setSettingsTesting(false);
          return;
        }
      }

      const saveRes = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey
        },
        body: JSON.stringify({ googleSheetUrl: sheetUrlInput.trim() })
      });
      const saveData = await saveRes.json();

      setIsConnected(saveData.isConnected);
      setSettingsFeedback({
        type: 'success',
        message: saveData.isConnected
          ? 'Connected to Google Sheet successfully!'
          : 'Saved in Local Mode.'
      });
      fetchSlots(selectedDate);
    } catch (err) {
      setSettingsFeedback({ type: 'error', message: 'Error updating configuration: ' + err.message });
    } finally {
      setSettingsTesting(false);
    }
  };

  // Next 14 days list
  const upcomingDates = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = d.getDate();
    return { dateStr, dayName, monthName, dayNum };
  });

  // Filtered Bookings for Admin
  const filteredBookings = allBookings.filter((b) => {
    const q = searchBookingQuery.toLowerCase();
    return (
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.email && b.email.toLowerCase().includes(q)) ||
      (b.bitsId && b.bitsId.toLowerCase().includes(q)) ||
      (b.vertical && b.vertical.toLowerCase().includes(q)) ||
      (b.bookingId && b.bookingId.toLowerCase().includes(q)) ||
      (b.date && b.date.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-lg text-slate-900 tracking-tight">SlotBook</h1>
                {isAdminLoggedIn && (
                  <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-300 flex items-center space-x-1">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Admin Mode</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                {isAdminLoggedIn ? 'Admin Portal - Bookings & Capacity Oversight' : 'Single Slot Reservation Portal'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {isAdminLoggedIn ? (
              <>
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition flex items-center space-x-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Google Sheet Setup</span>
                </button>
                <button
                  onClick={handleAdminLogout}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition flex items-center space-x-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Exit Admin</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAdminLoginModal(true)}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center space-x-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition"
                title="Admin Login"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Admin Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {!isAdminLoggedIn ? (
          /* ================= ATTENDEE BOOKING INTERFACE ================= */
          <div>
            {/* Clean Hero */}
            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Reserve Your Slot
              </h2>
              <p className="text-slate-600 mt-1 text-sm sm:text-base">
                Select your preferred time slot and submit your details. Note: <strong>Each attendee can book only one slot.</strong>
              </p>
            </div>

            {/* Date Selection */}
            <div className="mb-8 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Select Date
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500">Other date:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Horizontal Date Picker */}
              <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-thin">
                {upcomingDates.map((item) => {
                  const isSelected = item.dateStr === selectedDate;
                  return (
                    <button
                      key={item.dateStr}
                      onClick={() => setSelectedDate(item.dateStr)}
                      className={`flex-shrink-0 flex flex-col items-center justify-center w-18 sm:w-20 py-3 rounded-xl border text-center transition ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100 font-medium scale-102'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className={`text-xs font-semibold uppercase ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {item.dayName}
                      </span>
                      <span className="text-xl font-bold my-0.5">{item.dayNum}</span>
                      <span className={`text-[11px] ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                        {item.monthName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Available Slots */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-900 text-lg">
                    Available Slots for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h3>
                </div>
                <button
                  onClick={() => fetchSlots(selectedDate)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSlots ? 'animate-spin' : ''}`} />
                  <span>Refresh Availability</span>
                </button>
              </div>

              {loadingSlots ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="h-36 bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                      <div className="h-5 bg-slate-200 rounded w-1/2 mb-4" />
                      <div className="h-4 bg-slate-100 rounded w-3/4 mb-6" />
                      <div className="h-9 bg-slate-200 rounded w-full" />
                    </div>
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <h4 className="font-bold text-slate-800">No slots scheduled for this date</h4>
                  <p className="text-sm text-slate-500 mt-1">Please select another date above.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {slots.map((slot) => {
                    const isFullyBooked = slot.remaining <= 0;
                    const isAlmostFull = slot.remaining > 0 && slot.remaining <= 2;

                    return (
                      <div
                        key={slot.timeSlot}
                        className={`bg-white rounded-2xl border p-5 transition flex flex-col justify-between ${
                          isFullyBooked
                            ? 'border-slate-200 opacity-70 bg-slate-50/50'
                            : 'border-slate-200/90 hover:border-indigo-300 hover:shadow-md'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center space-x-1.5 font-bold text-slate-900 text-lg">
                                <Clock className="w-4 h-4 text-slate-400" />
                                <span>{slot.timeSlot}</span>
                              </div>
                              <span className="text-xs text-slate-500 mt-0.5 block">
                                Multi-Capacity Slot
                              </span>
                            </div>

                            <div>
                              {isFullyBooked ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300">
                                  Full
                                </span>
                              ) : isAlmostFull ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                                  {slot.remaining} Left!
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {slot.remaining} Slots Available
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Capacity status note */}
                          <div className="mt-4 text-xs text-slate-500">
                            {isFullyBooked
                              ? 'All seats for this slot have been reserved.'
                              : `${slot.remaining} of ${slot.capacity} openings remaining for this time.`}
                          </div>
                        </div>

                        {/* Booking CTA */}
                        <div className="mt-5 pt-4 border-t border-slate-100">
                          <button
                            disabled={isFullyBooked}
                            onClick={() => {
                              setBookingModalSlot(slot);
                              setBookingError('');
                            }}
                            className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition flex items-center justify-center space-x-2 ${
                              isFullyBooked
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow active:scale-98'
                            }`}
                          >
                            <span>{isFullyBooked ? 'Slot Full' : 'Book This Slot'}</span>
                            {!isFullyBooked && <ArrowRight className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================= ADMIN MANAGEMENT PORTAL ================= */
          <div className="space-y-8">
            {/* Header info */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex items-start space-x-3">
              <ShieldAlert className="w-6 h-6 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-amber-900 text-sm">Confidential Admin Oversight</h3>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Only administrators have access to this screen. Regular attendees cannot view attendee rosters, BITS IDs, or booking histories.
                </p>
              </div>
            </div>

            {/* Capacity Override Tool */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center space-x-2 mb-3">
                <Sliders className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-lg">Configure Slot Capacity</h3>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Set how many slots are open for a given time frame (e.g., set 17:00 - 18:00 to 10 slots).
              </p>

              <form onSubmit={handleUpdateCapacity} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={capacityDate}
                    onChange={(e) => setCapacityDate(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Time Slot</label>
                  <select
                    value={capacitySlot}
                    onChange={(e) => setCapacitySlot(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="09:00 - 10:00">09:00 - 10:00</option>
                    <option value="10:00 - 11:00">10:00 - 11:00</option>
                    <option value="11:00 - 12:00">11:00 - 12:00</option>
                    <option value="12:00 - 13:00">12:00 - 13:00</option>
                    <option value="14:00 - 15:00">14:00 - 15:00</option>
                    <option value="15:00 - 16:00">15:00 - 16:00</option>
                    <option value="16:00 - 17:00">16:00 - 17:00</option>
                    <option value="17:00 - 18:00">17:00 - 18:00 (5 to 6)</option>
                    <option value="18:00 - 19:00">18:00 - 19:00</option>
                    <option value="19:00 - 20:00">19:00 - 20:00</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity (Max Slots)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={capacityValue}
                    onChange={(e) => setCapacityValue(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={updatingCapacity}
                    className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition shadow-sm"
                  >
                    {updatingCapacity ? 'Saving...' : 'Update Capacity'}
                  </button>
                </div>
              </form>

              {capacityFeedback && (
                <div
                  className={`mt-4 p-3 rounded-lg text-xs font-medium flex items-center space-x-2 ${
                    capacityFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{capacityFeedback.message}</span>
                </div>
              )}
            </div>

            {/* Bookings Master Table */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Attendee Bookings Master List</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sourceMode === 'google-sheets'
                      ? 'Synced with Google Sheet (Private)'
                      : 'Showing current local booking store'}
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search name, BITS ID, vertical..."
                      value={searchBookingQuery}
                      onChange={(e) => setSearchBookingQuery(e.target.value)}
                      className="text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56 sm:w-72"
                    />
                  </div>
                  <button
                    onClick={() => fetchAdminBookings(adminKey)}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                    title="Refresh Bookings"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingBookings ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {loadingBookings ? (
                <div className="py-12 text-center text-sm text-slate-400">Loading attendee bookings...</div>
              ) : filteredBookings.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No bookings found matching query.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                        <th className="py-3 px-4">Ref ID</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Time Slot</th>
                        <th className="py-3 px-4">Attendee Name</th>
                        <th className="py-3 px-4">BITS ID</th>
                        <th className="py-3 px-4">Vertical</th>
                        <th className="py-3 px-4">Email ID</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBookings.map((b) => (
                        <tr key={b.bookingId || Math.random()} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono font-bold text-indigo-700">{b.bookingId}</td>
                          <td className="py-3 px-4 font-medium text-slate-800">{b.date}</td>
                          <td className="py-3 px-4 text-slate-700 font-semibold">{b.timeSlot}</td>
                          <td className="py-3 px-4 text-slate-900 font-medium">{b.name}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800 bg-slate-50 px-2 rounded">
                            {b.bitsId || '-'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {b.vertical || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500">{b.email}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {b.status || 'CONFIRMED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ================= BOOKING MODAL (ATTENDEE) ================= */}
      {bookingModalSlot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6 relative">
              <button
                onClick={() => setBookingModalSlot(null)}
                className="absolute right-4 top-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-xs uppercase tracking-wider font-semibold text-indigo-200">Slot Reservation</div>
              <h3 className="text-xl font-bold mt-1">Book Your Slot</h3>
              <div className="mt-3 flex items-center space-x-3 text-xs bg-white/15 px-3 py-1.5 rounded-xl w-fit">
                <span className="font-semibold">{selectedDate}</span>
                <span>•</span>
                <span>{bookingModalSlot.timeSlot}</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleBookingSubmit} className="p-6 space-y-4">
              {bookingError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{bookingError}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Full Name *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={bookingForm.name}
                  onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Email ID *</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="f2023xxxx@pilani.bits-pilani.ac.in"
                  value={bookingForm.email}
                  onChange={(e) => setBookingForm({ ...bookingForm, email: e.target.value })}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* BITS ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  <span>BITS ID *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2023A7PS0001P"
                  value={bookingForm.bitsId}
                  onChange={(e) => setBookingForm({ ...bookingForm, bitsId: e.target.value.toUpperCase() })}
                  className="w-full text-sm font-mono uppercase bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Only one slot reservation is permitted per BITS ID.
                </span>
              </div>

              {/* Vertical */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span>Vertical *</span>
                </label>
                <select
                  value={bookingForm.vertical}
                  onChange={(e) => setBookingForm({ ...bookingForm, vertical: e.target.value })}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                >
                  {COMMON_VERTICALS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                {bookingForm.vertical === 'Other' && (
                  <input
                    type="text"
                    required
                    placeholder="Please specify your vertical"
                    value={bookingForm.customVertical}
                    onChange={(e) => setBookingForm({ ...bookingForm, customVertical: e.target.value })}
                    className="w-full mt-2 text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={bookingSubmitting}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-md shadow-indigo-100 flex items-center justify-center space-x-2"
                >
                  {bookingSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Recording Slot...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Reserve (1 Slot)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= CONFIRMATION MODAL (ATTENDEE) ================= */}
      {confirmedBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <h3 className="text-2xl font-black text-slate-900">Slot Confirmed!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Your response has been stored. You may now close this page.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 my-6 text-left border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">Booking Ref:</span>
                <span className="font-mono font-bold text-indigo-700">{confirmedBooking.bookingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Name:</span>
                <span className="font-semibold text-slate-800">{confirmedBooking.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">BITS ID:</span>
                <span className="font-mono font-bold text-slate-800">{confirmedBooking.bitsId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vertical:</span>
                <span className="font-semibold text-indigo-600">{confirmedBooking.vertical}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="font-semibold text-slate-800">{confirmedBooking.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Time Slot:</span>
                <span className="font-semibold text-slate-800">{confirmedBooking.timeSlot}</span>
              </div>
            </div>

            <button
              onClick={() => setConfirmedBooking(null)}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-sm"
            >
              Done & Exit
            </button>
          </div>
        </div>
      )}

      {/* ================= ADMIN LOGIN MODAL ================= */}
      {showAdminLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Lock className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Admin Verification</h3>
              </div>
              <button
                onClick={() => {
                  setShowAdminLoginModal(false);
                  setAdminLoginError('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Enter the admin passcode to access full booking records and configure capacities.
            </p>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              {adminLoginError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  {adminLoginError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Passcode</label>
                <input
                  type="password"
                  required
                  placeholder="Enter passcode (default: Bgcc@2026)"
                  value={adminPasscodeInput}
                  onChange={(e) => setAdminPasscodeInput(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-sm"
              >
                Access Admin Portal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================= GOOGLE SHEET SETTINGS MODAL (ADMIN) ================= */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                <h3 className="font-bold text-lg text-slate-900">Google Sheet Connection</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Instructions:
                </h4>
                <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-4">
                  <li>
                    <strong>Important:</strong> Use a <strong>Personal Gmail account (@gmail.com)</strong>. College BITS accounts often restrict web apps to internal domain members.
                  </li>
                  <li>In your Google Sheet, click <strong>Extensions &gt; Apps Script</strong>.</li>
                  <li>
                    Paste the updated script from <code className="bg-slate-200 px-1 py-0.5 rounded text-indigo-700 font-mono">google-apps-script/Code.gs</code>.
                  </li>
                  <li>
                    Click <strong>Deploy &gt; New deployment &gt; Web app</strong>.
                  </li>
                  <li>
                    Set <em>Who has access</em> to <strong>Anyone</strong> (and complete the one-time Google "Review permissions" / "Allow" flow).
                  </li>
                  <li>Paste the generated Web App URL below (must end with <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">/exec</code>).</li>
                </ol>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Apps Script Web App URL
                </label>
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {settingsFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center space-x-2 ${
                    settingsFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{settingsFeedback.message}</span>
                </div>
              )}

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  disabled={settingsTesting}
                  onClick={() => handleSaveSheetConfig(true)}
                  className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center justify-center space-x-2"
                >
                  {settingsTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  <span>Test & Save Connection</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSheetUrlInput('');
                    handleSaveSheetConfig(false);
                  }}
                  className="py-2.5 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition"
                >
                  Switch to Local Mode
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <span>SlotBook • Dynamic Multi-Capacity Calendar Reservation System</span>
          <span>Attendee Privacy Guaranteed (Records visible only to Admin)</span>
        </div>
      </footer>
    </div>
  );
}
