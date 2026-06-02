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
            const binary = process.env.VALKEY_BINARY || 'valkey-server';
            logger.info(`正在拉起私有 Valkey 服务 (${binary} on port ${this.port})...`);

            // 启动参数
            const args = [
                '--port', this.port.toString(),
                '--dir', this.dbPath,           // 数据文件存放目录
                '--dbfilename', 'hsr_bot.rdb', // 数据库文件名
                '--save', '900 1',              // 自动保存逻辑
                '--daemonize', 'no'             // 不以后台模式运行
            ];

            this.process = spawn(binary, args);

            this.process.stdout.on('data', (data) => {
                if (data.toString().includes('Ready to accept connections')) {
                    logger.done(`Valkey 服务已就绪 (Port: ${this.port})`);
                    resolve();
                }
            });

            this.process.stderr.on('data', (data) => {
                // Valkey 的一些常规输出也在 stderr，这里保持原样输出或交给 logger
                // console.error(`Valkey Error: ${data}`);
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
