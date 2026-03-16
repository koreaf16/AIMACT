export class AgentRunnerFactory {
    create(role: string, workspace: string) {
        return new (require('./AgentRunner').AgentRunner)(role, workspace);
    }
}
