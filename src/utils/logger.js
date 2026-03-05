import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Logger {
  constructor(options = {}) {
    this.options = {
      level: process.env.LOG_LEVEL || 'info',
      toFile: process.env.LOG_TO_FILE === 'true',
      filePath: process.env.LOG_FILE || path.join(__dirname, '../../logs/agent.log'),
      colors: process.stdout.isTTY,
      ...options
    };

    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    this.levelValue = this.levels[this.options.level] || 2;

    this.colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[32m', // Green
      reset: '\x1b[0m'
    };

    if (this.options.toFile) {
      this.ensureLogDirectory();
    }
  }

  async ensureLogDirectory() {
    const logDir = path.dirname(this.options.filePath);
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  getTimestamp() {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = this.getTimestamp();
    let formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (Object.keys(meta).length > 0) {
      formatted += ` ${JSON.stringify(meta)}`;
    }
    return formatted;
  }

  formatConsoleMessage(level, message, meta = {}) {
    const timestamp = this.getTimestamp();
    const color = this.colors[level] || this.colors.info;
    const reset = this.colors.reset;

    let formatted = `${color}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}`;
    if (Object.keys(meta).length > 0) {
      formatted += ` ${color}${JSON.stringify(meta)}${reset}`;
    }
    return formatted;
  }

  async writeToFile(message) {
    try {
      await fs.appendFile(this.options.filePath, message + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, message, meta = {}) {
    const levelValue = this.levels[level];
    if (levelValue === undefined || levelValue > this.levelValue) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    const consoleMessage = this.options.colors
      ? this.formatConsoleMessage(level, message, meta)
      : formattedMessage;

    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](consoleMessage);

    if (this.options.toFile) {
      this.writeToFile(formattedMessage);
    }
  }

  error(message, meta = {}) { this.log('error', message, meta); }
  warn(message, meta = {}) { this.log('warn', message, meta); }
  info(message, meta = {}) { this.log('info', message, meta); }
  debug(message, meta = {}) { this.log('debug', message, meta); }
}

export const logger = new Logger();
export default logger;