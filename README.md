# IMGCAPT: FLUX LoRA Training Dataset Preparation Tool

**Professional image captioning and dataset preparation for FLUX model training.**

IMGCAPT is a complete solution for preparing high-quality image datasets for FLUX LoRA training. It combines AI-powered caption generation with professional manual editing tools, following research-backed captioning strategies for optimal style learning.

![IMGCAPT Interface](https://img.shields.io/badge/Interface-Professional-blue) ![AI-Powered](https://img.shields.io/badge/AI-Ollama%20LLaVA-green) ![FLUX-Optimized](https://img.shields.io/badge/FLUX-Optimized-orange)

## ✨ Features

### 🤖 AI-Powered Caption Generation
- **Ollama LLaVA Integration**: Leverages LLaVA 7B vision model for intelligent image analysis
- **FLUX-Optimized Prompts**: Research-backed prompting strategy for style training
- **Factual Descriptions**: Generates clean, objective descriptions without style bias
- **Batch Processing**: Auto-caption entire datasets with progress tracking

### 🎨 Professional Editing Interface
- **Dual-Mode UI**: Separate workflows for new images and dataset management
- **Canvas-Based Cropping**: Precision image cropping with aspect ratio controls (16:9, 1:1)
- **Real-Time Preview**: Instant visual feedback during editing
- **Auto-Save**: Seamless caption editing with automatic persistence

### 📁 Dataset Management
- **Paired File System**: Automatic PNG/TXT file synchronization
- **Backup Protection**: Automatic caption backups during batch processing
- **Import Workflow**: Drag-and-drop folder import with progress tracking
- **Navigation Controls**: Keyboard shortcuts and intuitive browsing

### 🔄 Real-Time Updates
- **Server-Sent Events**: Live progress tracking for all operations
- **Connection Resilience**: Auto-reconnecting event stream
- **Detailed Logging**: Comprehensive operation logs with timestamps

## 🚀 Quick Start

### Prerequisites
- **Python 3.8+** with UV package manager
- **Ollama** with LLaVA model installed
- **Modern web browser**

### Installation

1. **Clone and setup**:
   ```bash
   git clone https://github.com/yourusername/imgcapt.git
   cd imgcapt
   uv venv
   source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
   ```

2. **Install dependencies**:
   ```bash
   uv sync
   # OR if you prefer pip:
   pip install -r requirements.txt
   ```

3. **Setup Ollama**:
   ```bash
   # Install Ollama (if not already installed)
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Pull LLaVA model
   ollama pull llava:7b
   
   # Start Ollama service
   ollama serve
   ```

4. **Launch IMGCAPT**:
   ```bash
   python backend/main.py
   ```

5. **Open your browser**:
   Navigate to `http://localhost:8000`

## 📖 Usage Guide

### Import Images
1. Click the **folder button** in the Input tab
2. Select a folder containing your training images
3. Wait for import completion (progress shown in real-time)

### AI Caption Generation
1. Select an image from the file list
2. Adjust cropping and aspect ratio as needed
3. Click **"GENERATE CAPTION"** for AI analysis
4. Review and edit the generated caption
5. Click **"PROCESS"** to save to dataset

### Dataset Management
1. Switch to the **Processed tab**
2. Navigate through your dataset using arrow keys or buttons
3. Edit captions directly with auto-save
4. Delete unwanted entries with confirmation

### Batch Processing
For bulk caption regeneration:
```bash
python batch_recaption.py
```
This will:
- Backup existing captions with `BKUP_` prefix
- Generate new AI captions for all images
- Maintain file organization

## 🧠 Caption Strategy

### FLUX Training Optimization
Based on extensive research into FLUX LoRA training, IMGCAPT uses a **style-focused captioning approach**:

**✅ What We Caption:**
- People: actions, expressions, demographics, clothing
- Setting: location, environment, objects, furniture
- Composition: angles, framing, depth, perspective
- Technical: lighting quality, camera perspective

**❌ What We Avoid:**
- Artistic style or mood descriptions
- Editorial/magazine-like qualities
- Specialized terminology
- Religious or cultural context (unless explicit)

### Research Foundation
Our approach follows findings from the FLUX training community:
- **Consistent datasets** with factual descriptions train better than complex captioning
- **Style separation** from content allows longer training without overfitting
- **Generic vocabulary** prevents model confusion during generation

## 🏗️ Architecture

### Backend (FastAPI)
- **Modern async Python** with type hints throughout
- **Ollama integration** via REST API
- **Server-Sent Events** for real-time updates
- **Robust error handling** with detailed logging

### Frontend (Vanilla JS)
- **No framework dependencies** - pure JavaScript
- **Responsive design** with professional UI
- **Canvas-based editing** for precise image control
- **Real-time communication** via SSE

### File Structure
```
imgcapt/
├── backend/
│   ├── main.py              # FastAPI server
│   └── sse_manager.py       # Real-time event handling
├── frontend/
│   ├── index.html           # Main interface
│   ├── app.js              # Core application logic
│   ├── scripts/            # Modular components
│   └── style.css           # Professional styling
├── data/
│   ├── raw/                # Imported images
│   └── processed/          # Training dataset (PNG + TXT pairs)
├── batch_recaption.py      # Bulk processing script
└── requirements.txt        # Python dependencies
```

## ⚙️ Configuration

### Environment Variables
Create `.env` file for custom configuration:
```env
PORT=8000
HOST=0.0.0.0
OLLAMA_URL=http://localhost:11434
```

### Ollama Models
Supported vision models:
- `llava:7b` (recommended) - Good balance of speed/quality
- `llava:13b` - Higher quality, slower processing
- `llava:34b` - Best quality, requires significant VRAM

## 🔧 Advanced Usage

### Custom Prompts
Modify the vision prompt in `backend/main.py` around line 570 to customize caption style for your specific use case.

### Batch Configuration
Edit `batch_recaption.py` to:
- Change the Ollama model
- Modify processing parameters
- Add custom vocabulary mapping

### API Integration
The FastAPI backend exposes RESTful endpoints:
- `POST /api/generate-caption` - AI caption generation
- `GET /api/processed-images` - Dataset listing
- `PUT /api/processed-caption/{id}` - Caption updates
- `GET /api/sse/events` - Real-time event stream

## 🤝 Contributing

We welcome contributions! Please:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Setup
```bash
# Install in development mode
uv pip install -e .

# Run with auto-reload
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Ollama Team** for the excellent local LLM runtime
- **LLaVA Project** for the powerful vision-language model
- **FLUX Community** for sharing training insights and best practices
- **FastAPI** for the robust async web framework

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/imgcapt/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/imgcapt/discussions)
- **Documentation**: See `/docs` folder for detailed guides

---

**Built with ❤️ for the AI training community**

*Empowering creators to build better datasets, one caption at a time.*
