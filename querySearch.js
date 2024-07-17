import { GoogleSerperAPIWrapper } from "langchain/tools";
import { config } from 'dotenv';

config();

class QuerySearch {
  constructor() {
    this.serper = new GoogleSerperAPIWrapper({
      apiKey: process.env.SERPER_API_KEY
    });
  }

  async searchAndExtractResults(query) {
    try {
      const results = await this.serper.results(query);
      
      const extractedResults = results.organic.slice(0, 6).map(result => ({
        title: result.title,
        link: result.link,
        snippet: result.snippet
      }));

      return extractedResults;
    } catch (error) {
      console.error('Error in Serper search:', error);
      throw error;
    }
  }

  async performMultipleSearches(queries) {
    const searchPromises = queries.map(query => this.searchAndExtractResults(query));
    const results = await Promise.all(searchPromises);
    
    return {
      advancedQueryResults: results[0],
      firstSimpleQueryResults: results[1],
      secondSimpleQueryResults: results[2]
    };
  }
}

export default QuerySearch;