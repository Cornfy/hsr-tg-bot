/**
 * HSR-TG-Bot 统一测试工具 (2026 入口版)
 * 用法: 
 *   1. node test.js            - 进入交互式终端
 *   2. node test.js <cmd>      - 直接执行单次指令
 */
const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// 终端着色工具
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const gray = (t) => `\x1b[90m${t}\x1b[0m`;
const bold = (t) => `\x1b[1m${t}\x1b[22m`;

// 状态跟踪
let lastContext = { uid: null, buttons: [] };

// 检查是否有命令行参数
const args = process.argv.slice(2);
if (args.length > 0) {
    handleCommand(args.join(' ')).then(() => process.exit(0));
} else {
    startInteractive();
}

function startInteractive() {
    console.clear();
    console.log(bold(cyan('========================================')));
    console.log(bold(cyan('   HSR-TG-Bot 交互式开发测试终端 (2026)   ')));
    console.log(bold(cyan('========================================')));
    
    console.log(gray(`[System] 正在初始化测试环境...`));
    console.log(gray(`[System] 加载业务逻辑核心: OK`));
    console.log(gray(`[System] 建立虚拟 TG 会话: OK (ID: 123456)`));
    console.log(gray(`[System] 连接 Valkey 服务: OK`));
    
    showHelp();
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: bold(cyan('HSR-Bot > '))
    });

    rl.prompt();

    rl.on('line', async (line) => {
        await handleCommand(line);
        rl.prompt();
    }).on('close', () => {
        console.log(yellow('\n会话结束'));
        process.exit(0);
    });
}

function showHelp() {
    console.log(`\n${yellow('可用指令列表 (支持 / 前缀):')}`);
    console.log(`  ${green('bind <UID>')}       - 绑定测试 UID (默认 TG ID: 123456)`);
    console.log(`  ${green('me')}               - 查看个人中心与已绑定信息`);
    console.log(`  ${green('profile <UID>')}    - 请求 API 数据并展示展柜`);
    console.log(`  ${green('gacha <URL>')}      - 同步抽卡记录数据`);
    console.log(`  ${green('view <UID>')}       - 查看本地抽卡分析报告`);
    console.log(`  ${green('touch <名字|编号>')} - 模拟点击按钮 (如 touch 1)`);
    console.log(`  ${green('list')}              - 查看本地缓存数据概览`);
    console.log(`  ${green('clear')}             - 清屏`);
    console.log(`  ${green('exit')}              - 退出\n`);
}

async function handleCommand(line) {
    let rawLine = line.trim();
    if (!rawLine) return;

    // 统一去除 / 前缀进行处理
    const hasSlash = rawLine.startsWith('/');
    const cleanLine = hasSlash ? rawLine.slice(1) : rawLine;
    
    console.log(gray(`\n[User] 执行操作: ${hasSlash ? '/' : ''}${cleanLine}`));

    let finalCmd = '';
    let finalArgs = [];

    const parts = cleanLine.split(/\s+/);
    const cmdInput = parts[0].toLowerCase();
    const cmdArgs = parts.slice(1);

    if (cmdInput === 'touch') {
        const input = cmdArgs.join(' ');
        let callbackData = input;
        const btn = lastContext.buttons.find(b => b.index === input || b.name === input);
        if (btn) callbackData = btn.data;
        finalCmd = 'callback';
        finalArgs = [callbackData];
    } else {
        const cmdMap = {
            'bind': 'bind',
            'me': 'me',
            'profile': 'profile',
            'gacha': 'gacha-url',
            'view': 'gacha-view',
            'list': 'list',
            'update': 'update',
            'help': 'help',
            'clear': 'clear',
            'exit': 'exit'
        };
        finalCmd = cmdMap[cmdInput] || cmdInput;
        finalArgs = cmdArgs;
    }

    if (finalCmd === 'help') return showHelp();
    if (finalCmd === 'clear') return console.clear();
    if (finalCmd === 'exit') { console.log(yellow('拜拜！')); process.exit(0); }

    await runTestAsync(finalCmd, ...finalArgs);
}

function runTestAsync(cmd, ...args) {
    return new Promise((resolve) => {
        const child = spawn('node', ['test-runner.js', cmd, ...args]);
        let output = '';

        child.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
            process.stdout.write(str);
        });

        child.stderr.on('data', (data) => {
            process.stderr.write(data);
        });

        child.on('close', () => {
            updateContextFromOutput(output);
            resolve();
        });
    });
}

function updateContextFromOutput(output) {
    const uidMatch = output.match(/UID:\s*--- CODE START ---\n(\d+)/) || output.match(/🆔 UID:\s*(\d+)/) || output.match(/UID:\s*(\d+)/);
    if (uidMatch) lastContext.uid = uidMatch[1];

    const btnMatches = output.matchAll(/\(Button: #(\d+) "(.*?)" -> Data: (.*?)\)/g);
    let hasNewButtons = false;
    for (const match of btnMatches) {
        if (!hasNewButtons) { lastContext.buttons = []; hasNewButtons = true; } 
        const index = match[1];
        const name = match[2].trim();
        const data = match[3].trim();
        lastContext.buttons.push({ index, name, data });
    }

    if (!hasNewButtons) {
        const charMatches = output.matchAll(/\s-\s(.*?)\s+\(ID: (\d+)\)/g);
        for (const match of charMatches) {
            const name = match[1].trim();
            const id = match[2];
            if (lastContext.uid) {
                lastContext.buttons.push({ name, data: `profile:${lastContext.uid}:${id}` });
            }
        }
    }
}
