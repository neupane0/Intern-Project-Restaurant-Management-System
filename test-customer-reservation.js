// test-customer-reservation.js
// This script demonstrates the new customer reservation functionality

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Test data
const testCustomer = {
    name: 'Test Customer',
    email: 'test.customer@example.com',
    password: 'password123',
    role: 'customer'
};

const testReservation = {
    tableNumber: 'T-2', // Use T-2 since T-1 might be taken from previous test
    customerName: 'Test Customer',
    customerPhoneNumber: '+1234567890',
    numberOfGuests: 4,
    reservationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    notes: 'Window seat preferred'
};

const testAdmin = {
    name: 'Test Admin',
    email: 'test.admin@restaurant.com',
    password: 'admin123',
    role: 'admin'
};

async function registerOrLogin(user) {
    try {
        console.log(`   Attempting to register ${user.role}...`);
        const registerRes = await axios.post(`${BASE_URL}/auth/register`, user);
        console.log(`   ✅ ${user.role} registered successfully`);
        return registerRes.data.token;
    } catch (err) {
        const message = err.response?.data?.message || '';
        if (err.response?.status === 400 && message.toLowerCase().includes('user already exists')) {
            console.log(`   ⚠️  ${user.role} already exists, attempting login...`);
            try {
                const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
                    email: user.email,
                    password: user.password,
                });
                console.log(`   ✅ ${user.role} logged in successfully`);
                return loginRes.data.token;
            } catch (loginErr) {
                console.log(`   ❌ Login failed: ${loginErr.response?.data?.message || loginErr.message}`);
                throw loginErr;
            }
        }
        console.log(`   ❌ Registration failed: ${message}`);
        throw err;
    }
}

async function testCustomerReservationFlow() {
    try {
        console.log('🚀 Testing Customer Reservation Flow...\n');

        // Step 1: Register or login a customer
        console.log('1. Ensuring customer account...');
        const customerToken = await registerOrLogin(testCustomer);
        console.log('✅ Customer token acquired\n');

        // Step 2: Register or login an admin
        console.log('2. Ensuring admin account...');
        const adminToken = await registerOrLogin(testAdmin);
        console.log('✅ Admin token acquired\n');

        // Step 3: Customer checks available tables
        console.log('3. Customer checking available tables...');
        const availableTablesResponse = await axios.get(
            `${BASE_URL}/customer/reservations/available?reservationTime=${testReservation.reservationTime}`,
            {
                headers: { Authorization: `Bearer ${customerToken}` }
            }
        );
        console.log('✅ Available tables:', availableTablesResponse.data.availableTables, '\n');

        // Step 4: Customer creates a reservation
        console.log('4. Customer creating a reservation...');
        const createReservationResponse = await axios.post(
            `${BASE_URL}/customer/reservations`,
            testReservation,
            {
                headers: { Authorization: `Bearer ${customerToken}` }
            }
        );
        const reservationId = createReservationResponse.data._id;
        console.log('✅ Reservation created with ID:', reservationId);
        console.log('Status:', createReservationResponse.data.status, '\n');

        // Step 5: Customer views their reservations
        console.log('5. Customer viewing their reservations...');
        const customerReservationsResponse = await axios.get(
            `${BASE_URL}/customer/reservations`,
            {
                headers: { Authorization: `Bearer ${customerToken}` }
            }
        );
        console.log('✅ Customer reservations:', customerReservationsResponse.data.length, 'found\n');

        // Step 6: Admin views pending customer reservations
        console.log('6. Admin viewing pending customer reservations...');
        const pendingReservationsResponse = await axios.get(
            `${BASE_URL}/reservations/pending-customer`,
            {
                headers: { Authorization: `Bearer ${adminToken}` }
            }
        );
        console.log('✅ Pending reservations:', pendingReservationsResponse.data.length, 'found\n');

        // Step 7: Admin approves the reservation
        console.log('7. Admin approving the reservation...');
        const approveResponse = await axios.put(
            `${BASE_URL}/reservations/${reservationId}/approve`,
            { action: 'approve' },
            {
                headers: { Authorization: `Bearer ${adminToken}` }
            }
        );
        console.log('✅ Reservation approved:', approveResponse.data.message, '\n');

        // Step 8: Customer checks updated reservation status
        console.log('8. Customer checking updated reservation status...');
        const updatedReservationResponse = await axios.get(
            `${BASE_URL}/customer/reservations/${reservationId}`,
            {
                headers: { Authorization: `Bearer ${customerToken}` }
            }
        );
        console.log('✅ Updated status:', updatedReservationResponse.data.status, '\n');

        // Step 9: Customer cancels the reservation
        console.log('9. Customer cancelling the reservation...');
        const cancelResponse = await axios.delete(
            `${BASE_URL}/customer/reservations/${reservationId}`,
            {
                headers: { Authorization: `Bearer ${customerToken}` }
            }
        );
        console.log('✅ Reservation cancelled:', cancelResponse.data.message, '\n');

        console.log('🎉 All tests completed successfully!');

    } catch (error) {
        console.error('❌ Error:', error.response?.data?.message || error.message);
    }
}

// Run the test
testCustomerReservationFlow(); 