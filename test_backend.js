const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
const TEST_PHONE = '9876543210';

async function testAuthFlow() {
    console.log('--- Starting Auth Flow Test ---');

    // 1. Send OTP
    try {
        console.log(`Sending OTP to ${TEST_PHONE}...`);
        const sendResponse = await axios.post(`${API_URL}/send-otp`, {
            mobile: TEST_PHONE
        });
        console.log('Send OTP Response:', sendResponse.data);

        // 2. Verify with WRONG OTP (Since we can't easily get the real OTP in auto test without interception)
        console.log('Verifying with WRONG OTP...');
        try {
            await axios.post(`${API_URL}/verify-otp`, {
                mobile: TEST_PHONE,
                otp: '000000'
            });
        } catch (error) {
            if (error.response) {
                console.log('Expected Error Response:', error.response.data);
            } else {
                console.error('Unexpected error:', error.message);
            }
        }

        console.log('--- Test Finished ---');

    } catch (error) {
        console.error('Test Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
}

// Run test
testAuthFlow();
