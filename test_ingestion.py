# test_ingestion.py — Test the new ingestion and enrichment modules

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from modules.ingestion import ingest_directory, get_content_by_type
from modules.enrichment import enrich_content

def main():
    print("=" * 60)
    print("  TEKUP AI — Ingestion & Enrichment Test")
    print("=" * 60)
    
    # Step 1: Run ingestion
    print("\n📥 Step 1: Ingesting documents from data/raw...")
    pages = ingest_directory("data/raw")
    
    if not pages:
        print("❌ No pages found! Make sure you have PDFs in data/raw/")
        return
    
    # Step 2: Summary
    print(f"\n📊 Step 2: Extraction Summary")
    print(f"   Total items: {len(pages)}")
    print(f"   ├── Text pages: {len(get_content_by_type(pages, 'text'))}")
    print(f"   ├── Images:     {len(get_content_by_type(pages, 'image'))}")
    print(f"   ├── Tables:     {len(get_content_by_type(pages, 'table'))}")
    print(f"   └── Code blocks:{len(get_content_by_type(pages, 'code'))}")
    
    # Step 3: Show sample table
    tables = get_content_by_type(pages, 'table')
    if tables:
        t = tables[0]
        print(f"\n📋 Sample Table (Page {t.page}):")
        print(f"   Caption: {t.table_data.get('caption', 'N/A')}")
        print(f"   Headers: {t.table_data.get('headers', [])}")
        print(f"   Rows: {t.table_data.get('num_rows', 0)}")
    else:
        print("\n📋 No tables found in documents")
    
    # Step 4: Show sample code block
    codes = get_content_by_type(pages, 'code')
    if codes:
        c = codes[0]
        print(f"\n💻 Sample Code Block (Page {c.page}):")
        print(f"   Language: {c.code_data.get('language', 'unknown')}")
        print(f"   Preview: {c.code_data.get('content', '')[:100]}...")
    else:
        print("\n💻 No code blocks found in documents")
    
    # Step 5: Test enrichment (optional - needs GROQ_API_KEY)
    print("\n🔄 Step 3: Running enrichment pipeline...")
    import os
    if os.environ.get("GROQ_API_KEY"):
        pages = enrich_content(pages, {"max_code_blocks": 3})
        
        # Check if code got explanations
        for p in pages:
            if p.content_type == 'code' and p.code_data.get('explanation'):
                print(f"   ✅ Code explanation: {p.code_data['explanation'][:80]}...")
                break
    else:
        print("   ⚠️  GROQ_API_KEY not set - skipping code explanation")
        print("   Set it with: $env:GROQ_API_KEY = 'gsk_your_key'")
    
    print("\n" + "=" * 60)
    print("  ✅ Test Complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()