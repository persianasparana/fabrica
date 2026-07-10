/** Aplica o schema (idempotente) e sai. Uso: npm run migrate */
import 'dotenv/config';
import { migrate, pool } from '../src/db.js';

await migrate();
console.log('Schema aplicado com sucesso.');
await pool.end();
