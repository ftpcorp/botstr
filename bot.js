// Telegram Bot for Auto Order with Tripay Integration
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Initialize bot with your token
const bot = new Telegraf(process.env.BOT_TOKEN);

// Database simulation (in production, use a real database)
const DB_PATH = path.join(__dirname, 'db.json');

// Initialize database if it doesn't exist
if (!fs.existsSync(DB_PATH)) {
  const initialData = {
    products: {},
    admins: ["YOUR_TELEGRAM_ID"] // Add your Telegram ID as the first admin
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
}

// Load database
const loadDB = () => {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
};

// Save database
const saveDB = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// Tripay API configuration
const tripayConfig = {
  apiKey: process.env.TRIPAY_API_KEY,
  privateKey: process.env.TRIPAY_PRIVATE_KEY,
  merchantCode: process.env.TRIPAY_MERCHANT_CODE,
  baseUrl: 'https://tripay.co.id/api'
};

// Check if user is admin
const isAdmin = (ctx) => {
  const db = loadDB();
  return db.admins.includes(ctx.from.id.toString());
};

// Start command
bot.start((ctx) => {
  const name = ctx.from.first_name || 'pelanggan';
  ctx.reply(`Selamat datang, ${name}! 👋\n\nGunakan /menu untuk melihat daftar produk yang tersedia.`);
});

// Menu command
bot.command('menu', async (ctx) => {
  const db = loadDB();
  let menuText = '【 PRODUCT LIST 📦 】━\n';
  menuText += '• Cara membeli produk ketik perintah berikut\n';
  menuText += '• /buy kodeproduk jumlah\n';
  menuText += '• Contoh: /buy do3pp 2\n';
  menuText += '• Pastikan kode dan jumlah akun sudah benar\n';
  menuText += '• Kontak Admin: @BOGEL • RILL\n';
  menuText += '┗━━━━━━━━━━━━━━━━\n\n';

  // Generate product listings
  for (const [code, product] of Object.entries(db.products)) {
    if (!product) continue;
    
    menuText += `━【 ${product.name} 】━\n`;
    menuText += `• 🔑| Kode: ${code}\n`;
    menuText += `• 💰| Harga: Rp${product.price.toLocaleString()}\n`;
    menuText += `• 📦| Stok Tersedia: ${product.stock}\n`;
    menuText += `• 📊| Stok Terjual: ${product.sold || 0}\n`;
    menuText += `• 📝| Desk: ${product.description}\n`;
    menuText += `• 👉| Ketik: /buy ${code} 1\n`;
    menuText += '┗━━━━━━━━━━━━━━━━\n\n';
  }

  ctx.reply(menuText);
});

// Buy command
bot.command('buy', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    return ctx.reply('Format salah. Gunakan: /buy [kode] [jumlah]');
  }

  const productCode = args[0];
  const quantity = parseInt(args[1]);
  
  if (isNaN(quantity) || quantity <= 0) {
    return ctx.reply('Jumlah harus berupa angka positif.');
  }

  const db = loadDB();
  const product = db.products[productCode];

  if (!product) {
    return ctx.reply('Produk tidak ditemukan.');
  }

  if (product.stock < quantity) {
    return ctx.reply(`Stok tidak mencukupi. Stok tersedia: ${product.stock}`);
  }

  // Create payment with Tripay
  try {
    const totalAmount = product.price * quantity;
    const reference = `ORDER-${Date.now()}`;
    
    const paymentData = {
      method: 'QRIS',
      merchant_ref: reference,
      amount: totalAmount,
      customer_name: ctx.from.first_name || 'Customer',
      customer_email: `${ctx.from.id}@telegram.user`,
      order_items: [{
        name: product.name,
        price: product.price,
        quantity: quantity
      }],
      return_url: 'https://yourwebsite.com/return',
      callback_url: 'https://yourwebsite.com/callback',
      expired_time: (Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    };

    // In a real implementation, make an API call to Tripay
    // For this example, we'll simulate the response
    const simulatedPaymentUrl = `https://tripay.co.id/checkout/${reference}`;
    const simulatedQrCode = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=simulatedQRISdata';

    ctx.reply(
      `🛒 Detail Pemesanan:\n\n` +
      `Produk: ${product.name}\n` +
      `Kode: ${productCode}\n` +
      `Jumlah: ${quantity}\n` +
      `Harga: Rp${product.price.toLocaleString()}\n` +
      `Total: Rp${totalAmount.toLocaleString()}\n\n` +
      `Silahkan scan QR code atau klik link berikut untuk melakukan pembayaran:\n${simulatedPaymentUrl}\n\n` +
      `Order ID: ${reference}\n` +
      `Pembayaran akan kadaluarsa dalam 24 jam.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Bayar Sekarang', url: simulatedPaymentUrl }]
          ]
        }
      }
    );

    // In a real scenario, you would then listen for payment callback from Tripay
    // and deliver the product automatically when payment is confirmed

  } catch (error) {
    console.error('Payment error:', error);
    ctx.reply('Terjadi kesalahan saat memproses pembayaran. Silahkan coba lagi nanti.');
  }
});

// Admin command - Show admin menu
bot.command('admin', (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('Anda tidak memiliki akses admin.');
  }

  ctx.reply(
    '👑 ADMIN MENU 👑\n\n' +
    '📌 Perintah admin:\n\n' +
    '/add [kode] [nama] [harga] [deskripsi] - Menambahkan produk baru\n' +
    '/add [kode] [mail: email pass: password 2vl: kode] - Menambah stok\n' +
    '/edit [kode] - Mengubah detail produk\n' +
    '/harga [kode] [harga baru] - Mengubah harga produk\n' +
    '/list - Melihat semua produk\n' +
    '/stats - Melihat statistik penjualan'
  );
});

// Add command - Add new product or stock
bot.command('add', (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('Anda tidak memiliki akses admin.');
  }

  const text = ctx.message.text;
  const args = text.split(' ');
  args.shift(); // Remove the command part

  if (args.length < 2) {
    return ctx.reply('Format salah. Gunakan:\n/add [kode] [nama] [harga] [deskripsi]\nAtau untuk menambah stok:\n/add [kode] [mail: ... pass: ... 2vl: ...]');
  }

  const code = args[0];
  const db = loadDB();

  // Check if this is adding a new product or adding stock
  if (args.length >= 4 && !text.includes('mail:')) {
    // Adding new product
    const name = args[1];
    const price = parseFloat(args[2]);
    const description = args.slice(3).join(' ');

    if (isNaN(price) || price <= 0) {
      return ctx.reply('Harga harus berupa angka positif.');
    }

    // Create new product if it doesn't exist
    if (!db.products[code]) {
      db.products[code] = {
        name: name,
        price: price,
        description: description,
        stock: 0,
        sold: 0,
        items: []
      };
      saveDB(db);
      return ctx.reply(`Produk baru berhasil ditambahkan:\nKode: ${code}\nNama: ${name}\nHarga: Rp${price.toLocaleString()}`);
    } else {
      return ctx.reply(`Produk dengan kode ${code} sudah ada. Gunakan /edit untuk mengubah detail.`);
    }
  } else {
    // Adding stock
    if (!db.products[code]) {
      return ctx.reply(`Produk dengan kode ${code} tidak ditemukan. Buat produk baru terlebih dahulu.`);
    }

    const stockInfo = args.slice(1).join(' ');
    db.products[code].items.push(stockInfo);
    db.products[code].stock += 1;
    saveDB(db);
    return ctx.reply(`Stok berhasil ditambahkan untuk ${code}. Total stok sekarang: ${db.products[code].stock}`);
  }
});

// Edit command - Edit product details
bot.command('edit', (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('Anda tidak memiliki akses admin.');
  }

  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    return ctx.reply('Format salah. Gunakan: /edit [kode]');
  }

  const code = args[0];
  const db = loadDB();

  if (!db.products[code]) {
    return ctx.reply(`Produk dengan kode ${code} tidak ditemukan.`);
  }

  // For simplicity, we'll just show the current details
  // In a real bot, you might want to use a wizard or conversation to edit properties
  const product = db.products[code];
  ctx.reply(
    `Detail produk ${code}:\n\n` +
    `Nama: ${product.name}\n` +
    `Harga: Rp${product.price.toLocaleString()}\n` +
    `Deskripsi: ${product.description}\n` +
    `Stok: ${product.stock}\n` +
    `Terjual: ${product.sold || 0}\n\n` +
    `Gunakan perintah berikut untuk mengubah:\n` +
    `/harga ${code} [harga baru]\n` +
    `/nama ${code} [nama baru]\n` +
    `/desk ${code} [deskripsi baru]`
  );
});

// Change price command
bot.command('harga', (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('Anda tidak memiliki akses admin.');
  }

  const args = ctx.message.text.split(' ').slice(1);
  if (args.length !== 2) {
    return ctx.reply('Format salah. Gunakan: /harga [kode] [harga baru]');
  }

  const code = args[0];
  const newPrice = parseFloat(args[1]);

  if (isNaN(newPrice) || newPrice <= 0) {
    return ctx.reply('Harga harus berupa angka positif.');
  }

  const db = loadDB();

  if (!db.products[code]) {
    return ctx.reply(`Produk dengan kode ${code} tidak ditemukan.`);
  }

  db.products[code].price = newPrice;
  saveDB(db);
  
  ctx.reply(`Harga produk ${code} berhasil diubah menjadi Rp${newPrice.toLocaleString()}`);
});

// Add name change and description change commands
bot.command('nama', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Anda tidak memiliki akses admin.');

  const text = ctx.message.text;
  const args = text.split(' ');
  args.shift(); // Remove command
  
  if (args.length < 2) {
    return ctx.reply('Format salah. Gunakan: /nama [kode] [nama baru]');
  }

  const code = args[0];
  const newName = args.slice(1).join(' ');
  const db = loadDB();

  if (!db.products[code]) {
    return ctx.reply(`Produk dengan kode ${code} tidak ditemukan.`);
  }

  db.products[code].name = newName;
  saveDB(db);
  
  ctx.reply(`Nama produk ${code} berhasil diubah menjadi "${newName}"`);
});

bot.command('desk', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Anda tidak memiliki akses admin.');

  const text = ctx.message.text;
  const args = text.split(' ');
  args.shift(); // Remove command
  
  if (args.length < 2) {
    return ctx.reply('Format salah. Gunakan: /desk [kode] [deskripsi baru]');
  }

  const code = args[0];
  const newDesc = args.slice(1).join(' ');
  const db = loadDB();

  if (!db.products[code]) {
    return ctx.reply(`Produk dengan kode ${code} tidak ditemukan.`);
  }

  db.products[code].description = newDesc;
  saveDB(db);
  
  ctx.reply(`Deskripsi produk ${code} berhasil diubah.`);
});

// List command - List all products for admin
bot.command('list', (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('Anda tidak memiliki akses admin.');
  }

  const db = loadDB();
  let listText = '📋 DAFTAR PRODUK 📋\n\n';

  for (const [code, product] of Object.entries(db.products)) {
    listText += `Kode: ${code}\n`;
    listText += `Nama: ${product.name}\n`;
    listText += `Harga: Rp${product.price.toLocaleString()}\n`;
    listText += `Stok: ${product.stock}\n`;
    listText += `Terjual: ${product.sold || 0}\n`;
    listText += `------------------\n`;
  }

  ctx.reply(listText);
});

// Stats command - Show sales statistics
bot.command('stats', (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('Anda tidak memiliki akses admin.');
  }

  const db = loadDB();
  let totalSold = 0;
  let totalRevenue = 0;
  let statsText = '📊 STATISTIK PENJUALAN 📊\n\n';

  for (const [code, product] of Object.entries(db.products)) {
    const productSold = product.sold || 0;
    const productRevenue = productSold * product.price;
    
    totalSold += productSold;
    totalRevenue += productRevenue;
    
    statsText += `${code}: ${productSold} terjual (Rp${productRevenue.toLocaleString()})\n`;
  }

  statsText += `\nTotal: ${totalSold} produk terjual\n`;
  statsText += `Total Pendapatan: Rp${totalRevenue.toLocaleString()}`;

  ctx.reply(statsText);
});

// Payment callback handler (would connect to a webhook in production)
// This simulates the Tripay callback when payment is confirmed
const processPaymentCallback = (paymentData) => {
  const { reference, status } = paymentData;
  
  if (status === 'PAID') {
    // Find the order by reference and deliver the product
    // This is simulated - in a real application, you would store orders in a database
    console.log(`Payment confirmed for order ${reference}, delivering product...`);
    
    // Example of product delivery logic:
    // 1. Find the product and quantity from the order
    // 2. Reduce the stock
    // 3. Send the product credentials to the customer
    // 4. Update sold count
  }
};

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('Terjadi kesalahan pada bot. Silahkan coba lagi nanti.');
});

// Start the bot
bot.launch()
  .then(() => {
    console.log('Bot started successfully!');
  })
  .catch(err => {
    console.error('Failed to start bot:', err);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
