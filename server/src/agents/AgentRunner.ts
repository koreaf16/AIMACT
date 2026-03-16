import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export class AgentRunner extends EventEmitter {
    role: string;
    command: string;
    systemPrompt: string;
    customEnv: Record<string, string>;
    workspace: string;

    constructor(role: string, command: string, systemPrompt: string, workspace: string, customEnv: Record<string, string> = {}) {
        super();
        this.role = role;
        this.command = command;
        this.systemPrompt = systemPrompt;
        this.workspace = workspace;
        this.customEnv = customEnv;
    }

    async execute(prompt: string): Promise<void> {
        return new Promise((resolve, reject) => {
            let [cmd, ...args] = this.command.split(' ');
            
            const fullEnv = { 
                ...process.env, 
                SYSTEM_PROMPT: this.systemPrompt,
                ...this.customEnv
            };

            // 로그용 프롬프트 가공 (지식 컨텍스트 본문은 각 자산당 3줄 정도로 제한)
            const displayPrompt = prompt.split('\n').reduce((acc, line) => {
                const isAssetHeader = line.startsWith('[Knowledge Asset');
                const isFooter = line.startsWith('위의 지식을');

                if (isAssetHeader) {
                    acc.inAsset = true;
                    acc.assetLines = 0;
                } else if (isFooter) {
                    acc.inAsset = false;
                }
                
                if (acc.inAsset) {
                    if (acc.assetLines < 3) {
                        acc.text += line + '\n';
                    } else if (acc.assetLines === 3) {
                        acc.text += '... (content truncated in log) ...\n';
                    }
                    acc.assetLines++;
                } else {
                    acc.text += line + '\n';
                }
                return acc;
            }, { text: '', inAsset: false, assetLines: 0 }).text;

            // 로그용 메타데이터와 프롬프트 분리
            const metadataLog = `
================================================================================
[AgentRunner] 🤖 ROLE: ${this.role}
[AgentRunner] 🚀 EXEC: ${cmd} ${args.join(' ')}
[AgentRunner] 📂 WORKSPACE: ${this.workspace}
[AgentRunner] 📂 ENV:
    - SYSTEM_PROMPT: ${this.systemPrompt}
${Object.keys(this.customEnv).length > 0 ? `    - CUSTOM_ENV: ${JSON.stringify(this.customEnv)}` : ''}
================================================================================`;

            const promptLog = `
[AgentRunner] 📥 STDIN (Display Prompt):
${displayPrompt}
================================================================================
`;
            
            // 서버 콘솔에는 모두 출력
            console.log(metadataLog + promptLog);
            
            // 웹 UI에는 메타데이터 정보만 전달 (뒤에 붙는 context 제외)
            this.emit('log', metadataLog);

            this.emit('start', { role: this.role, command: this.command });

            const child = spawn(cmd, args, {
                shell: true,
                cwd: this.workspace,
                env: fullEnv
            });

            // 프롬프트를 안전하게 표준 입력(stdin)으로 전달
            // 명령어 실행 시 프롬프트를 인자로 넣으면 셸 이스케이프 문제가 발생하므로 이 방식이 안전함
            child.stdin.write(prompt);
            child.stdin.end();

            // 출력 처리
            child.stdout.on('data', (data) => {
                const text = data.toString();
                this.emit('token', text);
            });

            // 에러 출력 스트리밍 (로그성 메시지가 많으므로 log로 전송)
            child.stderr.on('data', (data) => {
                this.emit('log', data.toString());
            });

            child.on('close', (code) => {
                if (code === 0 || code === null) {
                    this.emit('complete', { role: this.role });
                    resolve();
                } else {
                    const errorMsg = `Process exited with code ${code}`;
                    this.emit('error', errorMsg);
                    reject(new Error(errorMsg));
                }
            });

            child.on('error', (err) => {
                this.emit('error', err.message);
                reject(err);
            });
        });
    }
}
