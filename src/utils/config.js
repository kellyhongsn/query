const OpenAI = require('openai');
const Groq = require('groq-sdk');
const axios = require('axios');
const { Pool } = require('pg');
const anthropic = require('@anthropic-ai/sdk');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
});

const anthropic = new anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

module.exports = { openai, groq, axios, pool, anthropic };