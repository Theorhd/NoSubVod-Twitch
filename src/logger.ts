// Advanced logging system for developer mode
declare const chrome: any;

export interface LogEntry {
  timestamp: number;
  type: 'fetch' | 'xhr' | 'worker' | 'ad-block' | 'info' | 'error';
  url?: string;
  method?: string;
  status?: number;
  responseHeaders?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  message: string;
  details?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private isDeveloperMode: boolean = false;
  private maxLogs: number = 1000;
  private sessionStartTime: number;

  constructor() {
    this.sessionStartTime = Date.now();
    this.loadDeveloperMode();
    
    // Listen for settings changes
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener((changes: any) => {
        if (changes.settings) {
          this.isDeveloperMode = changes.settings.newValue?.developerMode || false;
        }
      });
    }
  }

  private async loadDeveloperMode() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['settings'], (result: any) => {
        this.isDeveloperMode = result.settings?.developerMode || false;
      });
    }
  }

  log(entry: Omit<LogEntry, 'timestamp'>) {
    if (!this.isDeveloperMode) return;

    const logEntry: LogEntry = {
      ...entry,
      timestamp: Date.now()
    };

    this.logs.push(logEntry);

    // Keep only last N logs to avoid memory issues
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Log to console with formatting
    const elapsed = ((logEntry.timestamp - this.sessionStartTime) / 1000).toFixed(3);
    const prefix = `[NSV Log +${elapsed}s]`;
    
    switch (entry.type) {
      case 'fetch':
        console.log(`${prefix} FETCH:`, entry.url, entry.details);
        break;
      case 'xhr':
        console.log(`${prefix} XHR:`, entry.url, entry.details);
        break;
      case 'worker':
        console.log(`${prefix} WORKER:`, entry.message, entry.details);
        break;
      case 'ad-block':
        console.log(`${prefix} AD-BLOCK:`, entry.message, entry.details);
        break;
      case 'error':
        console.error(`${prefix} ERROR:`, entry.message, entry.details);
        break;
      default:
        console.log(`${prefix} INFO:`, entry.message, entry.details);
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.sessionStartTime = Date.now();
  }

  exportLogs(): string {
    const header = `NoSubVod Developer Logs
Session started: ${new Date(this.sessionStartTime).toISOString()}
Total entries: ${this.logs.length}
Page URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}

${'='.repeat(80)}

`;

    const logLines = this.logs.map(entry => {
      const time = new Date(entry.timestamp).toISOString();
      const elapsed = ((entry.timestamp - this.sessionStartTime) / 1000).toFixed(3);
      let line = `[${time}] [+${elapsed}s] [${entry.type.toUpperCase()}] ${entry.message}`;
      
      if (entry.url) {
        line += `\n  URL: ${entry.url}`;
      }
      if (entry.method) {
        line += `\n  Method: ${entry.method}`;
      }
      if (entry.status) {
        line += `\n  Status: ${entry.status}`;
      }
      if (entry.requestHeaders && Object.keys(entry.requestHeaders).length > 0) {
        line += `\n  Request Headers: ${JSON.stringify(entry.requestHeaders, null, 2)}`;
      }
      if (entry.responseHeaders && Object.keys(entry.responseHeaders).length > 0) {
        line += `\n  Response Headers: ${JSON.stringify(entry.responseHeaders, null, 2)}`;
      }
      if (entry.details) {
        line += `\n  Details: ${JSON.stringify(entry.details, null, 2)}`;
      }
      
      return line;
    }).join('\n\n');

    return header + logLines;
  }

  downloadLogs() {
    const content = this.exportLogs();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nosubvod-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  isDeveloperModeEnabled(): boolean {
    return this.isDeveloperMode;
  }
}

// Global logger instance
export const logger = new Logger();

// Helper function to get headers from Response
export function getResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

// Helper function to get headers from Request
export function getRequestHeaders(request: Request | RequestInit): Record<string, string> {
  const headers: Record<string, string> = {};
  
  if (request instanceof Request) {
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (request.headers) {
    if (request.headers instanceof Headers) {
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(request.headers)) {
      request.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, request.headers);
    }
  }
  
  return headers;
}
