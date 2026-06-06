// src/cache/server.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class ValkeyServer {
    constructor() {
        this.process = null;

        // 解析 VALKEY_URL 获取端口，默认 6379
        const url = process.env.VALKEY_URL || 'redis://127.0.0.1:6379';
        const match = url.match(/:(\d+)/);
        this.port = match ? match[1] : 6379;

        // 数据存储路径：项目根目录/data/db
        this.dbPath = path.join(process.cwd(), 'data', 'db');

        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath, { recursive: true });
        }
    }

    start() {
        return new Promise((resolve, reject) => {
            const net = require('net');
            const tester = net.createServer()
                .once('error', (err) => {
                    if (err.code === 'EADDRINUSE') {
                        logger.done(`检测到端口 ${this.port} 已被占用，跳过服务拉起逻辑 (假定服务已在运行)`);
                        return resolve();
                    }
                    reject(err);
                })
                .once('listening', () => {
                    tester.close();
                    this._actuallyStart().then(resolve).catch(reject);
                })
                .listen(this.port);
        });
    }

    _actuallyStart() {
        return new Promise((resolve, reject) => {
            const binary = process.env.VALKEY_BINARY || 'valkey-server';
            logger.info(`正在拉起私有 Valkey 服务 (${binary} on port ${this.port})...`);

            // 增加 5 秒超时保护
            const timeout = setTimeout(() => {
                logger.warn('Valkey 启动检测超时，尝试继续执行...');
                resolve();
            }, 5000);

            // 启动参数
            const args = [
                '--port', this.port.toString(),
                '--dir', this.dbPath,
                '--dbfilename', 'hsr_bot.rdb',
                '--save', '900 1',
                '--daemonize', 'no'
            ];

            this.process = spawn(binary, args);

            this.process.stdout.on('data', (data) => {
                const msg = data.toString();
                // 同时兼容 Valkey 和 Redis 的就绪日志
                if (msg.includes('Ready to accept connections') || msg.includes('ready to accept connections')) {
                    clearTimeout(timeout);
                    logger.done(`Valkey 服务已就绪 (Port: ${this.port})`);
                    resolve();
                }
            });

            this.process.stderr.on('data', (data) => {
                // Valkey 的一些常规输出也在 stderr
            });

            this.process.on('error', (err) => {
                logger.error('无法启动 Valkey，请检查是否安装了 valkey 软件包', err);
                reject(err);
            });

            // 进程意外退出处理
            this.process.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    logger.error(`Valkey 进程异常退出，错误码: ${code}`);
                }
            });
        });
    }

    stop() {
        if (this.process) {
            logger.info('正在停止 Valkey 服务...');
            this.process.kill();
        }
    }
}

module.exports = new ValkeyServer();
