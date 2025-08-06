#!/bin/bash

echo "Starting WhatsApp Bot..."
echo ""
echo "Make sure Redis is running before starting the bot!"
echo ""

# Check if Redis is running
if redis-cli ping > /dev/null 2>&1; then
    echo "[INFO] Redis is running successfully!"
else
    echo "[WARNING] Redis is not running. Bot will use in-memory mode."
    echo "To start Redis: docker run -d -p 6379:6379 redis:alpine"
fi

echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

echo "Starting the bot..."
echo "Open http://localhost:3000 to scan QR code"
echo ""

npm start
