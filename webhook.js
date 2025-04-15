// webhook.js - Handle Tripay payment callbacks
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());

const DB_PATH = path.join(__dirname, 'db.json');

// Tripay signature verification
const verifySignature = (payload, signature) => {
  const privateKey = process.env.TRIPAY_PRIVATE_KEY;
  const calculatedSignature = crypto
    .createHmac('sha256', privateKey)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return calculatedSignature === signature;
};

// Load database
const loadDB = () => {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
};

// Save database
const saveDB = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// Send product to user via Telegram
const deliverProduct = async (telegramId, product, quantity) => {
  const bot = require('./bot'); // Import your bot instance
  
  // Get product items to deliver
  const db = loadDB();
  const productData = db.products[product.code];
  
  if (!productData || productData.stock < quantity) {
    console.error(`Failed to deliver product ${product.code}: insufficient stock`);
    return false;
  }
  
  // Take items from stock
  const itemsToDeliver = productData.items.splice(0, quantity);
  
  // Update stock count
  productData.stock -= quantity;
  productData.sold = (productData.sold || 0) + quantity;
  
  // Save DB changes
  saveDB(db);
  
  // Send products to customer
  try {
    let message = `🎉 Pembayaran Berhasil! 🎉\n\n`;
    message += `Produk: ${productData.name}\n`;
    message += `Jumlah: ${quantity}\n\n`;
    message += `📦 Detail Produk:\n\n`;
    
    itemsToDeliver.forEach((item, index) => {
      message += `Item #${index + 1}:\n${item}\n\n`;
    });
    
    message += `Terima kasih telah berbelanja! 🙏`;
    
    await bot.telegram.sendMessage(telegramId, message);
    return true;
  } catch (error) {
    console.error('Error delivering product:', error);
    return false;
  }
};

// Tripay payment callback endpoint
app.post('/tripay-callback', async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-callback-signature'];
    
    // Verify callback signature
    if (!verifySignature(payload, signature)) {
      return res.status(403).json({ success: false, message: 'Invalid signature' });
    }
    
    // Process payment status
    const { merchant_ref, status, reference } = payload;
    
    if (status === 'PAID') {
      console.log(`Payment confirmed for ${reference}`);
      
      // In a real implementation, you would:
      // 1. Look up the order details from your database
      // 2. Extract the customer's Telegram ID and product details
      // 3. Deliver the product to the customer
      
      // For this example, we'll parse the merchant_ref which contains the order info
      // Format: ORDER-timestamp-telegramId-productCode-quantity
      const orderParts = merchant_ref.split('-');
      if (orderParts.length >= 5) {
        const telegramId = orderParts[2];
        const productCode = orderParts[3];
        const quantity = parseInt(orderParts[4]);
        
        // Deliver the product
        await deliverProduct(telegramId, { code: productCode }, quantity);
      }
    }
    
    // Acknowledge the callback
    return res.json({ success: true });
  } catch (error) {
    console.error('Callback error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Start the webhook server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
