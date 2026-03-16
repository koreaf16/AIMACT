const oracledb = require('oracledb');
import dotenv from 'dotenv';
import path from 'path';

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
   VALUES ('m-01', 'Claude 4.6 Opus', 'claude-4.6-opus', 'claude --model opus', 'Architect', 'Architect persona...', '{}')`,
  `INSERT INTO AI_MODELS (MODEL_ID, NAME, MODEL_NAME, CLI_COMMAND, CONTEXT_STRATEGY, SYSTEM_PROMPT, CUSTOM_ENV) 
   VALUES ('m-02', 'Gemini 3.1 Pro', 'gemini-3.1-pro', 'gemini --model pro', 'Coder', 'Coder persona...', '{}')`,
  `INSERT INTO AI_MODELS (MODEL_ID, NAME, MODEL_NAME, CLI_COMMAND, CONTEXT_STRATEGY, SYSTEM_PROMPT, CUSTOM_ENV) 
   VALUES ('m-03', 'Codex 3.1', 'codex-3.1', 'codex --model 3.1', 'Debugger', 'Debugger persona...', '{}')`,
  `INSERT INTO AI_MODELS (MODEL_ID, NAME, MODEL_NAME, CLI_COMMAND, CONTEXT_STRATEGY, SYSTEM_PROMPT, CUSTOM_ENV) 
   VALUES ('m-04', 'Bulk (Ollama)', 'qwen3.5-27b', 'claude --model qwen3.5-27b', 'Bulk', 'Bulk persona...', '{"ANTHROPIC_BASE_URL":"http://192.168.0.3:11434"}')`,

  // Initial Role Assignments
  `INSERT INTO AI_ROLE_ASSIGNMENTS (ROLE_NAME, MODEL_ID) VALUES ('Architect', 'm-01')`,
  `INSERT INTO AI_ROLE_ASSIGNMENTS (ROLE_NAME, MODEL_ID) VALUES ('Coder', 'm-02')`,
  `INSERT INTO AI_ROLE_ASSIGNMENTS (ROLE_NAME, MODEL_ID) VALUES ('Debugger', 'm-03')`,
  `INSERT INTO AI_ROLE_ASSIGNMENTS (ROLE_NAME, MODEL_ID) VALUES ('Bulk', 'm-04')`,

  // KNOWLEDGE_BASE
  `CREATE TABLE KNOWLEDGE_BASE (
      DOC_ID          VARCHAR2(500),
      MODULE_NAME     VARCHAR2(200),
      VERSION         NUMBER,
      CONTENT         CLOB,
      CONTENT_VECTOR  VECTOR(1024, FLOAT32),
      CHUNK_TYPE      VARCHAR2(50),
      TOKEN_COUNT     NUMBER,
      MODIFIED_BY     VARCHAR2(50),
      CHANGE_REASON   VARCHAR2(1000),
      WORKSPACE_PATH  VARCHAR2(500),
      IS_LATEST       CHAR(1) DEFAULT 'Y',
      APPROVAL_STATUS VARCHAR2(20) DEFAULT 'APPROVED',
      CREATED_AT      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT PK_KB PRIMARY KEY (DOC_ID, MODULE_NAME, VERSION, WORKSPACE_PATH)
  )`,

  // WORKSPACE_CONFIG
  `CREATE TABLE WORKSPACE_CONFIG (
      WORKSPACE_PATH  VARCHAR2(500) PRIMARY KEY,
      PROJECT_NAME    VARCHAR2(200) NOT NULL,
      DESCRIPTION     VARCHAR2(1000),
      WATCH_PATTERNS  VARCHAR2(1000) DEFAULT '**/*.{ts,tsx,js,jsx,json,sql,md}',
      IGNORE_PATTERNS VARCHAR2(1000) DEFAULT 'node_modules/**,dist/**,.git/**',
      CREATED_AT      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `INSERT INTO WORKSPACE_CONFIG (WORKSPACE_PATH, PROJECT_NAME) VALUES ('C:\\AIMACT', 'AI-MACT Project')`,

  // CHAT_SESSIONS
  `CREATE TABLE CHAT_SESSIONS (
      SESSION_ID      VARCHAR2(50)   PRIMARY KEY,
      WORKSPACE_PATH  VARCHAR2(500)  NOT NULL,
      TITLE           VARCHAR2(500)  DEFAULT '새 대화',
      LAST_ROLE       VARCHAR2(50)   DEFAULT 'Architect',
      IS_PINNED       CHAR(1)        DEFAULT 'N',
      CREATED_AT      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT FK_CS_WS FOREIGN KEY (WORKSPACE_PATH) REFERENCES WORKSPACE_CONFIG(WORKSPACE_PATH)
  )`,

  // CHAT_MESSAGES
  `CREATE TABLE CHAT_MESSAGES (
      MESSAGE_ID   VARCHAR2(50)   PRIMARY KEY,
      SESSION_ID   VARCHAR2(50)   NOT NULL,
      ROLE         VARCHAR2(20)   NOT NULL,
      AGENT_ROLE   VARCHAR2(50),
      CONTENT      CLOB,
      CREATED_AT   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT FK_CM_SESSION FOREIGN KEY (SESSION_ID) REFERENCES CHAT_SESSIONS(SESSION_ID) ON DELETE CASCADE
  )`
];

async function run() {
  let connection;
  try {
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    connection = await oracledb.getConnection(dbConfig);
    console.log("Connected to Oracle Database successfully!");
    
    for (const sql of sqls) {
      try {
        console.log(`Executing: ${sql.substring(0, 80).replace(/\n/g, ' ')}...`);
        await connection.execute(sql);
      } catch (err: any) {
        if (err.message.includes('ORA-00955') || err.message.includes('ORA-00001')) {
          console.log(`Table/Data already exists, skipping.`);
        } else {
          console.error(`Error: ${err.message}`);
        }
      }
    }
    
    await connection.commit();
    console.log("Database initialized.");
  } catch (err: any) {
    console.error("DB Error: ", err.message);
  } finally {
    if (connection) await connection.close();
  }
}

run();
