import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';

export class FileWatcher {
    workspace: string;
    db: any;
    debounceMap: Map<string, NodeJS.Timeout>;
    watcher: any = null;
    syncedFiles: Map<string, Date> = new Map();
    isReady: boolean = false;

    constructor(workspacePath: string, db: any) {
        this.workspace = workspacePath;
        this.db = db;
        this.debounceMap = new Map();
    }

    async start() {
        console.log(`[FileWatcher] 🏁 Starting for workspace: ${this.workspace}`);
        const config = await this.db.getWorkspaceConfig(this.workspace);
        
        // 0. DB에서 동기화 시간 정보 가져오기 (Map<Path, LastSyncDate>)
        this.syncedFiles = await this.db.getSyncedFiles(this.workspace);
        console.log(`[FileWatcher] 🔍 ${this.syncedFiles.size} files already indexed in DB.`);

        // 1. 무시 패턴 설정
        let ignorePatterns: string[] = (config.IGNORE_PATTERNS || '').split(',').map((p: string) => p.trim()).filter((p: string) => p);
        const gitignorePath = path.join(this.workspace, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const gitignoreLines = fs.readFileSync(gitignorePath, 'utf-8')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#')); 
            ignorePatterns = [...ignorePatterns, ...gitignoreLines];
        }
        
        ignorePatterns = [...new Set([
            ...ignorePatterns, 
            '**/node_modules/**', 
            '**/.git/**', 
            '**/dist/**', 
            '**/build/**', 
            '**/.next/**', 
            'package-lock.json',
            '**/.DS_Store'
        ])];
        
        console.log(`[FileWatcher] 🚫 Ignoring ${ignorePatterns.length} patterns.`);

        // 2. 파일 확장자 필터
        const allowedExts = ['.ts', '.tsx', '.js', '.jsx', '.sql', '.md'];

        // 감시 대상 설정
        this.watcher = chokidar.watch('.', {
            cwd: this.workspace,
            ignored: ignorePatterns,
            persistent: true,
            ignoreInitial: false,
            usePolling: true,
            interval: 1000,
            depth: 10
        });

        this.watcher
            .on('add', (p: string) => {
                const ext = path.extname(p).toLowerCase();
                if (allowedExts.includes(ext)) {
                    this.handleChange(p.replace(/\\/g, '/'), 'add');
                }
            })
            .on('change', (p: string) => {
                const ext = path.extname(p).toLowerCase();
                if (allowedExts.includes(ext)) {
                    this.handleChange(p.replace(/\\/g, '/'), 'change');
                }
            })
            .on('unlink', (p: string) => this.handleDelete(p.replace(/\\/g, '/')))
            .on('ready', () => {
                this.isReady = true;
                console.log(`[FileWatcher] 🚀 Initial scan complete. Live monitoring active.`);
            })
            .on('error', (error: any) => console.error(`[FileWatcher] ❌ Watcher error: ${error}`));
    }

    handleChange(filePath: string, eventType: 'add' | 'change') {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const fullPath = path.join(this.workspace, filePath);
        
        // [방어 코드] 무시 패턴 필터링
        if (normalizedPath.includes('node_modules/') || 
            normalizedPath.includes('.git/') || 
            normalizedPath.includes('.next/') ||
            normalizedPath.includes('package-lock.json')) {
            return;
        }

        // 스마트 초기 스캔 로직 (add 이벤트인 경우)
        if (!this.isReady && eventType === 'add') {
            const lastSync = this.syncedFiles.get(normalizedPath);
            if (lastSync && fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                // 로컬 파일의 수정 시간이 DB 저장 시간보다 이전이면 스킵 (밀리초 단위 비교)
                if (stats.mtime.getTime() <= lastSync.getTime()) {
                    return;
                }
                console.log(`[FileWatcher] 🔄 Local file is newer: ${normalizedPath}. (Last Sync: ${lastSync.toISOString()}, Local: ${stats.mtime.toISOString()})`);
            } else if (!lastSync) {
                console.log(`[FileWatcher] ✨ [Initial Sync] New file found: ${normalizedPath}`);
            }
        } else if (this.isReady) {
            console.log(`[FileWatcher] 📝 [Live Change] File ${eventType}: ${normalizedPath}`);
        }

        if (this.debounceMap.has(normalizedPath)) {
            clearTimeout(this.debounceMap.get(normalizedPath)!);
        }
        this.debounceMap.set(normalizedPath, setTimeout(async () => {
            await this.syncFile(normalizedPath);
            this.debounceMap.delete(normalizedPath);
        }, 500));
    }

    handleDelete(filePath: string) {
        const normalizedPath = filePath.replace(/\\/g, '/');
        console.log(`[FileWatcher] 🗑️ File deleted: ${normalizedPath}. Removing from DB...`);
        this.db.deleteKnowledge(this.workspace, normalizedPath)
            .catch((err: any) => console.error(`[FileWatcher] ❌ Failed to delete ${normalizedPath}: ${err.message}`));
    }

    async syncFile(filePath: string) {
        const fullPath = path.join(this.workspace, filePath);
        if (fs.existsSync(fullPath)) {
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                console.log(`[FileWatcher] ⏳ Syncing content: ${filePath}`);
                await this.db.upsertKnowledge(this.workspace, filePath, content);
                console.log(`[FileWatcher] ✅ Successfully synced ${filePath} to DB.`);
            } catch (err: any) {
                console.error(`[FileWatcher] ❌ Failed to sync ${filePath}: ${err.message}`);
            }
        }
    }
}
