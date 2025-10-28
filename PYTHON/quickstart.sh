#!/bin/bash
# ELYSIUM Bot - Quick Start Script
# Sets up Python bot for local testing

set -e  # Exit on error

echo "🚀 ELYSIUM Bot - Quick Start Setup"
echo "=================================="
echo ""

# Check Python version
echo "📋 Checking Python version..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed!"
    echo "   Please install Python 3.11+ from https://www.python.org/"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "   ✅ Found Python $PYTHON_VERSION"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo ""
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    echo "   ✅ Virtual environment created"
else
    echo ""
    echo "📦 Virtual environment already exists"
fi

# Activate virtual environment
echo ""
echo "🔧 Activating virtual environment..."
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    echo "   ✅ Activated (Unix/Mac)"
elif [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate
    echo "   ✅ Activated (Windows Git Bash)"
else
    echo "   ⚠️  Could not activate. Please activate manually:"
    echo "      Unix/Mac: source venv/bin/activate"
    echo "      Windows: venv\\Scripts\\activate"
    exit 1
fi

# Install dependencies
echo ""
echo "📥 Installing dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
echo "   ✅ Dependencies installed"

# Check for .env file
echo ""
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file from template..."
    cp .env.example .env
    echo "   ✅ .env file created"
    echo ""
    echo "   ⚠️  IMPORTANT: Edit .env and add your DISCORD_TOKEN!"
    echo "      nano .env  (or use your preferred editor)"
    echo ""
    read -p "   Press Enter when you've added your token..."
else
    echo "⚙️  .env file already exists"
fi

# Check config.json
echo ""
if [ ! -f "config.json" ]; then
    echo "❌ config.json not found!"
    echo "   Please copy config.json from your JS bot or create one."
    exit 1
else
    echo "✅ config.json found"
fi

# Check boss_points.json
if [ ! -f "boss_points.json" ]; then
    echo "❌ boss_points.json not found!"
    echo "   Please copy boss_points.json from your JS bot or create one."
    exit 1
else
    echo "✅ boss_points.json found"
fi

# Validate configuration
echo ""
echo "🔍 Validating configuration..."
if python3 -c "from config import load_config; load_config(); print('   ✅ Configuration valid')" 2>/dev/null; then
    :
else
    echo "   ❌ Configuration validation failed!"
    echo "      Check config.json and boss_points.json for errors"
    exit 1
fi

# Test Discord token
echo ""
echo "🔑 Checking Discord token..."
if grep -q "your_discord_bot_token_here" .env 2>/dev/null; then
    echo "   ❌ Please set your DISCORD_TOKEN in .env file!"
    exit 1
else
    echo "   ✅ Discord token found in .env"
fi

# All checks passed
echo ""
echo "=========================================="
echo "✅ Setup complete! Ready to run bot."
echo "=========================================="
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Make sure your .env has the correct DISCORD_TOKEN"
echo "2. Verify config.json has correct Discord IDs"
echo "3. Run the bot:"
echo ""
echo "   python main.py"
echo ""
echo "4. Test in Discord:"
echo "   - Bot should appear online"
echo "   - Try: !status"
echo "   - Try: !help"
echo ""
echo "📖 For deployment to Koyeb, see: KOYEB_DEPLOYMENT.md"
echo "🧪 For testing procedures, see: TESTING_CHECKLIST.md"
echo ""
echo "🎉 Happy botting!"
echo ""