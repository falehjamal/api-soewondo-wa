@echo off
echo Starting WhatsApp Bot...
echo.
echo Make sure Redis is running before starting the bot!
echo.

REM Check if Redis is running
redis-cli ping > nul 2>&1
if errorlevel 1 (
    echo [WARNING] Redis is not running. Bot will use in-memory mode.
    echo To start Redis: docker run -d -p 6379:6379 redis:alpine
    echo.
) else (
    echo [INFO] Redis is running successfully!
    echo.
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    echo.
)

echo Starting the bot...
echo Open http://localhost:3000 to scan QR code
echo.

npm start
