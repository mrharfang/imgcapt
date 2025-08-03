#!/usr/bin/env python3
"""
Batch Re-captioning Script for IMGCAPT
Professional FLUX LoRA training dataset preparation

This script:
1. Backs up existing captions with BKUP_ prefix
2. Generates new style-focused captions using Ollama
3. Creates new .txt files for review in IMGCAPT app
"""

import os
import base64
import io
import requests
from pathlib import Path
from PIL import Image
import json

# Configuration
PROCESSED_DIR = Path("data/processed")
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "llava:7b"

# JW Vocabulary to Generic Mapping
VOCABULARY_MAP = {
    "Elder": "dignified mature man in his 40s-50s",
    "Elders": "dignified mature men in their 40s-50s", 
    "two sisters": "two women",
    "three sisters": "three women",
    "sister": "woman",
    "sisters": "women",
    "brother": "man", 
    "brothers": "men",
    "witness couple": "married couple",
    "witness family": "family",
    "Kingdom Hall": "modern meeting hall with simple interior",
    "kingdom hall": "modern meeting hall with simple interior",
    "cart witnessing": "public information display",
    "door to door": "residential visit",
    "door-to-door": "residential visit", 
    "in the ministry": "community outreach",
    "ministry work": "community outreach",
    "informal witnessing": "friendly conversation",
    "circuit overseer": "visiting speaker",
    "pioneer": "dedicated volunteer",
    "pioneers": "dedicated volunteers",
    "Jehovah's Witnesses": "community members",
    "Jehovah's Witness": "community member",
    "Bible study": "educational discussion",
    "Watchtower": "magazine",
    "Awake!": "magazine",
    "field service": "community outreach",
    "preaching work": "community outreach",
    "circuit assembly": "community gathering",
    "district convention": "large community gathering",
    "regional convention": "large community gathering"
}

def normalize_jw_vocabulary(text):
    """Replace JW-specific terms with generic descriptions"""
    normalized = text
    for jw_term, generic_term in VOCABULARY_MAP.items():
        # Case-insensitive replacement
        normalized = normalized.replace(jw_term, generic_term)
        normalized = normalized.replace(jw_term.lower(), generic_term)
        normalized = normalized.replace(jw_term.title(), generic_term)
    return normalized

def encode_image_to_base64(image_path):
    """Convert image to base64 for Ollama"""
    try:
        with Image.open(image_path) as img:
            # Convert to RGB if necessary
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize if too large (for speed)
            max_size = 1024
            if max(img.size) > max_size:
                img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            
            # Convert to base64
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG", quality=85)
            return base64.b64encode(buffered.getvalue()).decode()
    except Exception as e:
        print(f"❌ Error encoding {image_path}: {e}")
        return None

def generate_caption_with_ollama(image_base64, image_name):
    """Generate style-focused caption using Ollama"""
    
    prompt = """Describe this image focusing on:

- The people: their actions, expressions, demographics, clothing, age ranges
- The setting: location, environment, objects, furniture
- The composition: angles, framing, depth, perspective
- Technical details: lighting quality, camera perspective, indoor/outdoor

Be factual and specific about what is visible. Use generic, descriptive language.
Do NOT describe:
- Artistic style, mood, or aesthetic qualities  
- Religious or spiritual context unless explicitly visible
- Editorial or magazine-like qualities
- Any specialized terminology

Provide only the description, nothing else."""

    try:
        # Call Ollama API
        ollama_data = {
            "model": MODEL,
            "prompt": prompt,
            "images": [image_base64],
            "stream": False
        }
        
        print(f"🤖 Generating caption for {image_name}...")
        
        response = requests.post(OLLAMA_URL, json=ollama_data, timeout=120)
        
        if response.status_code == 200:
            result = response.json()
            caption = result.get('response', '').strip()
            
            # Apply vocabulary normalization
            normalized_caption = normalize_jw_vocabulary(caption)
            
            return normalized_caption
        else:
            print(f"❌ Ollama API error for {image_name}: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Error generating caption for {image_name}: {e}")
        return None

def check_ollama_connection():
    """Check if Ollama is running and model is available"""
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            model_names = [model['name'] for model in models]
            
            if MODEL in model_names:
                print(f"✅ Ollama is running with {MODEL} model")
                return True
            else:
                print(f"❌ Model {MODEL} not found. Available models: {model_names}")
                return False
        else:
            print(f"❌ Ollama not responding: {response.status_code}")
            return False
    except requests.exceptions.RequestException:
        print("❌ Cannot connect to Ollama. Please start it with: ollama serve")
        return False

def process_all_images():
    """Main processing function"""
    
    # Check Ollama connection
    if not check_ollama_connection():
        return
    
    if not PROCESSED_DIR.exists():
        print(f"❌ Processed directory not found: {PROCESSED_DIR}")
        return
    
    # Find all PNG files
    png_files = list(PROCESSED_DIR.glob("*.png"))
    
    if not png_files:
        print(f"❌ No PNG files found in {PROCESSED_DIR}")
        return
    
    print(f"🎯 Found {len(png_files)} images to process")
    print(f"📁 Processing directory: {PROCESSED_DIR.absolute()}")
    print("-" * 60)
    
    processed_count = 0
    skipped_count = 0
    error_count = 0
    
    for png_file in sorted(png_files):
        base_name = png_file.stem  # e.g., "003"
        txt_file = PROCESSED_DIR / f"{base_name}.txt"
        backup_file = PROCESSED_DIR / f"BKUP_{base_name}.txt"
        
        print(f"\n📸 Processing: {png_file.name}")
        
        # Step 1: Backup existing caption if it exists
        if txt_file.exists():
            if backup_file.exists():
                print(f"  ⚠️  Backup already exists: {backup_file.name}")
            else:
                txt_file.rename(backup_file)
                print(f"  💾 Backed up caption: {backup_file.name}")
        else:
            print(f"  ⚠️  No existing caption found for {base_name}")
        
        # Step 2: Generate new caption
        image_base64 = encode_image_to_base64(png_file)
        if image_base64 is None:
            print(f"  ❌ Failed to encode image: {png_file.name}")
            error_count += 1
            continue
        
        new_caption = generate_caption_with_ollama(image_base64, png_file.name)
        if new_caption is None:
            print(f"  ❌ Failed to generate caption for: {png_file.name}")
            error_count += 1
            continue
        
        # Step 3: Save new caption
        try:
            txt_file.write_text(new_caption)
            preview = new_caption[:80] + "..." if len(new_caption) > 80 else new_caption
            print(f"  ✅ New caption: \"{preview}\"")
            processed_count += 1
        except Exception as e:
            print(f"  ❌ Failed to save caption: {e}")
            error_count += 1
    
    print("\n" + "="*60)
    print("🎊 BATCH PROCESSING COMPLETE!")
    print(f"✅ Successfully processed: {processed_count}")
    print(f"⚠️  Skipped: {skipped_count}")
    print(f"❌ Errors: {error_count}")
    print(f"📊 Total images: {len(png_files)}")
    print("\n🔍 Next steps:")
    print("1. Use IMGCAPT app to spot-check the new captions")
    print("2. Edit any captions that need refinement")
    print("3. Backup files are saved with BKUP_ prefix if you need to revert")

if __name__ == "__main__":
    print("🚀 IMGCAPT Batch Re-captioning Script")
    print("=" * 60)
    
    try:
        process_all_images()
    except KeyboardInterrupt:
        print("\n\n⏹️  Script interrupted by user")
    except Exception as e:
        print(f"\n💥 Fatal error: {e}")
        print("Make sure Ollama is running and the processed directory exists")