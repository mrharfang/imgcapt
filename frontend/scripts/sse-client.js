/**
 * SSE Client Handler
 * Manages Server-Sent Events connection and message routing
 */

export class SSEClient {
    constructor() {
        this.eventSource = null;
        this.handlers = new Map();
        this.logElement = null;
        this.statusDot = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }
    
    init(config = {}) {
        this.logElement = config.logElement || document.getElementById('sse-log');
        this.statusDot = config.statusDot || document.getElementById('status-dot-1');
        
        // Initialize with a startup message
        this.log('IMGAPT UI initialization activated.', 'INF');        
        this.connect();
    }
    
    connect() {
        if (this.eventSource) {
            this.eventSource.close();
        }
        
        this.eventSource = new EventSource('/api/sse/events');
        
        this.eventSource.onopen = () => {
            this.log('Connected to server', 'INF');
            this.updateStatus(true);
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
        };
        
        this.eventSource.onerror = (error) => {
            this.log('Connection error - retrying...', 'ERR');
            this.updateStatus(false);
            
            // Exponential backoff for reconnection
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                setTimeout(() => {
                    this.reconnectAttempts++;
                    this.reconnectDelay *= 2;
                    this.connect();
                }, this.reconnectDelay);
            } else {
                this.log('Max reconnection attempts reached', 'ERR');
            }
        };
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (e) {
                console.error('SSE parse error:', e);
                this.log('Parse error: ' + e.message, 'ERR');
            }
        };
    }
    
    on(eventType, handler) {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        this.handlers.get(eventType).push(handler);
    }
    
    off(eventType, handler) {
        if (this.handlers.has(eventType)) {
            const handlers = this.handlers.get(eventType);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    handleMessage(data) {
        const { event, data: eventData } = data;
        
        // Determine message type and format message
        let type = 'SSE';
        let message = `Event: ${event}`;
        
        // Categorize by event type
        if (event.includes('error')) {
            type = 'ERR';
            message = `${event} - ${eventData.error || eventData.message || 'Unknown error'}`;
        } else if (event.includes('progress') || event.includes('start') || event.includes('complete')) {
            type = 'INF';
            if (eventData.message) {
                message = eventData.message;
            } else if (event === 'import.progress') {
                message = `Import progress: ${eventData.current}/${eventData.total} - ${eventData.filename}`;
            } else if (event === 'import.complete') {
                message = eventData.message || `Import complete: ${eventData.imported_count} files`;
            }
        } else if (event === 'keepalive') {
            type = 'DBG';
            message = 'Keepalive ping';
        }
        
        // Log the event
        this.log(message, type);
        
        // Call registered handlers
        if (this.handlers.has(event)) {
            this.handlers.get(event).forEach(handler => {
                try {
                    handler(eventData);
                } catch (e) {
                    console.error(`Error in handler for ${event}:`, e);
                    this.log(`Handler error for ${event}: ${e.message}`, 'ERR');
                }
            });
        }
        
        // Update status indicator based on event type
        if (event === 'process.progress' || event === 'file.processed') {
            this.updateStatus(true);
            setTimeout(() => this.updateStatus(false), 500);
        }
    }
    
    log(message, type = 'SSE') {
        if (!this.logElement) return;
        
        // Get formatted timestamp
        const now = new Date();
        const timestamp = this.formatTimestamp(now);
        
        // Increment message counter
        if (!this.messageCounter) {
            this.messageCounter = 100;
        }
        const counter = String(this.messageCounter++).padStart(5, '0');
        
        // Create the formatted line
        const line = document.createElement('div');
        line.className = 'sse-line';
        
        // Type tag (3 chars, bold)
        const typeSpan = document.createElement('span');
        typeSpan.className = `sse-type sse-type-${type.toLowerCase()}`;
        typeSpan.textContent = type.toUpperCase().padEnd(3, ' ').substring(0, 3);
        
        // Counter
        const counterSpan = document.createElement('span');
        counterSpan.className = 'sse-counter';
        counterSpan.textContent = counter;
        
        // Message
        const messageSpan = document.createElement('span');
        messageSpan.className = 'sse-message';
        messageSpan.textContent = message;
        
        // Timestamp
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'sse-timestamp';
        timestampSpan.textContent = timestamp;
        
        // Assemble the line
        line.appendChild(typeSpan);
        line.appendChild(counterSpan);
        line.appendChild(messageSpan);
        line.appendChild(timestampSpan);
        
        this.logElement.appendChild(line);
        this.logElement.scrollTop = this.logElement.scrollHeight;
        
        // Keep only last 100 lines
        const lines = this.logElement.querySelectorAll('.sse-line');
        if (lines.length > 100) {
            lines[0].remove();
        }
    }
    
    formatTimestamp(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ms = String(date.getMilliseconds()).padStart(3, '0');
        
        return `${year}.${month}.${day}:${hours}:${minutes}:${seconds}:${ms}`;
    }
    
    updateStatus(active) {
        if (this.statusDot) {
            if (active) {
                this.statusDot.classList.add('active');
            } else {
                this.statusDot.classList.remove('active');
            }
        }
    }
    
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.handlers.clear();
    }
}
