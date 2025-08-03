/**
 * IMG.CAPT Image Editor
 * Old-school animation loop with direct manipulation
 */

export class ImageEditor {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        
        // Image state
        this.sourceImg = null;
        this.ghostX = 0;
        this.ghostY = 0;
        this.ghostHeight = 600; // Default for 16:9
        this.ghostWidth = 0;    // Calculated from aspect
        this.originalAspect = 1;
        this.currentAspectRatio = '16:9'; // Track current aspect ratio
        
        // Canvas dimensions (16:9 or 1:1)
        this.canvasWidth = 1067;
        this.canvasHeight = 600;
        
        // Interaction state
        this.isDragging = false;
        this.isResizing = false;
        this.mouseDownX = 0;
        this.mouseDownY = 0;
        this.shiftPressed = false;
        
        // Animation
        this.isAnimating = false;
        this.animationFrameId = null;
        
        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
    }
    
    init(container) {
        this.container = container;
        this.setupBackgroundImage();
        this.setupEvents();
    }
    
    setupBackgroundImage() {
        // Create background ghost image element
        this.bgImage = document.createElement('img');
        this.bgImage.id = 'bg-image';
        this.bgImage.className = 'background-image';
        this.container.insertBefore(this.bgImage, this.container.firstChild);
    }
    
    setupEvents() {
        this.container.addEventListener('mousedown', this.handleMouseDown);
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
        this.container.addEventListener('mouseleave', this.handleMouseLeave);
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }
    
    loadImage(imageSrc) {
        const img = new Image();
        img.onload = () => {
            this.sourceImg = img;
            this.originalAspect = img.width / img.height;
            
            // Update background image
            this.bgImage.src = imageSrc;
            
            // Reset layout with new image
            this.resetLayout();
            
            this.startAnimation();
        };
        img.src = imageSrc;
    }
    
    resetLayout() {
        if (!this.sourceImg) return;
        
        // Ghost height depends on current aspect ratio
        this.ghostHeight = this.currentAspectRatio === '1:1' ? 768 : 600;
        this.ghostWidth = this.ghostHeight * this.originalAspect;
        
        // Center ghost image both horizontally and vertically relative to canvas
        this.ghostX = (this.canvasWidth - this.ghostWidth) / 2;
        this.ghostY = (this.canvasHeight - this.ghostHeight) / 2;
        
        // Update background image position immediately
        this.updateBackgroundImage();
        
        // Update resize handle position immediately
        this.updateResizeHandle();
        
        // Redraw
        this.draw();
    }
    
    setCanvasDimensions(width, height, aspectRatio = null) {
        // Clear to black immediately
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        // Update dimensions
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Update aspect ratio if provided
        if (aspectRatio) {
            this.currentAspectRatio = aspectRatio;
        }
        
        // Reset layout if we have an image
        if (this.sourceImg) {
            // Need to wait for the browser to reflow after canvas size change
            // so that getBoundingClientRect returns correct values
            requestAnimationFrame(() => {
                this.resetLayout();
            });
        }
    }
    
    handleMouseDown(e) {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Get canvas offset within container
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasOffsetX = canvasRect.left - rect.left;
        const canvasOffsetY = canvasRect.top - rect.top;
        
        // Adjust coordinates to canvas space
        const canvasX = x - canvasOffsetX;
        const canvasY = y - canvasOffsetY;
        
        // Check if clicking on knob (bottom-right corner of ghost)
        const knobX = this.ghostX + this.ghostWidth - 10;
        const knobY = this.ghostY + this.ghostHeight - 10;
        
        if (canvasX >= knobX && canvasX <= knobX + 20 && 
            canvasY >= knobY && canvasY <= knobY + 20) {
            this.isResizing = true;
            this.mouseDownX = x;
            this.mouseDownY = y;
            e.preventDefault();
        } else if (canvasX >= this.ghostX && canvasX <= this.ghostX + this.ghostWidth &&
                   canvasY >= this.ghostY && canvasY <= this.ghostY + this.ghostHeight) {
            this.isDragging = true;
            this.mouseDownX = canvasX - this.ghostX;
            this.mouseDownY = canvasY - this.ghostY;
            e.preventDefault();
        }
        
        if (this.isDragging || this.isResizing) {
            this.startAnimation();
        }
    }
    
    handleMouseMove(e) {
        if (!this.isDragging && !this.isResizing) return;
        
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Get canvas offset
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasOffsetX = canvasRect.left - rect.left;
        const canvasOffsetY = canvasRect.top - rect.top;
        
        const canvasX = x - canvasOffsetX;
        const canvasY = y - canvasOffsetY;
        
        if (this.isDragging) {
            if (this.shiftPressed) {
                // Horizontal-only constraint
                this.ghostX = canvasX - this.mouseDownX;
                // Keep Y position unchanged
            } else {
                // Normal free movement
                this.ghostX = canvasX - this.mouseDownX;
                this.ghostY = canvasY - this.mouseDownY;
            }
        } else if (this.isResizing) {
            // Y position determines height
            const newHeight = canvasY - this.ghostY;
            if (newHeight > 100) { // Min height
                this.ghostHeight = newHeight;
                this.ghostWidth = this.ghostHeight * this.originalAspect;
            }
        }
        
        this.updateBackgroundImage();
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.isResizing = false;
        
        // Let animation run briefly then stop
        setTimeout(() => this.stopAnimation(), 100);
    }
    
    handleMouseLeave() {
        this.isDragging = false;
        this.isResizing = false;
        this.stopAnimation();
    }
    
    updateBackgroundImage() {
        if (!this.bgImage || !this.sourceImg) return;
        
        // Make sure image is visible
        this.bgImage.style.display = 'block';
        this.bgImage.style.opacity = '0.3';
        
        // Get canvas position relative to container
        const canvasRect = this.canvas.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        const canvasOffsetX = canvasRect.left - containerRect.left;
        const canvasOffsetY = canvasRect.top - containerRect.top;
        
        // Position ghost image relative to canvas origin
        this.bgImage.style.width = `${this.ghostWidth}px`;
        this.bgImage.style.height = `${this.ghostHeight}px`;
        this.bgImage.style.left = `${canvasOffsetX + this.ghostX}px`;
        this.bgImage.style.top = `${canvasOffsetY + this.ghostY}px`;
    }
    
    startAnimation() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.animate();
    }
    
    stopAnimation() {
        if (!this.isDragging && !this.isResizing) {
            this.isAnimating = false;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
    }
    
    animate() {
        if (!this.isAnimating) return;
        
        this.draw();
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
    
    draw() {
        // Clear canvas with black background
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        if (!this.sourceImg) return;
        
        // Calculate intersection
        const intersection = this.getIntersection();
        
        if (intersection) {
            // Calculate source coordinates
            const sourceX = (intersection.x - this.ghostX) / (this.ghostWidth / this.sourceImg.width);
            const sourceY = (intersection.y - this.ghostY) / (this.ghostHeight / this.sourceImg.height);
            const sourceWidth = intersection.width / (this.ghostWidth / this.sourceImg.width);
            const sourceHeight = intersection.height / (this.ghostHeight / this.sourceImg.height);
            
            // Draw the bright cropped portion
            this.ctx.drawImage(
                this.sourceImg,
                sourceX, sourceY, sourceWidth, sourceHeight,
                intersection.x, intersection.y, intersection.width, intersection.height
            );
        }
        
        // Update resize handle position
        this.updateResizeHandle();
    }
    
    getIntersection() {
        const imageRect = {
            x: this.ghostX,
            y: this.ghostY,
            width: this.ghostWidth,
            height: this.ghostHeight
        };
        
        const canvasRect = {
            x: 0,
            y: 0,
            width: this.canvasWidth,
            height: this.canvasHeight
        };
        
        const x1 = Math.max(imageRect.x, canvasRect.x);
        const y1 = Math.max(imageRect.y, canvasRect.y);
        const x2 = Math.min(imageRect.x + imageRect.width, canvasRect.x + canvasRect.width);
        const y2 = Math.min(imageRect.y + imageRect.height, canvasRect.y + canvasRect.height);
        
        if (x2 <= x1 || y2 <= y1) {
            return null;
        }
        
        return {
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1
        };
    }
    
    updateResizeHandle() {
        const handle = document.getElementById('resize-handle');
        if (!handle || !this.sourceImg) {
            if (handle) handle.style.display = 'none';
            return;
        }
        
        // Get canvas position relative to container
        const canvasRect = this.canvas.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        const canvasOffsetX = canvasRect.left - containerRect.left;
        const canvasOffsetY = canvasRect.top - containerRect.top;
        
        // Position handle at bottom-right corner of ghost
        const handleX = canvasOffsetX + this.ghostX + this.ghostWidth - 10;
        const handleY = canvasOffsetY + this.ghostY + this.ghostHeight - 10;
        
        handle.style.display = 'block';
        handle.style.left = `${handleX}px`;
        handle.style.top = `${handleY}px`;
    }
    
    getCanvasBlob() {
        return new Promise(resolve => {
            this.canvas.toBlob(resolve, 'image/png');
        });
    }
    
    clear() {
        this.sourceImg = null;
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        if (this.bgImage) {
            this.bgImage.src = '';
            this.bgImage.style.display = 'none';
        }
        const handle = document.getElementById('resize-handle');
        if (handle) {
            handle.style.display = 'none';
        }
        this.stopAnimation();
    }
    
    handleKeyDown(e) {
        if (e.key === 'Shift' && !this.shiftPressed) {
            this.shiftPressed = true;
            // Update SHIFT indicator
            const indicator = document.getElementById('shift-indicator');
            if (indicator) {
                indicator.classList.add('active');
            }
        }
    }
    
    handleKeyUp(e) {
        if (e.key === 'Shift' && this.shiftPressed) {
            this.shiftPressed = false;
            // Update SHIFT indicator
            const indicator = document.getElementById('shift-indicator');
            if (indicator) {
                indicator.classList.remove('active');
            }
        }
    }
    
    destroy() {
        this.container.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        this.container.removeEventListener('mouseleave', this.handleMouseLeave);
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        
        if (this.bgImage && this.bgImage.parentNode) {
            this.bgImage.parentNode.removeChild(this.bgImage);
        }
        
        this.stopAnimation();
    }
}
