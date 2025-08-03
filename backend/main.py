"""
IMGCAPT API Server
Professional FLUX LoRA training dataset preparation with AI-powered captioning
"""

import os
import asyncio
import logging
import shutil
import base64
import io
from pathlib import Path
from typing import Optional, List
from contextlib import asynccontextmanager
from datetime import datetime
import uuid
import requests
from PIL import Image

from fastapi import FastAPI, Request, Response, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from sse_manager import sse_manager

# Load environment
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR / "frontend"


# Pydantic models (our standard for validation)
class HealthResponse(BaseModel):
    """Health check response"""
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.now)
    version: str = "0.1.0"
    sse_clients: int = 0


class ProcessRequest(BaseModel):
    """Example process request"""
    action: str
    data: dict = Field(default_factory=dict)


# Lifespan manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown tasks"""
    # Startup
    logger.info("Starting IMGCAPT server...")
    
    # Ensure directories exist
    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "raw").mkdir(exist_ok=True)
    (DATA_DIR / "processed").mkdir(exist_ok=True)
    
    yield
    
    # Shutdown
    logger.info("Shutting down IMGCAPT server...")


# Create FastAPI app
app = FastAPI(
    title="IMGCAPT",
    description="Professional FLUX LoRA training dataset preparation",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware (configure as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# API Routes
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        sse_clients=sse_manager.client_count
    )


@app.post("/api/folder")
async def load_folder(request: dict):
    """Load images from folder"""
    path = request.get("path", "")
    
    # For demo, use JWxPHOTO folder
    if "JWxMAG" in path:
        folder_path = BASE_DIR / "JWxPHOTO"
        files = []
        for f in folder_path.glob("*"):
            if f.suffix.lower() in [".png", ".jpg", ".jpeg"]:
                files.append(f.name)
        files.sort()
        return {
            "path": str(folder_path),
            "files": files[:20]  # Limit to first 20 for demo
        }
    
    # Default mock data
    return {
        "path": path,
        "files": []
    }


@app.get("/api/image/{filename}")
async def get_image(filename: str):
    """Serve image file"""
    # For testing, check JWxPHOTO folder first
    test_image_path = BASE_DIR / "JWxPHOTO" / filename
    if test_image_path.exists():
        return FileResponse(test_image_path)
    
    # Then check data/raw folder
    image_path = DATA_DIR / "raw" / filename
    if image_path.exists():
        return FileResponse(image_path)
    
    raise HTTPException(status_code=404, detail="Image not found")


@app.delete("/api/image/{filename}")
async def delete_image(filename: str):
    """Delete an image file"""
    try:
        # Broadcast deletion event
        await sse_manager.broadcast("file.deleted", {
            "filename": filename,
            "timestamp": datetime.now().isoformat()
        })
        
        return {"status": "success", "message": f"Deleted {filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sse/events")
async def sse_endpoint(request: Request):
    """SSE endpoint for real-time updates"""
    client_id = str(uuid.uuid4())
    
    async def event_generator():
        async with sse_manager.client_handler(client_id) as client:
            # Subscribe to all events by default
            await sse_manager.subscribe(client_id, "*")
            
            try:
                while True:
                    # Check if client disconnected
                    if await request.is_disconnected():
                        break
                    
                    try:
                        # Wait for messages with timeout
                        message = await asyncio.wait_for(
                            client.queue.get(),
                            timeout=30.0  # 30 second timeout for keepalive
                        )
                        yield sse_manager.format_sse(message)
                        
                    except asyncio.TimeoutError:
                        # Send keepalive
                        yield sse_manager.format_sse({
                            "event": "keepalive",
                            "data": {"timestamp": datetime.now().isoformat()}
                        })
                        
            except asyncio.CancelledError:
                logger.info(f"SSE client {client_id} cancelled")
                raise
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        }
    )


@app.post("/api/import")
async def import_images(request: dict):
    """DEPRECATED: Legacy import endpoint - use /api/import-upload instead"""
    # This endpoint remains for backwards compatibility
    # but now just returns an error directing to the new endpoint
    return {
        "status": "error",
        "message": "Please use /api/import-upload endpoint for file uploads",
        "imported_count": 0,
        "skipped_count": 0
    }


@app.post("/api/import-upload")
async def import_images_upload(
    source_folder: str = Form(...),
    files: List[UploadFile] = File(...)
):
    """Import images from uploaded files to raw folder"""
    try:
        # Broadcast start of import
        await sse_manager.broadcast("import.start", {
            "source_folder": source_folder,
            "total_files": len(files),
            "timestamp": datetime.now().isoformat()
        })
        
        # Clear raw folder first
        raw_dir = DATA_DIR / "raw"
        if raw_dir.exists():
            await sse_manager.broadcast("import.clearing", {
                "message": "Clearing workspace..."
            })
            shutil.rmtree(raw_dir)
        raw_dir.mkdir(exist_ok=True)
        
        imported_count = 0
        skipped_count = 0
        
        # Process uploaded files
        await sse_manager.broadcast("import.found", {
            "total_files": len(files),
            "image_files": len([f for f in files if f.content_type and f.content_type.startswith('image/')]),
            "message": f"Processing {len(files)} uploaded files..."
        })
        
        for file in files:
            # Check if it's an image
            if file.content_type and file.content_type.startswith('image/'):
                # Extract just the filename from the path
                # file.filename might be "JWxMAG/image.jpg" when using webkitdirectory
                filename = Path(file.filename).name
                
                # Save the file
                dest = raw_dir / filename
                contents = await file.read()
                dest.write_bytes(contents)
                imported_count += 1
                
                # Broadcast progress
                await sse_manager.broadcast("import.progress", {
                    "filename": filename,
                    "current": imported_count,
                    "total": len(files),
                    "percent": int((imported_count / len(files)) * 100)
                })
                
                # Small delay to not overwhelm SSE
                if imported_count % 5 == 0:
                    await asyncio.sleep(0.1)
            else:
                skipped_count += 1
        
        # Broadcast completion
        await sse_manager.broadcast("import.complete", {
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "message": f"Import complete: {imported_count} images added to workspace",
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"Imported {imported_count} images to raw folder")
        
        return {
            "status": "success",
            "imported_count": imported_count,
            "skipped_count": skipped_count
        }
        
    except Exception as e:
        logger.error(f"Import error: {e}")
        await sse_manager.broadcast("import.error", {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/raw-images")
async def get_raw_images():
    """Get list of images in raw folder"""
    raw_dir = DATA_DIR / "raw"
    files = []
    
    if raw_dir.exists():
        for f in raw_dir.glob("*"):
            if f.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                files.append(f.name)
    
    files.sort()
    return {"files": files}


@app.get("/api/raw-image/{filename}")
async def get_raw_image(filename: str):
    """Serve image from raw folder"""
    image_path = DATA_DIR / "raw" / filename
    if image_path.exists():
        return FileResponse(image_path)
    
    raise HTTPException(status_code=404, detail="Image not found")


@app.delete("/api/raw-image/{filename}")
async def delete_raw_image(filename: str):
    """Delete image from raw folder"""
    try:
        image_path = DATA_DIR / "raw" / filename
        if image_path.exists():
            image_path.unlink()
            
            # Broadcast deletion event
            await sse_manager.broadcast("file.deleted", {
                "filename": filename,
                "timestamp": datetime.now().isoformat()
            })
            
            return {"status": "success", "message": f"Deleted {filename}"}
        else:
            raise HTTPException(status_code=404, detail="File not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/raw-images/clear")
async def clear_raw_images():
    """Clear all images from raw folder"""
    try:
        raw_dir = DATA_DIR / "raw"
        count = 0
        
        if raw_dir.exists():
            # Count and delete all image files
            for f in raw_dir.glob("*"):
                if f.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                    f.unlink()
                    count += 1
            
            # Broadcast clear event
            await sse_manager.broadcast("workspace.cleared", {
                "count": count,
                "timestamp": datetime.now().isoformat()
            })
            
            return {"status": "success", "message": f"Cleared {count} images from workspace"}
        
        return {"status": "success", "message": "Workspace already empty"}
        
    except Exception as e:
        logger.error(f"Clear workspace error: {e}")
        await sse_manager.broadcast("workspace.error", {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/processed-images")
async def get_processed_images():
    """Get list of processed image sets (paired .png/.txt files)"""
    processed_dir = DATA_DIR / "processed"
    sets = []
    
    if processed_dir.exists():
        # Get all PNG files and sort them
        png_files = sorted(processed_dir.glob("*.png"))
        
        for png_file in png_files:
            base_name = png_file.stem  # e.g., "003" from "003.png"
            txt_file = png_file.with_suffix(".txt")
            caption = ""
            
            if txt_file.exists():
                try:
                    caption = txt_file.read_text().strip()
                except Exception as e:
                    logger.warning(f"Could not read caption for {base_name}: {e}")
            
            sets.append({
                "base_name": base_name,
                "image_file": png_file.name,
                "caption_file": txt_file.name,
                "caption": caption,
                "created": datetime.fromtimestamp(png_file.stat().st_mtime).isoformat()
            })
    
    return {"sets": sets, "count": len(sets)}


@app.get("/api/processed-image/{filename}")
async def get_processed_image(filename: str):
    """Serve processed image file"""
    image_path = DATA_DIR / "processed" / filename
    if image_path.exists():
        return FileResponse(image_path)
    
    raise HTTPException(status_code=404, detail="Processed image not found")


@app.get("/api/processed-caption/{base_name}")
async def get_processed_caption(base_name: str):
    """Get caption text for a processed image set"""
    processed_dir = DATA_DIR / "processed"
    caption_path = processed_dir / f"{base_name}.txt"
    
    if caption_path.exists():
        try:
            caption = caption_path.read_text().strip()
            return {"caption": caption}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading caption: {e}")
    else:
        raise HTTPException(status_code=404, detail="Caption file not found")


@app.put("/api/processed-caption/{base_name}")
async def update_processed_caption(base_name: str, request: dict):
    """Update caption text for a processed image set (instant save)"""
    try:
        caption = request.get("caption", "")
        processed_dir = DATA_DIR / "processed"
        caption_path = processed_dir / f"{base_name}.txt"
        
        # Write the caption
        caption_path.write_text(caption)
        
        # Broadcast update event
        await sse_manager.broadcast("caption.updated", {
            "base_name": base_name,
            "caption": caption,
            "timestamp": datetime.now().isoformat()
        })
        
        return {"status": "success", "message": "Caption updated"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/processed-set/{base_name}")
async def delete_processed_set(base_name: str):
    """Delete both image and caption files for a processed set"""
    try:
        processed_dir = DATA_DIR / "processed"
        image_path = processed_dir / f"{base_name}.png"
        caption_path = processed_dir / f"{base_name}.txt"
        
        deleted_files = []
        
        if image_path.exists():
            image_path.unlink()
            deleted_files.append(f"{base_name}.png")
            
        if caption_path.exists():
            caption_path.unlink()
            deleted_files.append(f"{base_name}.txt")
            
        if deleted_files:
            # Broadcast deletion event
            await sse_manager.broadcast("processed.deleted", {
                "base_name": base_name,
                "deleted_files": deleted_files,
                "timestamp": datetime.now().isoformat()
            })
            
            return {"status": "success", "message": f"Deleted set {base_name}", "deleted_files": deleted_files}
        else:
            raise HTTPException(status_code=404, detail="Set not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/processed-image/{filename}")
async def delete_processed_image(filename: str):
    """DEPRECATED: Use /api/processed-set/{base_name} instead"""
    # Convert filename to base_name for compatibility
    base_name = Path(filename).stem
    return await delete_processed_set(base_name)


@app.post("/api/generate-caption")
async def generate_caption(file: UploadFile = File(...)):
    """Generate caption for image using Ollama vision model"""
    try:
        # Log the incoming request
        print(f"🎯 CAPTION REQUEST: Processing file '{file.filename}' (size: {file.size} bytes)")
        
        # Broadcast start of caption generation
        await sse_manager.broadcast("caption.generate.start", {
            "filename": file.filename,
            "file_size": file.size,
            "timestamp": datetime.now().isoformat()
        })
        
        # Read and process the image
        contents = await file.read()
        print(f"📸 IMAGE DATA: Read {len(contents)} bytes from '{file.filename}'")
        
        # Convert to PIL Image and prepare for Ollama
        img = Image.open(io.BytesIO(contents))
        print(f"🖼️  PIL IMAGE: {img.mode} {img.size} from '{file.filename}'")
        
        # Convert to RGB if necessary
        if img.mode != 'RGB':
            img = img.convert('RGB')
            print(f"🎨 CONVERTED: {file.filename} to RGB mode")
        
        # Resize if too large (for speed)
        max_size = 1024
        original_size = img.size
        if max(img.size) > max_size:
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            print(f"📏 RESIZED: {file.filename} from {original_size} to {img.size}")
        
        # Convert to base64
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=85)
        image_base64 = base64.b64encode(buffered.getvalue()).decode()
        base64_length = len(image_base64)
        print(f"🔢 BASE64: {file.filename} encoded to {base64_length} characters")
        
        # Broadcast processing status
        await sse_manager.broadcast("caption.generate.processing", {
            "filename": file.filename,
            "image_size": img.size,
            "base64_length": base64_length,
            "message": f"Sending {file.filename} to Ollama..."
        })
        
        # Check if Ollama is running
        try:
            response = requests.get("http://localhost:11434/api/tags", timeout=5)
            if response.status_code != 200:
                raise Exception("Ollama not responding")
            print(f"✅ OLLAMA: Service is running and responding")
        except requests.exceptions.RequestException:
            print(f"❌ OLLAMA: Service unavailable")
            raise HTTPException(status_code=503, detail="Ollama service unavailable. Please start Ollama: ollama serve")
        
        # Prepare the prompt for style-focused description (FLUX training optimized)
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
        
        # Call Ollama API
        ollama_data = {
            "model": "llava:7b",  # Match your exact model name
            "prompt": prompt,
            "images": [image_base64],
            "stream": False
        }
        
        print(f"🤖 OLLAMA CALL: Sending {file.filename} to llava:7b model...")
        
        response = requests.post(
            "http://localhost:11434/api/generate",
            json=ollama_data,
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            caption = result.get('response', '').strip()
            
            print(f"✨ CAPTION GENERATED for {file.filename}: '{caption[:100]}{'...' if len(caption) > 100 else ''}'")
            
            # Broadcast success
            await sse_manager.broadcast("caption.generate.success", {
                "filename": file.filename,
                "caption_preview": caption[:100] + ('...' if len(caption) > 100 else ''),
                "caption_length": len(caption),
                "timestamp": datetime.now().isoformat()
            })
            
            return {
                "status": "success",
                "caption": caption
            }
        else:
            error_msg = f"Ollama API error: {response.status_code}"
            print(f"❌ OLLAMA ERROR for {file.filename}: {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)
            
    except Exception as e:
        print(f"💥 CAPTION ERROR for {getattr(file, 'filename', 'unknown')}: {e}")
        logger.error(f"Caption generation error: {e}")
        
        # Broadcast error
        await sse_manager.broadcast("caption.generate.error", {
            "filename": getattr(file, 'filename', 'unknown'),
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })
        
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/process")
async def process_image(
    file: UploadFile = File(...),
    original_filename: str = Form(...),
    caption: str = Form(...)
):
    """Process an image with caption"""
    try:
        # Broadcast start event
        await sse_manager.broadcast("process.start", {
            "filename": original_filename,
            "timestamp": datetime.now().isoformat()
        })
        
        # Get next available number
        processed_dir = DATA_DIR / "processed"
        processed_dir.mkdir(exist_ok=True)
        
        existing_files = list(processed_dir.glob("*.png"))
        next_num = len(existing_files) + 1
        output_filename = f"{next_num:03d}.png"
        output_txt = f"{next_num:03d}.txt"
        
        # Simulate processing steps
        await asyncio.sleep(0.5)
        await sse_manager.broadcast("process.progress", {
            "progress": 50,
            "message": "Saving cropped image..."
        })
        
        # Save image
        image_path = processed_dir / output_filename
        contents = await file.read()
        image_path.write_bytes(contents)
        
        await asyncio.sleep(0.5)
        await sse_manager.broadcast("process.progress", {
            "progress": 75,
            "message": "Writing caption file..."
        })
        
        # Save caption
        caption_path = processed_dir / output_txt
        caption_path.write_text(caption)
        
        await asyncio.sleep(0.5)
        
        # Broadcast completion
        await sse_manager.broadcast("file.processed", {
            "original_filename": original_filename,
            "output_filename": output_filename,
            "timestamp": datetime.now().isoformat()
        })
        
        return JSONResponse({
            "status": "success",
            "output_filename": output_filename,
            "message": "Image processed successfully"
        })
        
    except Exception as e:
        await sse_manager.broadcast("process.error", {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })
        
        raise HTTPException(status_code=500, detail=str(e))


# Mount static files (frontend)
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
