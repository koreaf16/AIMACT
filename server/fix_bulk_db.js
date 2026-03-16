const oracledb = require('oracledb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const dbConfig = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING
};

async function run() {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    
    const customEnv = {
        CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
        ANTHROPIC_BASE_URL: "http://192.168.0.3:11434",
        ANTHROPIC_AUTH_TOKEN: "ollama"
    };

    const sql = `
        UPDATE AI_MODELS 
        SET NAME = :name,
            MODEL_NAME = :model_name,
            CLI_COMMAND = :cmd,
            CUSTOM_ENV = :env
        WHERE MODEL_ID = 'm-04'
    `;

    await connection.execute(sql, {
        name: 'Bulk (Ollama-Qwen-Reasoning)',
        model_name: 'qwen3.5-27b-claude-4.6-opus-reasoning-distilled',
        cmd: 'claude -p "전체 코드베이스를 읽고 보안 취약점이 있는지 분석해줘" --output-format text --max-turns 5 --model qwen3.5-27b-claude-4.6-opus-reasoning-distilled',
        env: JSON.stringify(customEnv)
    }, { autoCommit: true });

    console.log("Bulk 에이전트의 파라미터와 명령어가 DB에 성공적으로 주입되었습니다.");
  } catch (err) {
    console.error("Error: ", err.message);
  } finally {
    if (connection) await connection.close();
  }
}

run();
