#!/bin/bash

# Telegram Bot Auto-Installer Script
# This script installs all requirements, downloads the bot from GitHub,
# configures environment variables, and sets up systemd service for auto-start

# Text colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}   Telegram Order Bot Installation Script  ${NC}"
echo -e "${GREEN}===========================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root or with sudo${NC}"
  exit 1
fi

# Update system
echo -e "\n${YELLOW}Updating system packages...${NC}"
apt-get update && apt-get upgrade -y

# Install required packages
echo -e "\n${YELLOW}Installing required packages...${NC}"
apt-get install -y curl wget git nodejs npm

# Check Node.js version and upgrade if needed
NODE_VERSION=$(nodejs -v | cut -d 'v' -f 2)
REQUIRED_VERSION="14.0.0"

function version_lt() { 
  test "$(echo "$@" | tr " " "\n" | sort -rV | head -n 1)" != "$1"
}

if version_lt "$NODE_VERSION" "$REQUIRED_VERSION"; then
  echo -e "\n${YELLOW}Upgrading Node.js to latest LTS version...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi

# Create bot directory
echo -e "\n${YELLOW}Creating bot directory...${NC}"
BOT_DIR="/opt/telegram-bot"
mkdir -p "$BOT_DIR"
cd "$BOT_DIR"

# GitHub Repository URL (using the provided repo)
REPO_URL="https://github.com/ftpcorp/botstr.git"

# Clone the repository
echo -e "\n${YELLOW}Cloning bot repository from GitHub...${NC}"
git clone "$REPO_URL" .

# If the clone fails, download files individually
if [ $? -ne 0 ]; then
  echo -e "\n${YELLOW}Direct clone failed, downloading files individually...${NC}"
  
  # Create necessary files
  mkdir -p "$BOT_DIR"
  cd "$BOT_DIR"
  
  # Download bot.js
  echo -e "${YELLOW}Downloading bot.js...${NC}"
  curl -s "https://raw.githubusercontent.com/ftpcorp/botstr/main/bot.js" -o bot.js
  
  # Download webhook.js
  echo -e "${YELLOW}Downloading webhook.js...${NC}"
  curl -s "https://raw.githubusercontent.com/ftpcorp/botstr/main/webhook.js" -o webhook.js
  
  # Download package.json
  echo -e "${YELLOW}Downloading package.json...${NC}"
  curl -s "https://raw.githubusercontent.com/ftpcorp/botstr/main/package.json" -o package.json
  
  # Check if files were downloaded successfully
  if [ ! -f bot.js ] || [ ! -f webhook.js ] || [ ! -f package.json ]; then
    echo -e "${RED}Failed to download required files. Please check the repository URL.${NC}"
    exit 1
  fi
fi

# Install dependencies
echo -e "\n${YELLOW}Installing Node.js dependencies...${NC}"
npm install

# Configure environment variables
echo -e "\n${YELLOW}Configuring environment variables...${NC}"
ENV_FILE="$BOT_DIR/.env"
touch "$ENV_FILE"

read -p "Enter your Telegram Bot Token: " BOT_TOKEN
read -p "Enter your Tripay API Key: " TRIPAY_API_KEY
read -p "Enter your Tripay Private Key: " TRIPAY_PRIVATE_KEY
read -p "Enter your Tripay Merchant Code: " TRIPAY_MERCHANT_CODE
read -p "Enter webhook port (default: 3000): " WEBHOOK_PORT
WEBHOOK_PORT=${WEBHOOK_PORT:-3000}

cat > "$ENV_FILE" << EOF
BOT_TOKEN=$BOT_TOKEN
TRIPAY_API_KEY=$TRIPAY_API_KEY
TRIPAY_PRIVATE_KEY=$TRIPAY_PRIVATE_KEY
TRIPAY_MERCHANT_CODE=$TRIPAY_MERCHANT_CODE
PORT=$WEBHOOK_PORT
EOF

# Create systemd service for bot
echo -e "\n${YELLOW}Creating systemd service for the bot...${NC}"
cat > /etc/systemd/system/telegram-bot.service << EOF
[Unit]
Description=Telegram Order Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$BOT_DIR
ExecStart=/usr/bin/node $BOT_DIR/bot.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=telegram-bot
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
Environment=NODE_PATH=$BOT_DIR/node_modules

[Install]
WantedBy=multi-user.target
EOF

# Create systemd service for webhook
echo -e "\n${YELLOW}Creating systemd service for the webhook...${NC}"
cat > /etc/systemd/system/telegram-webhook.service << EOF
[Unit]
Description=Telegram Bot Webhook Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$BOT_DIR
ExecStart=/usr/bin/node $BOT_DIR/webhook.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=telegram-webhook
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
Environment=NODE_PATH=$BOT_DIR/node_modules

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
echo -e "\n${YELLOW}Enabling and starting services...${NC}"
systemctl daemon-reload
systemctl enable telegram-bot.service
systemctl enable telegram-webhook.service
systemctl start telegram-bot.service
systemctl start telegram-webhook.service

# Check if services are running
echo -e "\n${YELLOW}Checking service status...${NC}"
BOT_STATUS=$(systemctl is-active telegram-bot.service)
WEBHOOK_STATUS=$(systemctl is-active telegram-webhook.service)

if [ "$BOT_STATUS" == "active" ] && [ "$WEBHOOK_STATUS" == "active" ]; then
  echo -e "\n${GREEN}✓ Installation successful! Both services are running.${NC}"
else
  echo -e "\n${RED}❌ There was a problem starting the services.${NC}"
  echo -e "Bot service: $BOT_STATUS"
  echo -e "Webhook service: $WEBHOOK_STATUS"
  echo -e "Check logs with: journalctl -u telegram-bot.service -f"
fi

# Add admin user to the database
echo -e "\n${YELLOW}Would you like to add yourself as an admin? (y/n)${NC}"
read -p "Enter your choice: " add_admin

if [ "$add_admin" == "y" ] || [ "$add_admin" == "Y" ]; then
  read -p "Enter your Telegram User ID: " ADMIN_ID
  
  # Check if the database exists, if not create it
  if [ ! -f "$BOT_DIR/db.json" ]; then
    echo -e "\n${YELLOW}Creating initial database...${NC}"
    cat > "$BOT_DIR/db.json" << EOF
{
  "products": {},
  "admins": ["$ADMIN_ID"]
}
EOF
  else
    # Add admin to existing database
    # This is a simple approach - in a real script, you'd want to use jq for proper JSON manipulation
    echo -e "\n${YELLOW}Adding admin to existing database...${NC}"
    TMP_FILE=$(mktemp)
    cat "$BOT_DIR/db.json" | sed "s/\"admins\": \[/\"admins\": \[\"$ADMIN_ID\", /" > "$TMP_FILE"
    mv "$TMP_FILE" "$BOT_DIR/db.json"
  fi
  
  echo -e "${GREEN}✓ Admin user added successfully!${NC}"
fi

echo -e "\n${GREEN}===========================================${NC}"
echo -e "${GREEN}  Installation Complete!                     ${NC}"
echo -e "${GREEN}===========================================${NC}"
echo -e "\n${YELLOW}Usage:${NC}"
echo -e "  - Your bot should now be running in the background"
echo -e "  - Check bot service: ${GREEN}systemctl status telegram-bot.service${NC}"
echo -e "  - Check webhook: ${GREEN}systemctl status telegram-webhook.service${NC}"
echo -e "  - View logs: ${GREEN}journalctl -u telegram-bot.service -f${NC}"
echo -e "  - Restart bot: ${GREEN}systemctl restart telegram-bot.service${NC}"
echo -e "\n${YELLOW}Bot files location:${NC} $BOT_DIR"
echo -e "\n${GREEN}Enjoy your Telegram Order Bot!${NC}"
