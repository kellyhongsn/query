const { depthSearch } = require('../depthSearch');

async function testDepthSearch(link, query) {
    try {
      console.log(`Searching for: "${query}" within ${link}`);
      
      queries = depthSearch(link, query);
      console.log('queries retrieved');
      console.log(queries);
    } catch (error) {
      console.error('Error testing web scraper:', error);
    }
  }
  
  testDepthSearch("https://arxiv.org/abs/2306.05685", "research papers on llm eval");