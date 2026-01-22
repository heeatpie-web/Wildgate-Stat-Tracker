#!/bin/bash
echo "==================================================="
echo "      WILDGATE STAT TRACKER - AUTO LAUNCHER"
echo "==================================================="
echo ""

# Check for Node
if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js could not be found."
    echo "Please install Node.js from https://nodejs.org/"
    exit
fi

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "[INFO] First time setup detected. Installing dependencies..."
    npm install
fi

echo ""
echo "[INFO] Starting application..."
echo "[INFO] Browser should open automatically."
echo ""

npm run dev