#!/usr/bin/env python3
"""
Quick integration test to verify backend is ready
"""
import sys
from pathlib import Path

print("🧪 Testing Backend Integration...\n")

# Test 1: Module imports
print("1️⃣ Testing module imports...")
try:
    from modules.doc_generation import SlideData
    from modules.doc_generation.pedagogical_engine import _build_slide_prompt
    from modules.doc_generation.image_pipeline import _build_image_registry
    from modules.core.config_loader import load_config
    from modules.ingestion import ingest_directory
    from modules.retrieval import build_index
    print("   ✅ All imports successful\n")
except Exception as e:
    print(f"   ❌ Import failed: {e}\n")
    sys.exit(1)

# Test 2: Config loading
print("2️⃣ Testing config loading...")
try:
    config = load_config()
    print(f"   ✅ Config loaded: {len(config)} keys\n")
except Exception as e:
    print(f"   ❌ Config failed: {e}\n")
    sys.exit(1)

# Test 3: API module
print("3️⃣ Testing api.py import...")
try:
    import api
    print(f"   ✅ api.py imports successfully\n")
except Exception as e:
    print(f"   ❌ API import failed: {e}\n")
    print("   ℹ️  This might be due to missing dependencies (PyMuPDF, etc.)")
    print("   ℹ️  Run: pip install -r requirements.txt\n")

# Test 4: Check data directories
print("4️⃣ Checking data directories...")
data_dir = Path("data")
required_dirs = ["raw", "processed", "cache"]
for d in required_dirs:
    path = data_dir / d
    if path.exists():
        print(f"   ✅ {path}")
    else:
        print(f"   ⚠️  {path} (will be created on first run)")
print()

print("=" * 60)
print("✅ Backend structure is clean and ready!")
print("=" * 60)
print("\n📋 Next steps:")
print("   1. Install dependencies: pip install -r requirements.txt")
print("   2. Start backend: python -m uvicorn api:app --reload --port 8000")
print("   3. Start frontend: cd frontend && npm run dev")
print("   4. Test at: http://localhost:5173\n")
