const { performSearch } = require('../depthSearch');

async function testDepthSearch(link, query) {
    try {
      console.log(`Searching for: "${query}" within `);
      const results = await performSearch(query);
      
      console.log(`Found ${results.length} results:\n`);
      
      results.forEach((result, index) => {
        console.log(`Result ${index + 1}:`);
        console.log(`Title: ${result.title}`);
        console.log(`Link: ${result.link}`);
        console.log(`Snippet: ${result.snippet}`);
        console.log('---');
      });
    } catch (error) {
      console.error('Error testing web scraper:', error);
    }
  }
  
  testDepthSearch("https://arxiv.org/html/2312.10003v1", "research papers on combining reasoning and action in llm agents");