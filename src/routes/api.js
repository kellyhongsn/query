const express = require('express');
const router = express.Router();
const { reformatQuery } = require('../services/reformatQuery');
const { findSimilar } = require('../services/findSimilar');
const { autoSearch } = require('../services/autoSearch');

router.post('/reformat-query', async (req, res) => {
  const { query, date } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const advancedQuery = await reformatQuery(query, date);
    res.json({ advancedQuery });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing the query' });
  }
});

router.post('/find-similar', async (req, res) => {
  const { originalQuery, textChunk, currentTitle } = req.body;
  
  if (!textChunk) {
    return res.status(400).json({ error: 'textChunk is required' });
  }

  try {
    const fullResponse = await findSimilar(originalQuery, textChunk, currentTitle);
    res.json({ fullResponse });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing the find similar request' });
  }
});

router.get('/auto-search', async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    await autoSearch(query, res);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred during auto search processing' });
  }
});

module.exports = router;