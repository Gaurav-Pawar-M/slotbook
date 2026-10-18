import http from 'http';

async function runTests() {
  console.log('--- Starting Updated API Verification Tests ---');

  const request = (path, method = 'GET', body = null, headers = {}) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };

  try {
    const today = new Date().toISOString().split('T')[0];

    // Test 1: Public Slot Availability (Does not leak attendee data)
    const slotsRes = await request(`/api/slots?date=${today}`);
    console.log(`✓ GET /api/slots returned ${slotsRes.body.slots.length} slots for ${today}`);
    const slot5to6 = slotsRes.body.slots.find(s => s.timeSlot === '17:00 - 18:00');
    console.log('  5 to 6 slot remaining:', slot5to6.remaining);

    // Test 2: Unauthenticated access to /api/bookings MUST be blocked (401)
    const unauthBookings = await request('/api/bookings');
    console.log('✓ Unauthenticated GET /api/bookings status:', unauthBookings.statusCode, '(Expected: 401)');
    if (unauthBookings.statusCode !== 401) {
      throw new Error('Attendee privacy failure: Unauthenticated user was able to access bookings list!');
    }

    // Test 3: Authenticated access to /api/bookings with admin passcode succeeds
    const authBookings = await request('/api/bookings', 'GET', null, { 'x-admin-key': 'Bgcc@2026' });
    console.log('✓ Authenticated GET /api/bookings status:', authBookings.statusCode, `(Found ${authBookings.body.bookings.length} records)`);
    if (authBookings.statusCode !== 200) {
      throw new Error('Admin failed to access bookings list with valid passcode');
    }

    // Test 4: Booking with Name, Email, BITS ID, Vertical
    const newStudent = {
      date: today,
      timeSlot: '17:00 - 18:00',
      name: 'Priya Patel',
      email: 'f20230555@pilani.bits-pilani.ac.in',
      bitsId: '2023A7PS0555P',
      vertical: 'Client Acquisition'
    };

    const bookRes = await request('/api/book', 'POST', newStudent);
    console.log('✓ Booking with BITS ID succeeded:', bookRes.body.bookingId);
    if (!bookRes.body.success) {
      throw new Error('Valid student booking failed: ' + bookRes.body.error);
    }

    // Test 5: Same student trying to book a SECOND slot MUST be rejected
    const secondBookingAttempt = await request('/api/book', 'POST', {
      date: today,
      timeSlot: '18:00 - 19:00',
      name: 'Priya Patel',
      email: 'f20230555@pilani.bits-pilani.ac.in',
      bitsId: '2023A7PS0555P',
      vertical: 'Marketing'
    });

    console.log('✓ Second booking attempt by same student status:', secondBookingAttempt.statusCode, secondBookingAttempt.body.error);
    if (secondBookingAttempt.statusCode !== 400 || !secondBookingAttempt.body.error.includes('already')) {
      throw new Error('Single-booking constraint failure: Student was able to book multiple slots!');
    }

    // Test 6: Verify Admin Passcode Endpoint
    const passVerify = await request('/api/verify-admin', 'POST', { passcode: 'Bgcc@2026' });
    console.log('✓ /api/verify-admin check:', passVerify.body.success);

    const passVerifyFail = await request('/api/verify-admin', 'POST', { passcode: 'wrongpassword' });
    console.log('✓ /api/verify-admin with bad passcode returned status:', passVerifyFail.statusCode);
    if (passVerifyFail.statusCode !== 401) {
      throw new Error('Bad passcode should return 401');
    }

    console.log('\nAll Updated Requirement Tests PASSED successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test FAILED:', err);
    process.exit(1);
  }
}

runTests();
