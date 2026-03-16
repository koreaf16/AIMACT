const oracledb = require('oracledb');
import dotenv from 'dotenv';
import path from 'path';
import { SemanticChunker, Chunk } from './sync/Chunker';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbConfig = {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING
};

// Initialize oracledb configuration globally
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;
oracledb.fetchAsString = [ oracledb.CLOB ];

let pool: any = null;

/**
 * Helper to safely parse JSON strings from DB
 */
function safeJsonParse(val: any) {
    if (!val) return {};
    if (typeof val === 'object') return val;
    if (typeof val !== 'string') return {};
    const trimmed = val.trim();
    if (trimmed === "[object Object]" || !trimmed.startsWith('{')) return {};
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        return {};
    }
}

export const db = {
    async getPool() {
        if (!pool) {
            pool = await oracledb.createPool(dbConfig);
        }
        return pool;
    },

    async query(sql: string, params: any = []): Promise<any[]> {
        const p = await this.getPool();
        const conn = await p.getConnection();
        try {
            const result = await conn.execute(sql, params);
            return result.rows || [];
        } finally {
            await conn.close();
        }
    },

    async execute(sql: string, params: any = {}): Promise<any> {
        const p = await this.getPool();
        const conn = await p.getConnection();
        try {
            const result = await conn.execute(sql, params);
            return result;
        } finally {
            await conn.close();
        }
    },

    async vectorSearch(workspace: string, query: string) {
        // 1. 질문을 벡터로 변환
        const queryVector = await this.getEmbedding(query);

        // 2. Oracle 23ai 벡터 유사도 검색 (COSINE 거리 기준)
        const sql = `
            SELECT 
                DOC_ID as "path",
                MODULE_NAME as "title",
                CONTENT as "content",
                CHUNK_TYPE as "type",
                VECTOR_DISTANCE(CONTENT_VECTOR, :vec, COSINE) as "similarity"
            FROM KNOWLEDGE_BASE
            WHERE WORKSPACE_PATH = :workspace AND IS_LATEST = 'Y'
            ORDER BY "similarity" ASC
            FETCH FIRST 10 ROWS ONLY
        `;
        
        console.log(`[DB] 🔍 Executing Vector Search for: "${query}"`);

        const rows = await this.query(sql, { vec: queryVector, workspace });
        return rows;
    },

    async saveConversation(workspace: string, role: string, prompt: string, response: string) {
        const docId = `chat_history_${Date.now()}`;
        const moduleName = `${role} Conversation`;
        const content = `User: ${prompt}\n\nAI (${role}): ${response}`;
        
        try {
            const vector = await this.getEmbedding(content);
            const sql = `
                INSERT INTO KNOWLEDGE_BASE (DOC_ID, MODULE_NAME, VERSION, CONTENT, CONTENT_VECTOR, CHUNK_TYPE, WORKSPACE_PATH, IS_LATEST)
                VALUES (:doc_id, :module, 1, :content, :vec, 'conversation', :workspace, 'Y')
            `;
            await this.execute(sql, {
                doc_id: { val: docId, dir: oracledb.BIND_IN, type: oracledb.STRING },
                module: { val: moduleName, dir: oracledb.BIND_IN, type: oracledb.STRING },
                content: { val: content, dir: oracledb.BIND_IN, type: oracledb.DB_TYPE_CLOB },
                vec: { val: vector, dir: oracledb.BIND_IN, type: oracledb.DB_TYPE_VECTOR },
                workspace: { val: workspace, dir: oracledb.BIND_IN, type: oracledb.STRING }
            });
            console.log(`[DB] 💾 Conversation saved for vector search (Role: ${role})`);
        } catch (err: any) {
            console.error(`[DB] Failed to save conversation: ${err.message}`);
        }
    },

    /**
     * 특정 워크스페이스에 이미 동기화된 파일 목록과 마지막 수정 시간을 가져옵니다.
     */
    async getSyncedFiles(workspace: string): Promise<Map<string, Date>> {
        const rows = await this.query(
            "SELECT DOC_ID, MAX(CREATED_AT) as \"last_sync\" FROM KNOWLEDGE_BASE WHERE WORKSPACE_PATH = :workspace AND IS_LATEST = 'Y' GROUP BY DOC_ID", 
            [workspace]
        );
        const syncMap = new Map();
        rows.forEach((r: any) => {
            syncMap.set(r.DOC_ID.replace(/\\/g, '/'), new Date(r.last_sync));
        });
        return syncMap;
    },

    async getEmbedding(text: string): Promise<Float32Array> {
        try {
            const response = await fetch(`${process.env.LLM_EMBEDDING_URL}/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: text.substring(0, 8000),
                    model: process.env.LLM_EMBEDDING_MODEL
                })
            });
            const data: any = await response.json();
            return new Float32Array(data.data[0].embedding);
        } catch (err: any) {
            console.error(`[DB] Embedding API failed: ${err.message}`);
            return new Float32Array(1024).fill(0);
        }
    },

    /**
     * 파일 내용을 모듈 단위로 분석하여 버전을 관리하며 저장합니다.
     */
    async upsertKnowledge(workspace: string, filePath: string, content: string) {
        console.log(`[DB] 🆙 Versioning file: ${filePath}...`);
        
        // 1. 현재 해당 파일의 최신 버전 번호 가져오기
        const versionRow = await this.query(
            "SELECT MAX(VERSION) as \"ver\" FROM KNOWLEDGE_BASE WHERE DOC_ID = :doc_id AND WORKSPACE_PATH = :ws",
            { doc_id: filePath, ws: workspace }
        );
        const currentVersion = versionRow[0]?.ver || 0;
        const nextVersion = currentVersion + 1;

        // 2. 기존 'Y' 상태인 행들을 'N'으로 변경
        await this.execute(
            "UPDATE KNOWLEDGE_BASE SET IS_LATEST = 'N' WHERE DOC_ID = :doc_id AND WORKSPACE_PATH = :ws AND IS_LATEST = 'Y'",
            { doc_id: filePath, ws: workspace }
        );

        // 3. 세만틱 청킹 수행
        const chunks: Chunk[] = SemanticChunker.chunk(filePath, content);
        
        for (const chunk of chunks) {
            try {
                const vector = await this.getEmbedding(chunk.content);
                const sql = `
                    INSERT INTO KNOWLEDGE_BASE (DOC_ID, MODULE_NAME, VERSION, CONTENT, CONTENT_VECTOR, CHUNK_TYPE, WORKSPACE_PATH, IS_LATEST)
                    VALUES (:doc_id, :module, :ver, :content, :vec, :type, :workspace, 'Y')
                `;
                await this.execute(sql, {
                    doc_id: { val: filePath, dir: oracledb.BIND_IN, type: oracledb.STRING },
                    module: { val: chunk.moduleName, dir: oracledb.BIND_IN, type: oracledb.STRING },
                    ver: { val: nextVersion, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
                    content: { val: chunk.content, dir: oracledb.BIND_IN, type: oracledb.DB_TYPE_CLOB },
                    vec: { val: vector, dir: oracledb.BIND_IN, type: oracledb.DB_TYPE_VECTOR },
                    type: { val: chunk.type, dir: oracledb.BIND_IN, type: oracledb.STRING },
                    workspace: { val: workspace, dir: oracledb.BIND_IN, type: oracledb.STRING }
                });
            } catch (err: any) {
                console.error(`[DB] Sync error for ${chunk.moduleName}: ${err.message}`);
            }
        }
        console.log(`[DB] ✅ Version ${nextVersion} created for: ${filePath}`);
    },

    async deleteKnowledge(workspace: string, filePath: string) {
        const sql = `DELETE FROM KNOWLEDGE_BASE WHERE DOC_ID = :doc_id AND WORKSPACE_PATH = :workspace`;
        await this.execute(sql, { doc_id: filePath, workspace: workspace });
    },

    async getWorkspaceConfig(workspace: string) {
        const rows = await this.query("SELECT * FROM WORKSPACE_CONFIG WHERE WORKSPACE_PATH = :path", [workspace]);
        if (rows.length > 0) return rows[0];
        return {
            WATCH_PATTERNS: '**/*.{ts,tsx,js,jsx,json,sql,md}',
            IGNORE_PATTERNS: 'node_modules/**,dist/**,.git/**'
        };
    },

    async saveWorkspace(ws: any) {
        console.log(`[DB] 💾 Saving workspace config for: ${ws.path}`);
        const sql = `
            MERGE INTO WORKSPACE_CONFIG t
            USING (SELECT :path as WORKSPACE_PATH FROM DUAL) s
            ON (t.WORKSPACE_PATH = s.WORKSPACE_PATH)
            WHEN MATCHED THEN
                UPDATE SET PROJECT_NAME = :name, DESCRIPTION = :description, 
                           WATCH_PATTERNS = :watch, IGNORE_PATTERNS = :ignore
            WHEN NOT MATCHED THEN
                INSERT (WORKSPACE_PATH, PROJECT_NAME, DESCRIPTION, WATCH_PATTERNS, IGNORE_PATTERNS)
                VALUES (:path, :name, :description, :watch, :ignore)
        `;
        try {
            await this.execute(sql, {
                path: ws.path,
                name: ws.name,
                description: ws.description || '',
                watch: ws.watchPatterns || '**/*.{ts,tsx,js,jsx,json,sql,md}',
                ignore: ws.ignorePatterns || 'node_modules/**,dist/**,.git/**'
            });
            console.log(`[DB] ✅ Workspace config saved.`);
        } catch (err: any) {
            console.error(`[DB] ❌ Failed to save workspace: ${err.message}`);
            throw err;
        }
    },

    async getModels() {
        const rows = await this.query("SELECT * FROM AI_MODELS ORDER BY CREATED_AT ASC");
        return rows.map((r: any) => ({
            id: r.MODEL_ID,
            name: r.NAME,
            model: r.MODEL_NAME,
            command: r.CLI_COMMAND,
            contextStrategy: r.CONTEXT_STRATEGY,
            systemPrompt: r.SYSTEM_PROMPT,
            customEnv: safeJsonParse(r.CUSTOM_ENV)
        }));
    },

    async saveModel(model: any) {
        const sql = `
            MERGE INTO AI_MODELS t
            USING (SELECT :id as MODEL_ID FROM DUAL) s
            ON (t.MODEL_ID = s.MODEL_ID)
            WHEN MATCHED THEN
                UPDATE SET NAME = :name, MODEL_NAME = :model, CLI_COMMAND = :cmd, 
                           CONTEXT_STRATEGY = :strat, SYSTEM_PROMPT = :prompt, 
                           CUSTOM_ENV = :env, UPDATED_AT = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (MODEL_ID, NAME, MODEL_NAME, CLI_COMMAND, CONTEXT_STRATEGY, SYSTEM_PROMPT, CUSTOM_ENV)
                VALUES (:id, :name, :model, :cmd, :strat, :prompt, :env)
        `;
        await this.execute(sql, {
            id: model.id,
            name: model.name,
            model: model.model,
            cmd: model.command,
            strat: model.contextStrategy,
            prompt: model.systemPrompt,
            env: JSON.stringify(model.customEnv || {})
        });
    },

    async deleteModel(id: string) {
        await this.execute("DELETE FROM AI_MODELS WHERE MODEL_ID = :id", [id]);
        await this.execute("UPDATE AI_ROLE_ASSIGNMENTS SET MODEL_ID = NULL WHERE MODEL_ID = :id", [id]);
    },

    async getRoleAssignments() {
        const rows = await this.query("SELECT * FROM AI_ROLE_ASSIGNMENTS");
        const assignments: any = { Architect: null, Coder: null, Debugger: null, Bulk: null };
        rows.forEach((r: any) => {
            assignments[r.ROLE_NAME] = r.MODEL_ID;
        });
        return assignments;
    },

    // ========================
    // Chat Session / Message CRUD
    // ========================

    async createSession(workspace: string, title?: string, role?: string): Promise<string> {
        const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const sql = `
            INSERT INTO CHAT_SESSIONS (SESSION_ID, WORKSPACE_PATH, TITLE, LAST_ROLE)
            VALUES (:id, :workspace, :title, :role)
        `;
        await this.execute(sql, {
            id: sessionId,
            workspace,
            title: title || '새 대화',
            role: role || 'Architect'
        });
        return sessionId;
    },

    async getSessions(workspace: string) {
        const rows = await this.query(
            `SELECT SESSION_ID as "id", WORKSPACE_PATH as "workspacePath", TITLE as "title",
                    LAST_ROLE as "lastRole", IS_PINNED as "isPinned",
                    TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as "createdAt",
                    TO_CHAR(UPDATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as "updatedAt"
             FROM CHAT_SESSIONS
             WHERE WORKSPACE_PATH = :workspace
             ORDER BY IS_PINNED DESC, UPDATED_AT DESC`,
            { workspace }
        );
        return rows.map((r: any) => ({ ...r, isPinned: r.isPinned === 'Y' }));
    },

    async updateSession(sessionId: string, updates: { title?: string, isPinned?: boolean, lastRole?: string }) {
        const setClauses: string[] = ['UPDATED_AT = CURRENT_TIMESTAMP'];
        const params: any = { id: sessionId };

        if (updates.title !== undefined) {
            setClauses.push('TITLE = :title');
            params.title = updates.title;
        }
        if (updates.isPinned !== undefined) {
            setClauses.push('IS_PINNED = :pinned');
            params.pinned = updates.isPinned ? 'Y' : 'N';
        }
        if (updates.lastRole !== undefined) {
            setClauses.push('LAST_ROLE = :role');
            params.role = updates.lastRole;
        }

        const sql = `UPDATE CHAT_SESSIONS SET ${setClauses.join(', ')} WHERE SESSION_ID = :id`;
        await this.execute(sql, params);
    },

    async deleteSession(sessionId: string) {
        await this.execute("DELETE FROM CHAT_SESSIONS WHERE SESSION_ID = :id", { id: sessionId });
    },

    async getMessages(sessionId: string) {
        return await this.query(
            `SELECT MESSAGE_ID as "id", SESSION_ID as "sessionId", ROLE as "role",
                    AGENT_ROLE as "agentRole", CONTENT as "content",
                    TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as "createdAt"
             FROM CHAT_MESSAGES
             WHERE SESSION_ID = :sessionId
             ORDER BY CREATED_AT ASC`,
            { sessionId }
        );
    },

    async getRecentMessages(sessionId: string, limit: number = 3) {
        return await this.query(
            `SELECT * FROM (
                SELECT ROLE as "role", CONTENT as "content", AGENT_ROLE as "agentRole"
                FROM CHAT_MESSAGES
                WHERE SESSION_ID = :sessionId
                ORDER BY CREATED_AT DESC
             ) WHERE ROWNUM <= :limit`,
            { sessionId, limit }
        );
    },

    async saveMessage(sessionId: string, role: string, content: string, agentRole?: string): Promise<string> {
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const sql = `
            INSERT INTO CHAT_MESSAGES (MESSAGE_ID, SESSION_ID, ROLE, AGENT_ROLE, CONTENT)
            VALUES (:id, :sessionId, :role, :agentRole, :content)
        `;
        await this.execute(sql, {
            id: messageId,
            sessionId,
            role,
            agentRole: agentRole || null,
            content: { val: content, dir: oracledb.BIND_IN, type: oracledb.DB_TYPE_CLOB }
        });
        // Update session timestamp
        await this.execute(
            "UPDATE CHAT_SESSIONS SET UPDATED_AT = CURRENT_TIMESTAMP WHERE SESSION_ID = :id",
            { id: sessionId }
        );
        return messageId;
    },

    async assignRole(role: string, modelId: string) {
        const sql = `
            MERGE INTO AI_ROLE_ASSIGNMENTS t
            USING (SELECT :role as ROLE_NAME FROM DUAL) s
            ON (t.ROLE_NAME = s.ROLE_NAME)
            WHEN MATCHED THEN
                UPDATE SET MODEL_ID = :id, UPDATED_AT = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (ROLE_NAME, MODEL_ID) VALUES (:role, :id)
        `;
        await this.execute(sql, { role, id: modelId });
    }
};
