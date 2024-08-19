const OpenAI = require('openai');
const Groq = require('groq-sdk');
const axios = require('axios');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31'
    }
});

module.exports = { openai, groq, axios, pool, anthropic };