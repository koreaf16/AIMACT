# AI-MACT (AI Multi-Agent Control Tower) 상세 설계안

## 1. 설계 원칙

본 시스템은 세 가지 핵심 원칙 위에 설계됩니다.

- **지식 자산화**: 모든 코드와 설계 결정은 Oracle 26ai에 벡터 데이터로 영구 보존되어 조직의 지적 자산이 됩니다.
- **Human-in-the-Loop**: AI는 제안하고, 인간이 승인합니다. 자동화와 통제의 균형을 유지합니다.
- **비용 최적화**: 구독(Login) 기반 에이전트를 우선 사용하고, 단순 작업은 로컬 모델(RTX 3090)로 처리합니다.

---

## 2. 시스템 아키텍처

### 2.1 계층 구조

```
┌──────────────────────────────────────────┐
│         Presentation Layer               │
│    Next.js 16 + React + Tailwind CSS     │
├──────────────────────────────────────────┤
│         Application Layer                │
│    Node.js (Express) + SSE Streaming     │
├──────────────────────────────────────────┤
│         Agent Orchestration Layer        │
│  Architect │ Coder │ Debugger │ Bulk     │
├──────────────────────────────────────────┤
│         Data / Intelligence Layer        │
│    Oracle 26ai (Vector Search + SCD2)    │
├──────────────────────────────────────────┤
│         Infrastructure Layer             │
│  Chokidar Watcher │ Tree-sitter Parser   │
└──────────────────────────────────────────┘
```

### 2.2 핵심 모듈 구성

| 모듈 | 책임 | 기술 |
|------|------|------|
| `orchestrator/` | 에이전트 라우팅, 작업 분배, 결과 수집 | Node.js, EventEmitter |
| `agents/` | CLI 기반 에이전트 실행 및 스트림 처리 | child_process, SSE |
| `knowledge/` | 벡터 검색, 청킹, 임베딩 관리 | node-oracledb, Oracle 26ai |
| `sync/` | 파일 변경 감지 → 자동 벡터 동기화 | Chokidar, tree-sitter |
| `approval/` | 승인 큐 관리, 상태 전이 | Express REST API |
| `web/` | 대시보드, 워크스페이스 관리 UI | Next.js 16 |

---

## 3. 에이전트 상세 설계

### 3.1 에이전트 구성 테이블 (AI_AGENTS_CONFIG)

```sql
CREATE TABLE AI_AGENTS_CONFIG (
    AGENT_ID     VARCHAR2(50)   PRIMARY KEY,
    AGENT_ROLE   VARCHAR2(50)   NOT NULL,      -- Architect/Coder/Debugger/Bulk
    MODEL_NAME   VARCHAR2(100)  NOT NULL,      -- claude-4.6-opus, gemini-3.1-pro 등
    CLI_COMMAND  VARCHAR2(500)  NOT NULL,      -- 실행 명령어 (claude, gemini 등)
    AUTH_TYPE    VARCHAR2(20)   DEFAULT 'LOGIN', -- LOGIN / LOCAL / API_KEY
    IS_ACTIVE    CHAR(1)        DEFAULT 'Y',
    PRIORITY     NUMBER         DEFAULT 1,      -- 동일 역할 내 우선순위
    MAX_TOKENS   NUMBER         DEFAULT 8192,
    TEMPERATURE  NUMBER(3,2)    DEFAULT 0.7,
    CREATED_AT   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

-- 초기 데이터
INSERT INTO AI_AGENTS_CONFIG VALUES ('architect-01', 'Architect', 'claude-4.6-opus', 'claude --model opus', 'LOGIN', 'Y', 1, 16384, 0.4, DEFAULT, DEFAULT);
INSERT INTO AI_AGENTS_CONFIG VALUES ('coder-01', 'Coder', 'gemini-3.1-pro', 'gemini --model pro', 'LOGIN', 'Y', 1, 32768, 0.3, DEFAULT, DEFAULT);
INSERT INTO AI_AGENTS_CONFIG VALUES ('debugger-01', 'Debugger', 'codex-3.1', 'codex --model 3.1', 'LOGIN', 'Y', 1, 16384, 0.2, DEFAULT, DEFAULT);
INSERT INTO AI_AGENTS_CONFIG VALUES ('bulk-01', 'Bulk', 'qwen-3.5-27b', 'ollama run qwen3.5:27b', 'LOCAL', 'Y', 1, 8192, 0.5, DEFAULT, DEFAULT);
```

### 3.2 에이전트별 역할 정의

#### Architect (Claude 4.6 Opus)
- **입력**: 사용자 요구사항 + Knowledge Base의 기존 설계 벡터
- **출력**: 설계 문서 (아키텍처, API 스펙, 데이터 모델)
- **프롬프트 전략**: System prompt에 프로젝트 컨벤션 + 관련 코드 청크 주입
- **특수 기능**: 설계안 생성 시 APPROVAL_QUEUE에 자동 등록

#### Coder (Gemini 3.1 Pro)
- **입력**: 승인된 설계안 + 현재 코드베이스 벡터 (1M 컨텍스트 활용)
- **출력**: 구현 코드 파일
- **프롬프트 전략**: 전체 프로젝트 구조를 컨텍스트에 포함하여 일관성 보장
- **특수 기능**: 코드 생성 후 자동으로 Debugger 호출 트리거

#### Debugger (Codex 3.1)
- **입력**: [에러 코드] + [직전 정상 버전] + [설계 의도]
- **출력**: 수정된 코드 + 변경 사유
- **프롬프트 전략**: 3-Way Diff (현재 에러 vs 이전 정상 vs 설계 의도)
- **특수 기능**: Sandbox 실행 환경에서 검증 후 결과 반환

#### Bulk (Qwen 3.5 27B Local)
- **입력**: 단순 반복 작업 목록
- **출력**: 문서화, 로그 분석 결과, 코드 주석
- **프롬프트 전략**: 템플릿 기반, 컨텍스트 최소화
- **비용**: RTX 3090 로컬 실행 (0원)

### 3.3 에이전트 실행 매니저 (AgentRunner)

```javascript
// agents/AgentRunner.js 인터페이스 설계
class AgentRunner {
    constructor(agentConfig, workspacePath) {
        this.config = agentConfig;
        this.cwd = workspacePath;
        this.process = null;
    }

    // CLI 프로세스 생성 및 스트림 연결
    async execute(prompt, contextChunks) {
        const fullPrompt = this.buildPrompt(prompt, contextChunks);
        this.process = spawn(this.config.CLI_COMMAND, {
            cwd: this.cwd,
            env: { ...process.env, MODEL: this.config.MODEL_NAME }
        });
        return this.streamOutput(); // SSE로 프론트엔드에 실시간 전달
    }

    // Knowledge Base에서 관련 청크를 검색하여 프롬프트에 주입
    buildPrompt(userPrompt, contextChunks) {
        return `## Project Context\n${contextChunks.join('\n---\n')}\n\n## Task\n${userPrompt}`;
    }

    // SSE 스트리밍
    streamOutput() { /* ReadableStream → SSE 변환 */ }

    // 강제 종료
    abort() { this.process?.kill('SIGTERM'); }
}
```

### 3.4 컨텍스트 주입 엔진 (ContextBuilder)

에이전트가 작업을 시작할 때, 벡터DB에서 역할에 맞는 컨텍스트를 동적으로 조합하여 프롬프트에 주입합니다. 에이전트마다 필요한 컨텍스트의 **종류, 양, 검색 전략**이 다릅니다.

#### 에이전트별 컨텍스트 레시피

| 에이전트 | 검색 전략 | 토큰 예산 | Top-K | 유사도 임계값 | 주입 대상 |
|----------|-----------|-----------|-------|---------------|-----------|
| Architect | 벡터 유사도 검색 | ~4,000 | 8 | 0.7+ | 기존 설계 문서, API 스펙, DB 스키마, 프로젝트 컨벤션 |
| Coder | Exact Fetch + 벡터 검색 혼합 | ~16,000 | 20 | 0.6+ | **승인된 설계안(exact)**, 관련 모듈, import 그래프, 타입 정의, 파일 트리 |
| Debugger | 버전 기반 조회 (N vs N-1) | ~8,000 | 6 | - | **에러 버전**, **직전 정상 버전**, 설계 의도, 에러 로그 |
| Bulk | 벡터 검색 (시그니처만) | ~2,000 | 5 | 0.8+ | 모듈 헤더/시그니처, JSDoc 템플릿, 네이밍 규칙 |

#### ContextBuilder 구현

```javascript
// knowledge/ContextBuilder.js
class ContextBuilder {
    constructor(db, workspace) {
        this.db = db;
        this.workspace = workspace;
    }

    // 에이전트 역할에 따라 적절한 컨텍스트 레시피 실행
    async build(agentRole, taskInput, options = {}) {
        const recipe = this.getRecipe(agentRole);
        const chunks = [];

        for (const step of recipe.steps) {
            const result = await this.executeStep(step, taskInput, options);
            chunks.push(...result);
        }

        // 토큰 예산 내로 자르기 (우선순위 높은 것부터 유지)
        return this.trimToTokenBudget(chunks, recipe.tokenBudget);
    }

    // 에이전트별 검색 레시피 정의
    getRecipe(agentRole) {
        const recipes = {
            Architect: {
                tokenBudget: 4000,
                steps: [
                    { type: 'vector', chunkTypes: ['DOC', 'CONFIG'], topK: 4, minSimilarity: 0.7, priority: 1 },
                    { type: 'vector', chunkTypes: ['INTERFACE', 'CLASS'], topK: 4, minSimilarity: 0.7, priority: 2 },
                ]
            },
            Coder: {
                tokenBudget: 16000,
                steps: [
                    // 1순위: 승인된 설계안을 정확히(exact) 가져옴 (벡터 검색 아님)
                    { type: 'exact', source: 'approval', priority: 1 },
                    // 2순위: 설계안에서 언급된 모듈들의 현재 코드
                    { type: 'dependency', direction: 'imports', depth: 2, priority: 2 },
                    // 3순위: 벡터 유사도로 관련 모듈 추가 검색
                    { type: 'vector', chunkTypes: ['CLASS', 'FUNCTION', 'INTERFACE'], topK: 12, minSimilarity: 0.6, priority: 3 },
                    // 4순위: 프로젝트 파일 트리 맵 (구조 파악용, 토큰 적음)
                    { type: 'fileTree', priority: 4 },
                ]
            },
            Debugger: {
                tokenBudget: 8000,
                steps: [
                    // 1순위: 현재 에러가 발생한 모듈의 최신 버전 (VERSION=N)
                    { type: 'version', which: 'current', priority: 1 },
                    // 2순위: 같은 모듈의 직전 정상 버전 (VERSION=N-1)
                    { type: 'version', which: 'previous', priority: 2 },
                    // 3순위: 해당 모듈의 설계 의도 문서
                    { type: 'exact', source: 'designIntent', priority: 3 },
                    // 4순위: 에러 스택 트레이스 / 로그
                    { type: 'errorLog', priority: 4 },
                ]
            },
            Bulk: {
                tokenBudget: 2000,
                steps: [
                    // 시그니처만 추출 (본문 제외로 토큰 절약)
                    { type: 'vector', chunkTypes: ['FUNCTION', 'CLASS'], topK: 5, minSimilarity: 0.8, 
                      transform: 'signatureOnly', priority: 1 },
                    { type: 'exact', source: 'template', priority: 2 },
                ]
            }
        };
        return recipes[agentRole];
    }

    // 각 스텝 실행 (검색 전략별 분기)
    async executeStep(step, taskInput, options) {
        switch (step.type) {
            case 'vector':
                return this.vectorSearch(taskInput, step);
            case 'exact':
                return this.exactFetch(step.source, options);
            case 'version':
                return this.versionFetch(step.which, options);
            case 'dependency':
                return this.dependencyWalk(options.targetModules, step);
            case 'fileTree':
                return this.getFileTreeMap();
            case 'errorLog':
                return this.getErrorContext(options.errorInfo);
            default:
                return [];
        }
    }

    // 벡터 유사도 검색 (Oracle 26ai 네이티브)
    async vectorSearch(taskInput, step) {
        const sql = `
            SELECT DOC_ID, MODULE_NAME, CONTENT, CHUNK_TYPE, TOKEN_COUNT,
                   VECTOR_DISTANCE(CONTENT_VECTOR, VECTOR_EMBEDDING(:query USING MODEL 'all-MiniLM-L6-v2'), COSINE) AS similarity
            FROM KNOWLEDGE_BASE
            WHERE WORKSPACE_PATH = :workspace
              AND IS_LATEST = 'Y'
              AND APPROVAL_STATUS = 'APPROVED'
              AND CHUNK_TYPE IN (${step.chunkTypes.map((_, i) => ':ct' + i).join(',')})
              AND VECTOR_DISTANCE(CONTENT_VECTOR, VECTOR_EMBEDDING(:query USING MODEL 'all-MiniLM-L6-v2'), COSINE) >= :minSim
            ORDER BY similarity DESC
            FETCH FIRST :topK ROWS ONLY`;

        const results = await this.db.execute(sql, {
            query: taskInput,
            workspace: this.workspace,
            minSim: step.minSimilarity,
            topK: step.topK,
            ...Object.fromEntries(step.chunkTypes.map((ct, i) => ['ct' + i, ct]))
        });

        return results.rows.map(row => ({
            content: step.transform === 'signatureOnly' 
                ? this.extractSignature(row.CONTENT) 
                : row.CONTENT,
            tokenCount: step.transform === 'signatureOnly'
                ? Math.floor(row.TOKEN_COUNT * 0.2)  // 시그니처는 본문의 ~20%
                : row.TOKEN_COUNT,
            priority: step.priority,
            metadata: { docId: row.DOC_ID, module: row.MODULE_NAME, type: row.CHUNK_TYPE, similarity: row.SIMILARITY }
        }));
    }

    // 정확한 문서 조회 (승인된 설계안, 템플릿 등)
    async exactFetch(source, options) {
        if (source === 'approval') {
            const sql = `SELECT CONTENT FROM APPROVAL_QUEUE WHERE APPROVAL_ID = :id AND STATUS = 'APPROVED'`;
            const result = await this.db.execute(sql, { id: options.approvalId });
            return result.rows.map(r => ({ content: r.CONTENT, tokenCount: this.countTokens(r.CONTENT), priority: 1 }));
        }
        if (source === 'designIntent') {
            const sql = `
                SELECT CONTENT FROM KNOWLEDGE_BASE
                WHERE WORKSPACE_PATH = :workspace AND DOC_ID = :docId 
                  AND CHUNK_TYPE = 'DOC' AND IS_LATEST = 'Y'`;
            const result = await this.db.execute(sql, { workspace: this.workspace, docId: options.targetDocId });
            return result.rows.map(r => ({ content: r.CONTENT, tokenCount: this.countTokens(r.CONTENT), priority: 3 }));
        }
        return [];
    }

    // 버전 기반 조회 (Debugger용 3-Way Diff)
    async versionFetch(which, options) {
        const { targetDocId, targetModule } = options;
        const sql = which === 'current'
            ? `SELECT CONTENT, VERSION FROM KNOWLEDGE_BASE 
               WHERE DOC_ID = :docId AND MODULE_NAME = :module AND WORKSPACE_PATH = :ws AND IS_LATEST = 'Y'`
            : `SELECT CONTENT, VERSION FROM KNOWLEDGE_BASE 
               WHERE DOC_ID = :docId AND MODULE_NAME = :module AND WORKSPACE_PATH = :ws
               AND VERSION = (SELECT MAX(VERSION) - 1 FROM KNOWLEDGE_BASE 
                              WHERE DOC_ID = :docId AND MODULE_NAME = :module AND WORKSPACE_PATH = :ws)`;

        const result = await this.db.execute(sql, { docId: targetDocId, module: targetModule, ws: this.workspace });
        const label = which === 'current' ? '## [CURRENT - ERROR VERSION]' : '## [PREVIOUS - WORKING VERSION]';
        return result.rows.map(r => ({
            content: `${label}\n// Version: ${r.VERSION}\n${r.CONTENT}`,
            tokenCount: this.countTokens(r.CONTENT) + 20,
            priority: which === 'current' ? 1 : 2
        }));
    }

    // import 의존성 그래프 탐색 (Coder용)
    async dependencyWalk(targetModules, step) {
        // targetModules에서 import하는 모듈들을 depth만큼 재귀 탐색
        const visited = new Set();
        const results = [];
        
        for (const mod of targetModules) {
            await this.walkImports(mod, step.depth, visited, results);
        }
        return results;
    }

    // 토큰 예산 내로 트림 (priority 순으로 유지)
    trimToTokenBudget(chunks, budget) {
        chunks.sort((a, b) => a.priority - b.priority);
        let totalTokens = 0;
        const selected = [];
        
        for (const chunk of chunks) {
            if (totalTokens + chunk.tokenCount <= budget) {
                selected.push(chunk);
                totalTokens += chunk.tokenCount;
            }
        }
        return selected;
    }

    // 함수 시그니처만 추출 (Bulk용 토큰 절약)
    extractSignature(content) {
        // tree-sitter AST에서 함수/클래스 선언부만 추출, 본문 제거
        return content
            .replace(/\{[\s\S]*\}$/m, '{ /* ... */ }')
            .split('\n').slice(0, 5).join('\n');
    }
}
```

### 3.5 프롬프트 조립기 (PromptAssembler)

ContextBuilder가 수집한 청크들을 SYSTEM → CONTEXT → USER 순서로 최종 프롬프트를 조립합니다.

```javascript
// knowledge/PromptAssembler.js
class PromptAssembler {
    constructor(agentConfig) {
        this.config = agentConfig;
    }

    // 최종 프롬프트 조립
    assemble(contextChunks, userTask, options = {}) {
        const sections = [];

        // 1. SYSTEM: 에이전트 역할 정의
        sections.push(this.buildSystemSection());

        // 2. CONTEXT: 벡터DB에서 가져온 청크들 (priority 순 배치)
        sections.push(this.buildContextSection(contextChunks));

        // 3. USER: 실제 작업 지시
        sections.push(this.buildUserSection(userTask, options));

        return sections.join('\n\n---\n\n');
    }

    buildSystemSection() {
        const roleDefs = {
            Architect: `You are a senior software architect. Your job is to produce clear, 
                        implementable design documents. Follow the project conventions strictly.
                        Output: architecture decisions, API specs, data models, implementation notes.`,
            Coder:     `You are an expert full-stack developer. Implement code EXACTLY per the 
                        approved design. Do not deviate from the specification. Use existing 
                        patterns found in the project context below.`,
            Debugger:  `You are a debugging specialist. You will receive THREE versions of code:
                        [CURRENT - ERROR], [PREVIOUS - WORKING], and [DESIGN INTENT].
                        Compare the diff between current and previous, align with design intent,
                        and produce the minimal fix. Explain your reasoning.`,
            Bulk:      `You are a documentation assistant. Generate consistent, template-based 
                        outputs. Match the existing naming conventions and documentation style.`
        };
        return `## System\n${roleDefs[this.config.AGENT_ROLE]}`;
    }

    buildContextSection(chunks) {
        if (!chunks.length) return '## Context\n(No relevant context found)';

        const formatted = chunks.map((chunk, i) => {
            const header = chunk.metadata 
                ? `### [${i + 1}] ${chunk.metadata.docId} > ${chunk.metadata.module} (${chunk.metadata.type})`
                : `### [${i + 1}] Reference`;
            return `${header}\n\`\`\`\n${chunk.content}\n\`\`\``;
        });

        return `## Project Context\nThe following ${chunks.length} code/document chunks are from the current workspace.\nUse them to understand the project structure and conventions.\n\n${formatted.join('\n\n')}`;
    }

    buildUserSection(userTask, options) {
        let section = `## Task\n${userTask}`;
        
        // Coder에게는 승인 ID를 명시
        if (options.approvalId) {
            section += `\n\nReference: Approved design [${options.approvalId}] is included in context above.`;
        }
        // Debugger에게는 에러 정보 추가
        if (options.errorInfo) {
            section += `\n\n### Error Details\n\`\`\`\n${options.errorInfo.stackTrace}\n\`\`\``;
        }
        return section;
    }
}
```

### 3.6 통합 실행 흐름 (ContextBuilder → PromptAssembler → AgentRunner)

```javascript
// 실제 에이전트 호출 시 전체 흐름
async function invokeAgent(agentRole, workspace, userTask, options = {}) {
    // 1. DB에서 에이전트 설정 로드
    const agentConfig = await db.getActiveAgent(agentRole);
    
    // 2. ContextBuilder: 역할에 맞는 컨텍스트 수집
    const contextBuilder = new ContextBuilder(db, workspace);
    const contextChunks = await contextBuilder.build(agentRole, userTask, options);
    
    // 3. PromptAssembler: SYSTEM + CONTEXT + USER 조립
    const assembler = new PromptAssembler(agentConfig);
    const fullPrompt = assembler.assemble(contextChunks, userTask, options);
    
    // 4. AgentRunner: CLI 실행 + SSE 스트리밍
    const runner = new AgentRunner(agentConfig, workspace);
    return runner.execute(fullPrompt);
}

// 사용 예시: Debugger 호출
await invokeAgent('Debugger', 'C:\\work\\my-project', 'Fix the authentication error', {
    targetDocId: 'src/auth/login.ts',
    targetModule: 'LoginController',
    errorInfo: { stackTrace: 'TypeError: Cannot read property ...' }
});
```

---

## 4. 데이터베이스 상세 설계 (Oracle 26ai)

### 4.1 KNOWLEDGE_BASE (핵심 지식 저장소)

```sql
CREATE TABLE KNOWLEDGE_BASE (
    DOC_ID          VARCHAR2(500),          -- 파일 경로 (상대 경로)
    MODULE_NAME     VARCHAR2(200),          -- 함수/클래스/인터페이스명
    VERSION         NUMBER,                 -- 리비전 번호 (auto increment)
    CONTENT         CLOB,                   -- 실제 코드/텍스트 원문
    CONTENT_VECTOR  VECTOR(1536, FLOAT32),  -- Oracle 26ai 네이티브 벡터 (차원수 모델에 따라 조정)
    CHUNK_TYPE      VARCHAR2(50),           -- CLASS / FUNCTION / INTERFACE / CONFIG / DOC
    TOKEN_COUNT     NUMBER,                 -- 청크의 토큰 수 (1000~2000 범위 유지)
    MODIFIED_BY     VARCHAR2(50),           -- 수정 주체 (user / architect / coder / debugger / bulk)
    CHANGE_REASON   VARCHAR2(1000),         -- 수정 이유
    WORKSPACE_PATH  VARCHAR2(500),          -- 물리적 프로젝트 경로 (격리용)
    IS_LATEST       CHAR(1) DEFAULT 'Y',    -- 최신 여부 (Y/N)
    APPROVAL_STATUS VARCHAR2(20) DEFAULT 'APPROVED', -- DRAFT / PENDING / APPROVED / REJECTED
    CREATED_AT      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT PK_KB PRIMARY KEY (DOC_ID, MODULE_NAME, VERSION, WORKSPACE_PATH)
);

-- 벡터 검색 인덱스
CREATE VECTOR INDEX IDX_KB_VECTOR ON KNOWLEDGE_BASE (CONTENT_VECTOR)
    ORGANIZATION NEIGHBOR PARTITIONS
    DISTANCE COSINE
    WITH TARGET ACCURACY 95;

-- 최신 버전 빠른 조회용 인덱스
CREATE INDEX IDX_KB_LATEST ON KNOWLEDGE_BASE (WORKSPACE_PATH, IS_LATEST, CHUNK_TYPE);

-- 워크스페이스 격리 필터용 인덱스
CREATE INDEX IDX_KB_WORKSPACE ON KNOWLEDGE_BASE (WORKSPACE_PATH, DOC_ID);
```

### 4.2 APPROVAL_QUEUE (승인 대기열)

```sql
CREATE TABLE APPROVAL_QUEUE (
    APPROVAL_ID     VARCHAR2(100) PRIMARY KEY,  -- UUID
    WORKSPACE_PATH  VARCHAR2(500) NOT NULL,
    AGENT_ID        VARCHAR2(50)  NOT NULL,      -- 제안한 에이전트
    TASK_TYPE       VARCHAR2(50)  NOT NULL,      -- DESIGN / CODE / FIX / REFACTOR
    TITLE           VARCHAR2(500) NOT NULL,
    SUMMARY         CLOB,                        -- AI가 생성한 요약
    CONTENT         CLOB NOT NULL,               -- 전체 제안 내용
    DIFF_CONTENT    CLOB,                        -- 변경 전후 비교 (Unified Diff)
    STATUS          VARCHAR2(20) DEFAULT 'PENDING', -- PENDING / APPROVED / REJECTED / EXPIRED
    REVIEWER_NOTE   VARCHAR2(2000),              -- 사용자의 검토 메모
    CREATED_AT      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    REVIEWED_AT     TIMESTAMP,
    EXPIRES_AT      TIMESTAMP,                   -- 자동 만료 시간 (선택)
    
    CONSTRAINT FK_AQ_AGENT FOREIGN KEY (AGENT_ID) REFERENCES AI_AGENTS_CONFIG(AGENT_ID)
);

CREATE INDEX IDX_AQ_STATUS ON APPROVAL_QUEUE (WORKSPACE_PATH, STATUS, CREATED_AT DESC);
```

### 4.3 AGENT_EXECUTION_LOG (에이전트 실행 이력)

```sql
CREATE TABLE AGENT_EXECUTION_LOG (
    LOG_ID          VARCHAR2(100) PRIMARY KEY,  -- UUID
    AGENT_ID        VARCHAR2(50)  NOT NULL,
    WORKSPACE_PATH  VARCHAR2(500) NOT NULL,
    TASK_DESCRIPTION VARCHAR2(2000),
    PROMPT_TOKENS   NUMBER,                     -- 입력 토큰 수
    OUTPUT_TOKENS   NUMBER,                     -- 출력 토큰 수
    DURATION_MS     NUMBER,                     -- 실행 시간 (밀리초)
    STATUS          VARCHAR2(20),               -- SUCCESS / FAILED / TIMEOUT / ABORTED
    ERROR_MESSAGE   CLOB,
    APPROVAL_ID     VARCHAR2(100),              -- 연관된 승인 건 (있을 경우)
    CREATED_AT      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT FK_EL_AGENT FOREIGN KEY (AGENT_ID) REFERENCES AI_AGENTS_CONFIG(AGENT_ID)
);
```

### 4.4 WORKSPACE_CONFIG (워크스페이스 설정)

```sql
CREATE TABLE WORKSPACE_CONFIG (
    WORKSPACE_PATH  VARCHAR2(500) PRIMARY KEY,
    PROJECT_NAME    VARCHAR2(200) NOT NULL,
    DESCRIPTION     VARCHAR2(1000),
    DEFAULT_BRANCH  VARCHAR2(100) DEFAULT 'main',
    WATCH_PATTERNS  VARCHAR2(1000) DEFAULT '**/*.{ts,tsx,js,jsx,json,sql,md}',
    IGNORE_PATTERNS VARCHAR2(1000) DEFAULT 'node_modules/**,dist/**,.git/**',
    IS_ACTIVE       CHAR(1) DEFAULT 'Y',
    CREATED_AT      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. 핵심 프로세스 설계

### 5.1 시맨틱 청킹 파이프라인

```
파일 변경 감지 (Chokidar)
    │
    ▼
AST 파싱 (tree-sitter)
    │ ── Class, Function, Interface 단위로 분할
    ▼
메타데이터 주입
    │ ── 파일 경로, 모듈명, 버전 헤더 추가
    ▼
토큰 수 검증
    │ ── 1,000~2,000 토큰 범위 확인
    │ ── 초과 시 서브모듈 분할
    ▼
벡터 임베딩 생성
    │ ── Oracle 26ai 내장 임베딩 또는 외부 모델
    ▼
Oracle 26ai INSERT
    │ ── 기존 IS_LATEST='Y' → 'N' 업데이트
    │ ── 신규 레코드 IS_LATEST='Y' 인서트
    ▼
동기화 완료 로그
```

#### 청킹 함수 인터페이스

```javascript
// knowledge/chunker.js
class SemanticChunker {
    constructor(parser) {
        this.parser = parser; // tree-sitter parser
    }

    // 파일을 논리적 모듈 단위로 분할
    async chunkFile(filePath, content) {
        const tree = this.parser.parse(content);
        const modules = this.extractModules(tree.rootNode);
        
        return modules.map(mod => ({
            docId: path.relative(workspacePath, filePath),
            moduleName: mod.name,
            chunkType: mod.type,  // CLASS / FUNCTION / INTERFACE
            content: this.addMetadataHeader(mod, filePath),
            tokenCount: this.countTokens(mod.text)
        }));
    }

    // 메타데이터 헤더 주입 (AI 컨텍스트 파악용)
    addMetadataHeader(module, filePath) {
        return `// File: ${filePath}\n// Module: ${module.name} (${module.type})\n// Version: auto\n\n${module.text}`;
    }

    // 1000~2000 토큰 범위를 초과하는 모듈 분할
    splitLargeModule(module, maxTokens = 2000) { /* ... */ }
}
```

### 5.2 벡터 검색 쿼리 패턴

```sql
-- 1. 유사도 기반 코드 검색 (에이전트 컨텍스트 주입용)
SELECT DOC_ID, MODULE_NAME, CONTENT, 
       VECTOR_DISTANCE(CONTENT_VECTOR, :query_vector, COSINE) AS similarity
FROM KNOWLEDGE_BASE
WHERE WORKSPACE_PATH = :workspace
  AND IS_LATEST = 'Y'
  AND APPROVAL_STATUS = 'APPROVED'
ORDER BY similarity
FETCH FIRST 10 ROWS ONLY;

-- 2. 디버깅용 버전 비교 검색 (현재 에러 + 직전 정상)
SELECT kb_current.CONTENT AS error_version,
       kb_prev.CONTENT AS working_version,
       kb_design.CONTENT AS design_intent
FROM KNOWLEDGE_BASE kb_current
JOIN KNOWLEDGE_BASE kb_prev 
    ON kb_current.DOC_ID = kb_prev.DOC_ID 
    AND kb_current.MODULE_NAME = kb_prev.MODULE_NAME
    AND kb_prev.VERSION = kb_current.VERSION - 1
LEFT JOIN KNOWLEDGE_BASE kb_design 
    ON kb_design.DOC_ID = kb_current.DOC_ID 
    AND kb_design.CHUNK_TYPE = 'DOC'
    AND kb_design.IS_LATEST = 'Y'
WHERE kb_current.DOC_ID = :doc_id
  AND kb_current.MODULE_NAME = :module_name
  AND kb_current.IS_LATEST = 'Y'
  AND kb_current.WORKSPACE_PATH = :workspace;

-- 3. 워크스페이스 전체 코드 맵 (Coder 에이전트용)
SELECT DOC_ID, MODULE_NAME, CHUNK_TYPE, TOKEN_COUNT,
       SUBSTR(CONTENT, 1, 200) AS preview
FROM KNOWLEDGE_BASE
WHERE WORKSPACE_PATH = :workspace
  AND IS_LATEST = 'Y'
ORDER BY DOC_ID, MODULE_NAME;
```

### 5.3 에이전트 오케스트레이션 흐름

```javascript
// orchestrator/Orchestrator.js
class Orchestrator {
    constructor(db, agentRunnerFactory) {
        this.db = db;
        this.factory = agentRunnerFactory;
    }

    // 메인 실행 흐름
    async executeTask(workspace, userRequest) {
        // 1단계: 관련 지식 검색
        const context = await this.db.vectorSearch(workspace, userRequest);
        
        // 2단계: Architect에게 설계 위임
        const architect = this.factory.create('Architect', workspace);
        const designPlan = await architect.execute(userRequest, context);
        
        // 3단계: 승인 큐에 등록 (Human-in-the-Loop)
        const approvalId = await this.db.createApproval({
            workspace, agentId: 'architect-01',
            taskType: 'DESIGN', content: designPlan
        });
        
        return { approvalId, plan: designPlan, status: 'PENDING_APPROVAL' };
    }

    // 승인 후 실행
    async onApproved(approvalId) {
        const approval = await this.db.getApproval(approvalId);
        
        // 4단계: 병렬 실행 (Coder + Bulk)
        const [codeResult, docResult] = await Promise.allSettled([
            this.executeCoder(approval),
            this.executeBulk(approval)
        ]);
        
        // 5단계: 코드 결과를 Debugger로 검증
        if (codeResult.status === 'fulfilled') {
            const debugResult = await this.executeDebugger(
                approval, codeResult.value
            );
            return { code: debugResult, docs: docResult };
        }
    }

    // Debugger: 3-Way Diff 컨텍스트 구성
    async executeDebugger(approval, codeResult) {
        const diffContext = await this.db.getDebugContext(
            approval.WORKSPACE_PATH,
            codeResult.modifiedFiles
        );
        // diffContext = { errorVersion, workingVersion, designIntent }
        
        const debugger = this.factory.create('Debugger', approval.WORKSPACE_PATH);
        return debugger.execute(codeResult, diffContext);
    }
}
```

### 5.4 컨텍스트 주입 파이프라인 (Context Injection Pipeline)

에이전트가 작업을 시작할 때 Oracle 26ai에서 **역할에 최적화된 컨텍스트**를 동적으로 조합하여 프롬프트에 주입합니다. 이것이 AI-MACT의 핵심 메커니즘입니다.

#### 설계 원칙

1. **역할별 차등 전략**: 같은 벡터 DB지만 에이전트마다 다른 검색 쿼리를 사용합니다.
2. **토큰 예산 관리**: 각 모델의 컨텍스트 윈도우에 맞춰 청크를 랭킹 후 트리밍합니다.
3. **3단계 파이프라인**: ContextRouter → ContextBuilder → PromptTemplate

#### 에이전트별 컨텍스트 전략 매트릭스

| Agent | 검색 전략 | 토큰 예산 | 핵심 주입 데이터 |
|-------|----------|-----------|-----------------|
| Architect | Semantic(8) + Structure + Conventions | ~9.6K / 16K | 관련 설계·코드 + 프로젝트 맵 + 컨벤션 |
| Coder | Semantic(15) + Full Code Map + Approved Design | ~24K / 32K | 승인된 설계 + 전체 코드베이스(1M 활용) |
| Debugger | Version Diff + Design Intent + Error Context | ~12K / 16K | 에러버전 + 정상버전 + 설계의도 (3-Way) |
| Bulk | Structure(minimal) + Doc Template | ~3.2K / 8K | 대상 함수 목록 + 문서 템플릿 (최소화) |

#### ContextRouter (전략 선택기)

```javascript
// knowledge/ContextRouter.js
class ContextRouter {
    constructor(db) {
        this.db = db;
        this.strategies = {
            'Architect':  new ArchitectStrategy(db),
            'Coder':      new CoderStrategy(db),
            'Debugger':   new DebuggerStrategy(db),
            'Bulk':       new BulkStrategy(db),
        };
    }

    // 에이전트 역할에 따라 적절한 전략을 선택하고 컨텍스트를 조립
    async buildContext(agentRole, workspace, taskInput) {
        const strategy = this.strategies[agentRole];
        if (!strategy) throw new Error(`Unknown agent role: ${agentRole}`);
        
        // 1단계: 역할별 벡터 검색 실행
        const rawChunks = await strategy.search(workspace, taskInput);
        
        // 2단계: 토큰 예산 내에서 랭킹 및 트리밍
        const budget = strategy.getTokenBudget();
        const trimmedChunks = this.rankAndTrim(rawChunks, budget);
        
        // 3단계: 프롬프트 템플릿에 조립
        return strategy.assemblePrompt(trimmedChunks, taskInput);
    }

    // 유사도 점수 기반 랭킹 → 토큰 예산 초과 시 하위 청크 제거
    rankAndTrim(chunks, tokenBudget) {
        let totalTokens = 0;
        const selected = [];
        
        // 우선순위 순서로 정렬 (priority 높은 것 먼저)
        const sorted = chunks.sort((a, b) => b.priority - a.priority);
        
        for (const chunk of sorted) {
            if (totalTokens + chunk.tokenCount <= tokenBudget) {
                selected.push(chunk);
                totalTokens += chunk.tokenCount;
            }
        }
        
        return { chunks: selected, usedTokens: totalTokens, budget: tokenBudget };
    }
}
```

#### ArchitectStrategy (설계 에이전트 전략)

```javascript
// knowledge/strategies/ArchitectStrategy.js
class ArchitectStrategy {
    constructor(db) { this.db = db; }
    
    getTokenBudget() { return 10000; } // ~10K tokens for context
    
    async search(workspace, taskInput) {
        const chunks = [];
        
        // 1. 시맨틱 검색: 사용자 요청과 유사한 기존 설계/코드 (Top-8)
        const semanticResults = await this.db.query(`
            SELECT DOC_ID, MODULE_NAME, CONTENT, TOKEN_COUNT,
                   VECTOR_DISTANCE(CONTENT_VECTOR, 
                     VECTOR_EMBEDDING(:userRequest USING MODEL 'all-MiniLM-L6-v2'), 
                     COSINE) AS similarity
            FROM KNOWLEDGE_BASE
            WHERE WORKSPACE_PATH = :workspace
              AND IS_LATEST = 'Y'
              AND APPROVAL_STATUS = 'APPROVED'
            ORDER BY similarity
            FETCH FIRST 8 ROWS ONLY
        `, { userRequest: taskInput.prompt, workspace });
        
        chunks.push(...semanticResults.map((r, i) => ({
            section: 'RELATED_CODE',
            content: r.CONTENT,
            tokenCount: r.TOKEN_COUNT,
            priority: 100 - i * 5  // 유사도 순으로 우선순위 감소
        })));

        // 2. 구조 쿼리: 프로젝트 전체 모듈 맵 (요약만)
        const structureMap = await this.db.query(`
            SELECT DOC_ID, MODULE_NAME, CHUNK_TYPE, TOKEN_COUNT
            FROM KNOWLEDGE_BASE
            WHERE WORKSPACE_PATH = :workspace AND IS_LATEST = 'Y'
            ORDER BY DOC_ID, MODULE_NAME
        `, { workspace });
        
        const mapText = structureMap.map(m => 
            `${m.DOC_ID} → ${m.MODULE_NAME} (${m.CHUNK_TYPE}, ${m.TOKEN_COUNT}tok)`
        ).join('\n');
        
        chunks.push({
            section: 'PROJECT_MAP',
            content: mapText,
            tokenCount: Math.ceil(mapText.length / 4),
            priority: 150  // 높은 우선순위 (항상 포함)
        });

        // 3. 프로젝트 컨벤션 문서 (naming, patterns 등)
        const conventions = await this.db.query(`
            SELECT CONTENT, TOKEN_COUNT FROM KNOWLEDGE_BASE
            WHERE WORKSPACE_PATH = :workspace 
              AND CHUNK_TYPE IN ('DOC', 'CONFIG')
              AND IS_LATEST = 'Y'
        `, { workspace });
        
        chunks.push(...conventions.map(c => ({
            section: 'CONVENTIONS',
            content: c.CONTENT,
            tokenCount: c.TOKEN_COUNT,
            priority: 200  // 최우선 (컨벤션은 반드시 포함)
        })));

        return chunks;
    }

    assemblePrompt(trimmedData, taskInput) {
        const { chunks } = trimmedData;
        const bySection = this.groupBySection(chunks);
        
        return {
            system: `You are the Architect agent for AI-MACT.
Design modules that follow the project conventions below.
Generate: architecture overview, API spec, data model, implementation notes.`,
            
            context: [
                bySection.CONVENTIONS   && `## Project conventions\n${bySection.CONVENTIONS}`,
                bySection.PROJECT_MAP   && `## Project structure\n${bySection.PROJECT_MAP}`,
                bySection.RELATED_CODE  && `## Related existing code\n${bySection.RELATED_CODE}`,
            ].filter(Boolean).join('\n\n---\n\n'),
            
            task: taskInput.prompt,
            meta: { usedTokens: trimmedData.usedTokens, budget: trimmedData.budget }
        };
    }

    groupBySection(chunks) {
        const groups = {};
        for (const c of chunks) {
            groups[c.section] = (groups[c.section] || '') + c.content + '\n';
        }
        return groups;
    }
}
```

#### DebuggerStrategy (디버깅 에이전트 전략 — 3-Way Diff)

```javascript
// knowledge/strategies/DebuggerStrategy.js
class DebuggerStrategy {
    constructor(db) { this.db = db; }
    
    getTokenBudget() { return 12000; }
    
    async search(workspace, taskInput) {
        const { errorFiles, stackTrace } = taskInput;
        const chunks = [];
        
        // 1. 3-Way Diff: 에러 버전(현재) + 정상 버전(직전) 동시 추출
        for (const file of errorFiles) {
            const diffResult = await this.db.query(`
                SELECT 
                    kb_err.CONTENT    AS error_version,
                    kb_err.VERSION    AS error_ver_num,
                    kb_ok.CONTENT     AS working_version,
                    kb_ok.VERSION     AS working_ver_num,
                    kb_err.TOKEN_COUNT + NVL(kb_ok.TOKEN_COUNT, 0) AS total_tokens
                FROM KNOWLEDGE_BASE kb_err
                LEFT JOIN KNOWLEDGE_BASE kb_ok 
                    ON kb_err.DOC_ID = kb_ok.DOC_ID 
                    AND kb_err.MODULE_NAME = kb_ok.MODULE_NAME
                    AND kb_ok.VERSION = kb_err.VERSION - 1
                    AND kb_ok.WORKSPACE_PATH = :workspace
                WHERE kb_err.DOC_ID = :docId
                  AND kb_err.MODULE_NAME = :moduleName
                  AND kb_err.IS_LATEST = 'Y'
                  AND kb_err.WORKSPACE_PATH = :workspace
            `, { docId: file.docId, moduleName: file.moduleName, workspace });
            
            if (diffResult.length > 0) {
                const r = diffResult[0];
                chunks.push({
                    section: 'ERROR_VERSION',
                    content: `// ${file.docId} :: ${file.moduleName} (v${r.error_ver_num} - BROKEN)\n${r.error_version}`,
                    tokenCount: Math.ceil(r.total_tokens / 2),
                    priority: 200  // 최우선
                });
                if (r.working_version) {
                    chunks.push({
                        section: 'WORKING_VERSION',
                        content: `// ${file.docId} :: ${file.moduleName} (v${r.working_ver_num} - WORKING)\n${r.working_version}`,
                        tokenCount: Math.ceil(r.total_tokens / 2),
                        priority: 190
                    });
                }
            }
        }

        // 2. 설계 의도: 해당 모듈의 원래 설계 문서
        const designIntent = await this.db.query(`
            SELECT CONTENT, TOKEN_COUNT FROM KNOWLEDGE_BASE
            WHERE WORKSPACE_PATH = :workspace
              AND CHUNK_TYPE = 'DOC'
              AND IS_LATEST = 'Y'
              AND CONTENT_VECTOR IS NOT NULL
            ORDER BY VECTOR_DISTANCE(CONTENT_VECTOR, 
                VECTOR_EMBEDDING(:errorContext USING MODEL 'all-MiniLM-L6-v2'), COSINE)
            FETCH FIRST 3 ROWS ONLY
        `, { workspace, errorContext: stackTrace });
        
        chunks.push(...designIntent.map(d => ({
            section: 'DESIGN_INTENT',
            content: d.CONTENT,
            tokenCount: d.TOKEN_COUNT,
            priority: 150
        })));

        // 3. 에러 체인: 스택 트레이스에 등장하는 호출자/피호출자 코드
        const callerModules = this.parseStackTrace(stackTrace);
        for (const mod of callerModules.slice(0, 3)) {
            const callerCode = await this.db.query(`
                SELECT CONTENT, TOKEN_COUNT FROM KNOWLEDGE_BASE
                WHERE WORKSPACE_PATH = :workspace
                  AND MODULE_NAME = :moduleName AND IS_LATEST = 'Y'
            `, { workspace, moduleName: mod });
            
            chunks.push(...callerCode.map(c => ({
                section: 'ERROR_CHAIN',
                content: c.CONTENT,
                tokenCount: c.TOKEN_COUNT,
                priority: 80
            })));
        }

        return chunks;
    }

    assemblePrompt(trimmedData, taskInput) {
        const { chunks } = trimmedData;
        const bySection = this.groupBySection(chunks);
        
        return {
            system: `You are the Debugger agent for AI-MACT.
Compare the error version with the working version.
Identify what changed and why it broke.
Propose the minimal fix that restores correct behavior.`,
            
            context: [
                bySection.ERROR_VERSION   && `## Error version (current - BROKEN)\n${bySection.ERROR_VERSION}`,
                bySection.WORKING_VERSION && `## Working version (previous - OK)\n${bySection.WORKING_VERSION}`,
                bySection.DESIGN_INTENT   && `## Design intent\n${bySection.DESIGN_INTENT}`,
                bySection.ERROR_CHAIN     && `## Related caller/callee code\n${bySection.ERROR_CHAIN}`,
            ].filter(Boolean).join('\n\n---\n\n'),
            
            task: `Error: ${taskInput.errorMessage}\nStack: ${taskInput.stackTrace}`,
            meta: { usedTokens: trimmedData.usedTokens, budget: trimmedData.budget }
        };
    }

    parseStackTrace(trace) {
        // 스택 트레이스에서 모듈명 추출 (at ModuleName.method)
        return [...trace.matchAll(/at\s+(\w+)\./g)].map(m => m[1]);
    }
    
    groupBySection(chunks) {
        const groups = {};
        for (const c of chunks) {
            groups[c.section] = (groups[c.section] || '') + c.content + '\n';
        }
        return groups;
    }
}
```

#### PromptTemplate (최종 프롬프트 조립기)

```javascript
// knowledge/PromptTemplate.js
class PromptTemplate {
    // ContextStrategy가 반환한 { system, context, task, meta }를 
    // 에이전트 CLI에 전달할 최종 문자열로 조립
    static assemble({ system, context, task, meta }) {
        const prompt = [
            `[SYSTEM]\n${system}`,
            '',
            `[CONTEXT] (${meta.usedTokens} / ${meta.budget} tokens used)`,
            context,
            '',
            `[TASK]`,
            task
        ].join('\n');
        
        return {
            prompt,
            tokenUsage: meta
        };
    }
}
```

#### AgentRunner와의 통합

```javascript
// 오케스트레이터에서 실제 호출 흐름
async function runAgent(agentRole, workspace, taskInput) {
    const router = new ContextRouter(db);
    
    // 1. 역할별 컨텍스트 조립 (벡터 DB 검색 → 랭킹 → 트리밍)
    const contextResult = await router.buildContext(agentRole, workspace, taskInput);
    
    // 2. 최종 프롬프트 생성
    const { prompt, tokenUsage } = PromptTemplate.assemble(contextResult);
    
    // 3. 에이전트 실행 (CLI → 스트리밍)
    const agent = new AgentRunner(agentConfig, workspace);
    const result = await agent.execute(prompt);
    
    // 4. 실행 로그 기록
    await db.logExecution({
        agentId: agentConfig.AGENT_ID,
        workspace,
        promptTokens: tokenUsage.usedTokens,
        outputTokens: result.outputTokens,
        durationMs: result.duration
    });
    
    return result;
}
```

---

## 6. API 설계 (REST + SSE)

### 6.1 엔드포인트 목록

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/workspaces` | 등록된 워크스페이스 목록 |
| POST | `/api/workspaces` | 워크스페이스 등록 |
| PUT | `/api/workspaces/:path` | 워크스페이스 설정 변경 |
| GET | `/api/agents` | 에이전트 설정 목록 |
| PUT | `/api/agents/:id` | 에이전트 설정 변경 (모델, 활성화 등) |
| POST | `/api/tasks` | 새 작업 요청 (→ Architect) |
| GET | `/api/tasks/:id/stream` | 작업 실행 SSE 스트림 |
| GET | `/api/approvals` | 승인 대기 목록 |
| GET | `/api/approvals/:id` | 승인 건 상세 (diff 포함) |
| POST | `/api/approvals/:id/approve` | 승인 처리 |
| POST | `/api/approvals/:id/reject` | 거절 처리 (사유 포함) |
| GET | `/api/knowledge/search` | 벡터 유사도 검색 |
| GET | `/api/knowledge/:docId/history` | 모듈 버전 이력 조회 |
| GET | `/api/logs` | 에이전트 실행 이력 |

### 6.2 SSE 스트리밍 프로토콜

```javascript
// 클라이언트 → 서버
// POST /api/tasks
// { workspace: "C:\\work", prompt: "로그인 API 설계해줘" }

// 서버 → 클라이언트 (SSE)
// GET /api/tasks/:id/stream

// 이벤트 타입 정의:
// event: agent_start     → { agent: "Architect", status: "running" }
// event: token           → { content: "## 로그인 API 설계\n..." }  (스트리밍 토큰)
// event: agent_complete  → { agent: "Architect", tokensUsed: 2340 }
// event: approval_needed → { approvalId: "xxx", summary: "..." }
// event: parallel_start  → { agents: ["Coder", "Bulk"] }
// event: debug_start     → { agent: "Debugger", context: "3-way diff" }
// event: task_complete   → { results: {...}, totalDuration: 45000 }
// event: error           → { code: "AGENT_TIMEOUT", message: "..." }
```

---

## 7. 프론트엔드 설계 (Next.js 16)

### 7.1 페이지 구조

```
/                          → 대시보드 (워크스페이스 선택 + 최근 활동)
/workspace/:path           → 워크스페이스 메인 (작업 입력 + 실시간 모니터)
/workspace/:path/approvals → 승인 대기 목록 + Diff Viewer
/workspace/:path/knowledge → 지식 탐색기 (벡터 검색 + 버전 이력)
/workspace/:path/agents    → 에이전트 관리 (모델 교체, 활성화 토글)
/workspace/:path/logs      → 실행 이력 + 토큰 사용량 통계
```

### 7.2 핵심 UI 컴포넌트

| 컴포넌트 | 기능 |
|----------|------|
| `WorkspaceSelector` | 폴더 선택 + 프로젝트 정보 표시 |
| `TaskInput` | 프롬프트 입력 + 에이전트 자동 선택 |
| `StreamViewer` | SSE 스트리밍 결과 실시간 렌더링 (Markdown) |
| `ApprovalPanel` | 설계안 Diff 뷰어 + 승인/거절 버튼 |
| `AgentDashboard` | 에이전트 상태, 모델 교체, on/off 토글 |
| `KnowledgeExplorer` | 벡터 검색 UI + 코드 하이라이팅 |
| `VersionTimeline` | 모듈별 버전 변천사 타임라인 |

---

## 8. 파일 동기화 시스템 (Chokidar + Tree-sitter)

### 8.1 Watcher 설정

```javascript
// sync/FileWatcher.js
const chokidar = require('chokidar');
const { SemanticChunker } = require('../knowledge/chunker');

class FileWatcher {
    constructor(workspacePath, db) {
        this.workspace = workspacePath;
        this.db = db;
        this.chunker = new SemanticChunker();
        this.debounceMap = new Map(); // 파일별 디바운스
    }

    start() {
        const config = this.db.getWorkspaceConfig(this.workspace);
        
        this.watcher = chokidar.watch(config.WATCH_PATTERNS, {
            cwd: this.workspace,
            ignored: config.IGNORE_PATTERNS.split(','),
            persistent: true,
            ignoreInitial: true,     // 초기 스캔 시 이벤트 발생하지 않음
            awaitWriteFinish: {       // 파일 쓰기 완료 대기
                stabilityThreshold: 500,
                pollInterval: 100
            }
        });

        this.watcher
            .on('change', (path) => this.handleChange(path))
            .on('add', (path) => this.handleChange(path))
            .on('unlink', (path) => this.handleDelete(path));
    }

    // 디바운스 적용 (500ms 내 중복 이벤트 무시)
    handleChange(filePath) {
        if (this.debounceMap.has(filePath)) {
            clearTimeout(this.debounceMap.get(filePath));
        }
        this.debounceMap.set(filePath, setTimeout(async () => {
            await this.syncFile(filePath);
            this.debounceMap.delete(filePath);
        }, 500));
    }

    // 파일 → 청킹 → 임베딩 → Oracle 26ai 동기화
    async syncFile(filePath) {
        const content = fs.readFileSync(path.join(this.workspace, filePath), 'utf-8');
        const chunks = await this.chunker.chunkFile(filePath, content);
        
        for (const chunk of chunks) {
            // 기존 최신 버전 비활성화
            await this.db.execute(
                `UPDATE KNOWLEDGE_BASE SET IS_LATEST = 'N' 
                 WHERE DOC_ID = :docId AND MODULE_NAME = :moduleName 
                 AND WORKSPACE_PATH = :workspace AND IS_LATEST = 'Y'`,
                { docId: chunk.docId, moduleName: chunk.moduleName, workspace: this.workspace }
            );
            
            // 새 버전 삽입 (벡터 임베딩 포함)
            await this.db.execute(
                `INSERT INTO KNOWLEDGE_BASE 
                 (DOC_ID, MODULE_NAME, VERSION, CONTENT, CONTENT_VECTOR, 
                  CHUNK_TYPE, TOKEN_COUNT, MODIFIED_BY, CHANGE_REASON, 
                  WORKSPACE_PATH, IS_LATEST)
                 VALUES (:docId, :moduleName, 
                  (SELECT NVL(MAX(VERSION),0)+1 FROM KNOWLEDGE_BASE 
                   WHERE DOC_ID = :docId AND MODULE_NAME = :moduleName AND WORKSPACE_PATH = :workspace),
                  :content, VECTOR_EMBEDDING(:content USING MODEL 'all-MiniLM-L6-v2'),
                  :chunkType, :tokenCount, 'file-watcher', 'Auto-sync on file change',
                  :workspace, 'Y')`,
                chunk
            );
        }
    }
}
```

---

## 9. 보안 및 격리 설계

### 9.1 워크스페이스 격리 매트릭스

| 격리 대상 | 메커니즘 |
|-----------|----------|
| DB 데이터 | `WORKSPACE_PATH` 필터 (모든 쿼리에 필수 적용) |
| 에이전트 실행 | `cwd` 고정 (에이전트가 다른 경로 접근 불가) |
| 파일 감시 | Chokidar 인스턴스 워크스페이스별 독립 생성 |
| 벡터 검색 | WHERE 절에 WORKSPACE_PATH 필수 포함 |

### 9.2 에이전트 실행 보안

- 모든 에이전트는 사용자 권한이 아닌 제한된 프로세스 권한으로 실행
- Sandbox 모드: Debugger는 격리된 환경에서 코드 실행
- 네트워크 접근: Bulk 에이전트(Local)는 네트워크 접근 불필요, 차단 가능

---

## 10. 구현 로드맵

### Phase 1: Core (2주)
- Oracle 26ai 스키마 생성 및 연결 테스트
- node-oracledb 기반 DB 모듈 구현
- 단일 에이전트(Architect) CLI 통신 + SSE 스트리밍 프로토타입

### Phase 2: Sync (2주)
- tree-sitter 기반 시맨틱 청킹 엔진 구현
- Chokidar 파일 워처 + 자동 벡터 동기화
- 벡터 검색 쿼리 최적화 및 테스트

### Phase 3: UI (2주)
- Next.js 16 프로젝트 세팅 및 라우팅
- 워크스페이스 셀렉터 + 에이전트 대시보드 UI
- SSE 기반 실시간 스트림 뷰어

### Phase 4: Logic (2주)
- 4종 에이전트 전체 연동 및 오케스트레이터 완성
- Human-in-the-Loop 승인 프로세스 + Diff Viewer
- 3-Way Diff 디버깅 프롬프트 최적화
- 통합 테스트 및 안정화