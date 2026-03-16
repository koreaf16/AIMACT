import express from 'express';
import cors from 'cors';
import { db } from './db';
import { Orchestrator } from './orchestrator/Orchestrator';
import { FileWatcher } from './sync/FileWatcher';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const orchestrator = new Orchestrator();

/**
 * 모든 워크스페이스에 대해 파일 감시자를 시작합니다.
 */
async function initFileWatchers() {
    try {
        const workspaces = await db.query("SELECT WORKSPACE_PATH as \"path\" FROM WORKSPACE_CONFIG");
        console.log(`[System] Initializing FileWatchers for ${workspaces.length} workspaces...`);
        
        for (const ws of workspaces) {
            const watcher = new FileWatcher(ws.path, db);
            await watcher.start();
        }
    } catch (err: any) {
        console.error(`[System] Failed to initialize FileWatchers: ${err.message}`);
    }
}

// 워크스페이스 목록
app.get('/api/workspaces', async (req, res) => {
    const rows = await db.query("SELECT WORKSPACE_PATH as \"path\", PROJECT_NAME as \"name\", DESCRIPTION as \"description\" FROM WORKSPACE_CONFIG");
    res.json(rows);
});

app.post('/api/workspaces', async (req, res) => {
    try {
        console.log(`[System] 🆕 Registering new workspace: ${req.body.name} (${req.body.path})`);
        await db.saveWorkspace(req.body);
        
        // 새로운 워크스페이스에 대한 파일 감시자 시작
        try {
            const watcher = new FileWatcher(req.body.path, db);
            await watcher.start();
        } catch (watcherErr: any) {
            console.error(`[System] ⚠️ FileWatcher failed to start: ${watcherErr.message}`);
            // Watcher 시작 실패는 경고로만 처리하고 설정 저장은 성공으로 간주할 수 있음
        }
        
        res.status(201).json({ success: true });
    } catch (err: any) {
        console.error(`[System] ❌ Workspace creation failed: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/workspaces/:path', async (req, res) => {
    try {
        const path = decodeURIComponent(req.params.path);
        await db.execute("DELETE FROM WORKSPACE_CONFIG WHERE WORKSPACE_PATH = :path", [path]);
        res.status(204).send();
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// 지식 검색 (벡터 유사도 기반)
app.get('/api/knowledge/search', async (req, res) => {
    const query = req.query.q as string;
    const workspace = (req.query.workspace as string) || 'C:\\AIMACT';
    
    if (!query) return res.json([]);

    try {
        const results = await db.vectorSearch(workspace, query);
        res.json(results);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// 지식 베이스 목록 (기존 유지하되 검색과 분리)
app.get('/api/knowledge', async (req, res) => {
    const workspace = req.query.workspace as string;
    try {
        let sql = `
            SELECT 
                DOC_ID || '#' || MODULE_NAME || '#' || ROWNUM as "id", 
                DOC_ID as "path",
                MODULE_NAME as "title", 
                CONTENT as "content", 
                WORKSPACE_PATH as "workspace", 
                TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') as "timestamp"
            FROM KNOWLEDGE_BASE 
            WHERE IS_LATEST = 'Y'
        `;
        const params: any = {};
        if (workspace) {
            sql += ` AND WORKSPACE_PATH = :workspace`;
            params.workspace = workspace;
        }
        sql += ` ORDER BY CREATED_AT DESC`;
        
        const rows = await db.query(sql, params);
        res.json(rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/knowledge/:id', async (req, res) => {
    await db.execute("DELETE FROM KNOWLEDGE_BASE WHERE DOC_ID = :id", [req.params.id]);
    res.status(204).send();
});

// AI 모델 CRUD (DB 연동)
app.get('/api/models', async (req, res) => {
    const models = await db.getModels();
    res.json(models);
});

app.post('/api/models', async (req, res) => {
    await db.saveModel(req.body);
    res.status(201).json(req.body);
});

app.put('/api/models/:id', async (req, res) => {
    await db.saveModel(req.body);
    res.json(req.body);
});

app.delete('/api/models/:id', async (req, res) => {
    await db.deleteModel(req.params.id);
    res.status(204).send();
});

// 역할 배정 (DB 연동)
app.get('/api/roles', async (req, res) => {
    const roles = await db.getRoleAssignments();
    res.json(roles);
});

app.post('/api/roles/assign', async (req, res) => {
    const { role, modelId } = req.body;
    await db.assignRole(role, modelId);
    res.json({ success: true });
});

// ========================
// Chat Sessions API
// ========================

app.get('/api/sessions', async (req, res) => {
    const workspace = req.query.workspace as string;
    if (!workspace) return res.status(400).json({ error: 'workspace required' });
    const sessions = await db.getSessions(workspace);
    res.json(sessions);
});

app.post('/api/sessions', async (req, res) => {
    try {
        const { workspace, title, role } = req.body;
        if (!workspace) return res.status(400).json({ error: 'workspace required' });
        const sessionId = await db.createSession(workspace, title, role);
        res.status(201).json({ id: sessionId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/sessions/:id', async (req, res) => {
    try {
        await db.updateSession(req.params.id, req.body);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sessions/:id', async (req, res) => {
    try {
        await db.deleteSession(req.params.id);
        res.status(204).send();
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sessions/:id/messages', async (req, res) => {
    try {
        const messages = await db.getMessages(req.params.id);
        res.json(messages);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// 작업 실행
app.post('/api/tasks', (req, res) => {
    res.json({ success: true, approvalId: `task-${Date.now()}` });
});

// SSE 스트림 (DB 설정 기반 실행)
app.get('/api/tasks/:id/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const promptText = (req.query.prompt as string) || '';
    const agentRole = (req.query.role as string) || 'Architect';
    const workspace = (req.query.workspace as string) || 'C:\\AIMACT';
    const sessionId = (req.query.sessionId as string) || '';

    // History: session 기반이면 DB에서 로드, 아니면 쿼리 파라미터에서 파싱 (하위호환)
    let history: any[] = [];
    try {
        if (sessionId) {
            const recentMsgs = await db.getRecentMessages(sessionId, 3);
            history = recentMsgs.reverse().map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
        } else if (req.query.history) {
            history = JSON.parse(req.query.history as string);
        }
    } catch (e) {
        console.error("Failed to load history:", e);
    }

    try {
        // 1. DB에서 현재 역할에 배정된 모델 정보 조회
        const roleAssignments = await db.getRoleAssignments();
        const modelId = roleAssignments[agentRole];

        const allModels = await db.getModels();
        const modelConfig = allModels.find(m => m.id === modelId);

        if (!modelConfig || !modelConfig.command) {
            res.write(`data: ${JSON.stringify({ event: 'chat_message', content: `에러: ${agentRole} 역할에 배정된 모델이 DB에 없습니다.`, role: 'system' })}\n\n`);
            res.end();
            return;
        }

        // Stream Monitor: 메타데이터 전송
        res.write(`data: ${JSON.stringify({
            event: 'stream_meta',
            agent: agentRole,
            command: modelConfig.command,
            model: modelConfig.name,
            workspace,
            env: modelConfig.customEnv || {}
        })}\n\n`);

        res.write(`data: ${JSON.stringify({ event: 'agent_start', agent: agentRole })}\n\n`);

        // Session에 user 메시지 저장
        if (sessionId && promptText) {
            await db.saveMessage(sessionId, 'user', promptText);
        }

        let fullResponse = '';

        // 2. Orchestrator를 통해 실제 작업 수행
        await orchestrator.executeTask(
            workspace,
            promptText,
            agentRole,
            history,
            {
                command: modelConfig.command,
                systemPrompt: modelConfig.systemPrompt,
                customEnv: modelConfig.customEnv
            },
            (token) => {
                fullResponse += token;
                res.write(`data: ${JSON.stringify({ event: 'chat_token', content: token, role: 'assistant' })}\n\n`);
                res.write(`data: ${JSON.stringify({ event: 'raw_token', content: token, agent: agentRole })}\n\n`);
            },
            (err) => {
                res.write(`data: ${JSON.stringify({ event: 'chat_message', content: `Error: ${err}`, role: 'system' })}\n\n`);
            },
            (log) => {
                res.write(`data: ${JSON.stringify({ event: 'stream_log', content: log, agent: agentRole })}\n\n`);
            },
            // context injection callback
            (vectorContext: string, historyContext: string) => {
                res.write(`data: ${JSON.stringify({
                    event: 'context_injected',
                    vectorContext,
                    historyContext,
                    agent: agentRole
                })}\n\n`);
            }
        );

        // 3. Session에 assistant 응답 저장
        if (sessionId && fullResponse.trim()) {
            await db.saveMessage(sessionId, 'assistant', fullResponse, agentRole);
            // 첫 메시지면 제목 자동 생성 (프롬프트 앞 50자)
            await db.updateSession(sessionId, {
                lastRole: agentRole,
                title: promptText.substring(0, 50) + (promptText.length > 50 ? '...' : '')
            });
        }

        // 4. KNOWLEDGE_BASE에도 저장 (벡터 RAG용, 하위호환)
        if (fullResponse.trim()) {
            await db.saveConversation(workspace, agentRole, promptText, fullResponse);
        }

        res.write(`data: ${JSON.stringify({ event: 'agent_complete', agent: agentRole })}\n\n`);
        if (agentRole === 'Architect') {
            res.write(`data: ${JSON.stringify({ event: 'approval_needed', approvalId: req.params.id, summary: '설계안 검토 요망' })}\n\n`);
        }
    } catch (err: any) {
        res.write(`data: ${JSON.stringify({ event: 'chat_message', content: `Critical Error: ${err.message}`, role: 'system' })}\n\n`);
    } finally {
        res.end();
    }
});

// 설계 확정
app.post('/api/approve', async (req, res) => {
    res.json({ success: true, message: '지식 자산화 성공' });
});

// 404 Logger
app.use((req, res, next) => {
    console.warn(`[404] ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Not Found', path: req.url });
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
    console.error(`[Error] ${err.message}`);
    res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, async () => {
    console.log(`AI-MACT (Database-Driven) running on port ${PORT}`);
    await initFileWatchers();
});
