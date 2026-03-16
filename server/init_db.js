const oracledb = require('oracledb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const dbConfig = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING
};

const sqls = [
  // AI_MODELS
  `CREATE TABLE AI_MODELS (
      MODEL_ID          VARCHAR2(50)   PRIMARY KEY,
      NAME              VARCHAR2(100)  NOT NULL,
      MODEL_NAME        VARCHAR2(100)  NOT NULL,
      CLI_COMMAND       VARCHAR2(500)  NOT NULL,
      CONTEXT_STRATEGY  VARCHAR2(50)   NOT NULL,
      SYSTEM_PROMPT     CLOB,
      CUSTOM_ENV        CLOB,
      CREATED_AT        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
  )`,
  
  // AI_ROLE_ASSIGNMENTS
  `CREATE TABLE AI_ROLE_ASSIGNMENTS (
      ROLE_NAME   VARCHAR2(50) PRIMARY KEY,
      MODEL_ID    VARCHAR2(50),
      UPDATED_AT  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT FK_RA_MODEL FOREIGN KEY (MODEL_ID) REFERENCES AI_MODELS(MODEL_ID)
  )`,

  // Initial Models
  `INSERT INTO AI_MODELS (MODEL_ID, NAME, MODEL_NAME, CLI_COMMAND, CONTEXT_STRATEGY, SYSTEM_PROMPT, CUSTOM_ENV) 
   VALUES ('m-01', 'Claude 4.6 Opus', 'claude-4.6-opus', 'claude --model opus', 'Architect', 'You are a professional software architect.', '{}')`,
  `INSERT INTO AI_MODELS (MODEL_ID, NAME, MODEL_NAME, CLI_COMMAND, CONTEXT_STRATEGY, SYSTEM_PROMPT, CUSTOM_ENV) 
   VALUES ('m-02', 'Gemini 3.1 Pro', 'gemini-3.1-pro', 'gemini --model pro', 'Coder', 'You are an expert full-stack developer.', '{}')`,
  `INSERT INTO AI_MODELS (MODEL_ID, NAME, MODEL_NAME, CLI_COMMAND, CONTEXT_STRATEGY, SYSTEM_PROMPT, CUSTOM_ENV) 
   VALUES ('m-03', 'Codex 3.1', 'codex-3.1', 'codex --model 3.1', 'Debugger', 'You are a senior debugging specialist.', '{}')`,
  `INSERT INTO AI_MODELS (MODEL_ID, NAME, MODEL_NAME, CLI_COMMAND, CONTEXT_STRATEGY, SYSTEM_PROMPT, CUSTOM_ENV) 
   VALUES ('m-04', 'Bulk (Ollama)', 'qwen3.5-27b', 'claude --model qwen3.5-27b', 'Bulk', 'Bulk task assistant.', '{"ANTHROPIC_BASE_URL":"http://192.168.0.3:11434"}')`,

  // Initial Role Assignments
  `INSERT INTO AI_ROLE_ASSIGNMENTS (ROLE_NAME, MODEL_ID) VALUES ('Architect', 'm-01')`,
  `INSERT INTO AI_ROLE_ASSIGNMENTS (ROLE_NAME, MODEL_ID) VALUES ('Coder', 'm-02')`,
  `INSERT INTO AI_ROLE_ASSIGNMENTS (ROLE_NAME, MODEL_ID) VALUES ('Debugger', 'm-03')`,
  `INSERT INTO AI_ROLE_ASSIGNMENTS (ROLE_NAME, MODEL_ID) VALUES ('Bulk', 'm-04')`
];

async function run() {
  let connection;
  try {
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    connection = await oracledb.getConnection(dbConfig);
    console.log("Connected to Oracle Database!");
    
    for (const sql of sqls) {
      try {
        await connection.execute(sql);
        console.log(`Success: ${sql.substring(0, 50)}...`);
      } catch (err) {
        if (err.message.includes('ORA-00955') || err.message.includes('ORA-00001')) {
          console.log(`Exists (Skipped): ${sql.substring(0, 30)}...`);
        } else {
          console.error(`Error: ${err.message}`);
        }
      }
    }
    
    await connection.commit();
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("DB Error: ", err.message);
  } finally {
    if (connection) await connection.close();
  }
}

run();
