#!/bin/bash
# Installation script for Bogel Store Telegram Bot
# This script will:
# 1. Install Node.js and required packages
# 2. Clone the bot from GitHub
# 3. Configure the .env file
# 4. Set up systemd service for auto-running in background

# Text colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

print_error() {
    echo -e "${RED}$1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script as root or with sudo"
    exit 1
fi

# Set installation directory
INSTALL_DIR="/opt/bogel-store-bot"
GITHUB_REPO="https://github.com/yourusername/bogel-store-bot.git"  # Replace with your actual repo

# Step 1: Update system and install dependencies
print_warning "Updating system and installing dependencies..."
apt-get update
apt-get upgrade -y
apt-get install -y curl git build-essential

# Step 2: Install Node.js (using Node Version Manager)
print_warning "Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    nvm install 16
    nvm use 16
    nvm alias default 16
else
    print_success "Node.js is already installed"
fi

# If nvm was just installed, we need to make it available in the current shell
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Verify Node.js installation
if ! command -v node &> /dev/null; then
    print_error "Node.js installation failed. Please install manually."
    exit 1
fi

print_success "Node.js $(node -v) installed successfully"

# Step 3: Create installation directory
print_warning "Creating installation directory..."
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

# Step 4: Clone the repository
print_warning "Cloning the repository from GitHub..."
if [ -d "$INSTALL_DIR/.git" ]; then
    print_warning "Git repository already exists. Pulling latest changes..."
    git pull
else
    git clone $GITHUB_REPO .
    if [ $? -ne 0 ]; then
        print_error "Failed to clone the repository. Please check the URL and your internet connection."
        exit 1
    fi
fi

# Step 5: Install dependencies
print_warning "Installing Node.js dependencies..."
npm install

# Step 6: Configure .env file
print_warning "Configuring .env file..."
if [ -f ".env" ]; then
    print_warning "The .env file already exists. Do you want to recreate it? (y/n)"
    read -r answer
    if [ "$answer" != "${answer#[Yy]}" ]; then
        rm .env
    else
        print_warning "Skipping .env configuration."
    fi
fi

if [ ! -f ".env" ]; then
    echo "Please enter your bot configuration details:"
    echo -n "Telegram Bot Token: "
    read -r BOT_TOKEN
    echo -n "Tripay API Key: "
    read -r TRIPAY_API_KEY
    echo -n "Tripay Private Key: "
    read -r TRIPAY_PRIVATE_KEY
    echo -n "Tripay Merchant Code: "
    read -r TRIPAY_MERCHANT_CODE
    echo -n "Port for webhook server (default: 3000): "
    read -r PORT
    PORT=${PORT:-3000}
    
    cat > .env << EOF
BOT_TOKEN=$BOT_TOKEN
TRIPAY_API_KEY=$TRIPAY_API_KEY
TRIPAY_PRIVATE_KEY=$TRIPAY_PRIVATE_KEY
TRIPAY_MERCHANT_CODE=$TRIPAY_MERCHANT_CODE
PORT=$PORT
EOF
    print_success ".env file created successfully"
fi

# Step 7: Set proper permissions
print_warning "Setting permissions..."
chown -R $(whoami):$(whoami) $INSTALL_DIR
chmod -R 755 $INSTALL_DIR

# Step 8: Create systemd service for bot
print_warning "Creating systemd service for the bot..."
cat > /etc/systemd/system/bogel-bot.service << EOF
[Unit]
Description=Bogel Store Telegram Bot
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/bot.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=bogel-bot
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Step 9: Create systemd service for webhook server
print_warning "Creating systemd service for the webhook server..."
cat > /etc/systemd/system/bogel-webhook.service << EOF
[Unit]
Description=Bogel Store Webhook Server
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/webhook.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=bogel-webhook
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Step 10: Enable and start services
print_warning "Enabling and starting services..."
systemctl daemon-reload
systemctl enable bogel-bot.service
systemctl enable bogel-webhook.service
systemctl start bogel-bot.service
systemctl start bogel-webhook.service

# Step 11: Check service status
print_warning "Checking service status..."
sleep 2
BOT_STATUS=$(systemctl is-active bogel-bot.service)
WEBHOOK_STATUS=$(systemctl is-active bogel-webhook.service)

if [ "$BOT_STATUS" = "active" ] && [ "$WEBHOOK_STATUS" = "active" ]; then
    print_success "Installation completed successfully!"
    print_success "Bot service is running"
    print_success "Webhook service is running"
    echo ""
    echo "You can check the status of the services with:"
    echo "  systemctl status bogel-bot.service"
    echo "  systemctl status bogel-webhook.service"
    echo ""
    echo "To view logs:"
    echo "  journalctl -u bogel-bot.service -f"
    echo "  journalctl -u bogel-webhook.service -f"
    echo ""
    echo "To restart the services:"
    echo "  systemctl restart bogel-bot.service"
    echo "  systemctl restart bogel-webhook.service"
else
    print_error "Installation completed, but services failed to start properly."
    echo "Please check the logs with:"
    echo "  journalctl -u bogel-bot.service -e"
    echo "  journalctl -u bogel-webhook.service -e"
fi

# Display admin instructions
print_success "======================= ADMIN INSTRUCTIONS ======================="
echo "Your bot should now be running! Add it on Telegram and send /start"
echo ""
echo "Admin commands:"
echo "  /admin - View admin menu"
echo "  /add [code] [name] [price] [description] - Add new product"
echo "  /add [code] [mail: email pass: password 2vl: code] - Add stock"
echo "  /edit [code] - Edit product details"
echo "  /harga [code] [new price] - Change price"
echo ""
echo "To modify your configuration later, edit: $INSTALL_DIR/.env"
echo "and then restart the services with: systemctl restart bogel-bot.service"
echo "=================================================================="
