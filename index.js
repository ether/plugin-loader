const express = require('express')
const app = express()
const { spawn } = require('child_process');

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const PORT = process.env.PORT || 5001;

/**
 * @returns {Promise<JSON>}
 */
let getPluginData = async () => {
  const client = await pool.connect();
  const result = await client.query(`SELECT value FROM data WHERE id = 'plugins.full.json'`);
  client.release();
  return result.rows[0].value
}

app.get('/plugins.full.json', async (req, res) => {
  try {
    res.json(await getPluginData())
  } catch (err) {
    console.error(err);
    res.send("Error " + err);
  }
})

app.listen(PORT, () => {
  console.log(`Example app listening at http://localhost:${PORT}`)
})

const worker = spawn('node', ['worker.js']);
worker.stdout.on('data', function(data) {
  console.log('Worker: ' + data.toString().trim());
});

worker.stderr.on('data', function(data) {
  console.log('Worker error: ' + data.toString().trim());
});