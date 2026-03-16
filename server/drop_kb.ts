const oracledb = require('oracledb');
import dotenv from 'dotenv';
import path from 'path';

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
    console.log("Connected to Oracle. Dropping KNOWLEDGE_BASE...");
    try {
        await connection.execute(`DROP TABLE KNOWLEDGE_BASE CASCADE CONSTRAINTS`);
        await connection.commit();
        console.log("Table KNOWLEDGE_BASE dropped successfully.");
    } catch (e) {
        console.log("Table did not exist or could not be dropped, skipping.");
    }
  } catch (err: any) {
    console.error("DB Error: ", err.message);
  } finally {
    if (connection) await connection.close();
  }
}

run();
