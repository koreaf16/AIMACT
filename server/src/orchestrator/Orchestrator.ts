import { db } from '../db';
import { AgentRunner } from '../agents/AgentRunner';

export interface TaskResult {
    success: boolean;
    output?: string;
    error?: string;
    role: string;
}

export class Orchestrator {
    private db = db;

    constructor() {}

    /**
     * 메인 작업 실행 로직
     * 지식 검색 -> 에이전트 선정 -> CLI 실행 -> 결과 반환
     */
    async executeTask(
        workspace: string,
        prompt: string,
        role: string,
        history: any[],
        config: { command: string, systemPrompt: string, customEnv?: Record<string, string> },
        onToken: (token: string) => void,
        onError: (err: string) => void,
        onLog: (log: string) => void,
        onContextInjected?: (vectorContext: string, historyContext: string) => void
    ): Promise<TaskResult> {

        console.log(`[Orchestrator] Starting Task: ${prompt} for Workspace: ${workspace}`);

        // 1. 지식 자산 검색 (Oracle 23ai Vector Search)
        let augmentedPrompt = prompt;
        let vectorContext = "";
        try {
            const searchResults = await this.db.vectorSearch(workspace, prompt);
            if (searchResults && searchResults.length > 0) {
                vectorContext = searchResults.map((r: any, idx: number) => {
                    const content = r.content || r.CONTENT || "No content";
                    const title = r.title || r.MODULE_NAME || "Untitled";
                    const fullSource = r.path || r.DOC_ID || "Unknown";
                    const fileName = fullSource.split(/[\\/]/).pop() || fullSource;

                    return `[Knowledge Asset #${idx + 1}: ${title} (Source: ${fileName})]\n${content}`;
                }).join('\n\n');
                console.log(`[Orchestrator] Vector Context Augmented with ${searchResults.length} assets.`);
            }
        } catch (searchErr) {
            console.warn(`[Orchestrator] Vector search failed, proceeding without vector context.`);
        }

        // 2. Sliding Window History 조합
        let historyContext = "";
        if (history && history.length > 0) {
            historyContext = history.map((msg: any) => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n\n');
        }

        // 2.5 Context injection callback (StreamMonitor용)
        if (onContextInjected) {
            onContextInjected(vectorContext, historyContext);
        }

        // 3. 최종 프롬프트 조립
        if (vectorContext || historyContext) {
            augmentedPrompt = `사용자 요청: ${prompt}\n\n`;
            if (vectorContext) {
                augmentedPrompt += `[참고 지식 컨텍스트 (Vector DB)]\n${vectorContext}\n\n`;
            }
            if (historyContext) {
                augmentedPrompt += `[최근 대화 기록 (Sliding Window)]\n${historyContext}\n\n`;
            }
            augmentedPrompt += `위의 컨텍스트와 대화 기록을 참고하여 현재 사용자 요청을 처리하십시오.`;
        }

        // 4. 에이전트 실행기(AgentRunner) 생성
        const runner = new AgentRunner(role, config.command, config.systemPrompt, workspace, config.customEnv || {});

        // 이벤트 연결
        runner.on('token', (token) => onToken(token));
        runner.on('error', (err) => onError(err));
        runner.on('log', (log) => onLog(log));

        try {
            // 5. 실제 CLI 실행
            await runner.execute(augmentedPrompt);
            return { success: true, role };
        } catch (err: any) {
            console.error(`[Orchestrator] Task Failed: ${err.message}`);
            return { success: false, error: err.message, role };
        }
    }
}
