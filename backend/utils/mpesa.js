const axios = require('axios');
const winston = require('winston');

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'mpesa-transactions.log' })
  ]
});

/**
 * Generate OAuth token for M-Pesa API authentication
 * @returns {Promise<string>} OAuth token
 */
const generateToken = async () => {
  try {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    
    if (!consumerKey || !consumerSecret) {
      throw new Error('M-Pesa API credentials not configured');
    }
    
    // Auth string is base64 encoded consumer key:consumer secret
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    
    const response = await axios.get(
      `${process.env.MPESA_API_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    logger.error('Error generating M-Pesa token:', error);
    throw error;
  }
};

/**
 * Initiate STK push to customer phone
 * @param {Object} paymentData - Payment details
 * @returns {Promise<Object>} STK push response
 */
const initiateSTKPush = async (paymentData) => {
  try {
    const {
      phoneNumber,
      amount,
      accountReference,
      description
    } = paymentData;
    
    // Format phone number (remove leading 0 if exists, add country code)
    let formattedPhone = phoneNumber;
    if (formattedPhone.startsWith('0')) {
      formattedPhone = `254${formattedPhone.slice(1)}`;
    } else if (!formattedPhone.startsWith('254')) {
      formattedPhone = `254${formattedPhone}`;
    }
    
    // Generate timestamp in the format YYYYMMDDHHmmss
    const timestamp = new Date().toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    
    // Generate password (base64 of shortcode + passkey + timestamp)
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    
    const token = await generateToken();
    
    const response = await axios.post(
      `${process.env.MPESA_API_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${process.env.API_BASE_URL}/api/billing/mpesa/callback`,
        AccountReference: accountReference,
        TransactionDesc: description
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    logger.info('STK push initiated:', {
      phoneNumber: formattedPhone,
      amount,
      reference: accountReference,
      checkoutRequestID: response.data.CheckoutRequestID
    });
    
    return response.data;
  } catch (error) {
    logger.error('STK push failed:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Check status of an STK push transaction
 * @param {string} checkoutRequestId - The checkout request ID
 * @returns {Promise<Object>} Transaction status
 */
const checkTransactionStatus = async (checkoutRequestId) => {
  try {
    const token = await generateToken();
    const shortcode = process.env.MPESA_SHORTCODE;
    
    // Generate timestamp in the format YYYYMMDDHHmmss
    const timestamp = new Date().toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    
    // Generate password (base64 of shortcode + passkey + timestamp)
    const passkey = process.env.MPESA_PASSKEY;
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    
    const response = await axios.post(
      `${process.env.MPESA_API_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    logger.error('Transaction status check failed:', error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  initiateSTKPush,
  checkTransactionStatus
};