const { performSearch } = require('../webScraping');

async function testWebScraper(query) {
  try {
    console.log(`Searching for: "${query}"`);
    const results = await performSearch(query);
    
    console.log(`Found ${results.length} results:\n`);
    
    results.forEach((result, index) => {
      console.log(`Result ${index + 1}:`);
      console.log(`Title: ${result.title}`);
      console.log(`Link: ${result.link}`);
      console.log(typeof(result.link))
      console.log(`Snippet: ${result.snippet}`);
      console.log('---');
    });
  } catch (error) {
    console.error('Error testing web scraper:', error);
  }
}

const searchQuery = 'research papers on combining reasoning and action in llm agents';

testWebScraper(searchQuery);