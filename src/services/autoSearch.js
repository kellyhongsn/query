const { openai } = require('../utils/config');
const { groq } = require('../utils/config');
const { axios } = require('../utils/config');

let originalQuery = '';

const AUTO_SYSTEM_INSTRUCTION = `
Given the user's search query, perform the following steps:
1) Create a plan for the best way to search this
2) Construct the first search query to start with
`;

//simplify request down to keywords (llama), add site: operators
async function initialPass() {
    console.log("entered initial pass function");
    const INITIAL_INSTRUCTION = `
    Convert this search query into keywords that is interpretable by Google.
    Simply return the reformatted query.
    `;

    const chatCompletion = await groq.chat.completions.create({
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: INITIAL_INSTRUCTION },
          { role: "user", content: originalQuery }
        ],
        temperature: 0.2,
        max_tokens: 200,
    });
    let content = chatCompletion.choices[0].message.content.replace(/['"]/g, '');

    const finalResult = content + "site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi";

    console.log(finalResult);

    return finalResult;
}

//retrieve top 10 results
async function resultsRetrieval(searchQuery) {
    console.log("entered results retrieval");
    const data = JSON.stringify({
        "q": searchQuery
    });
    
    const config = {
        method: 'post',
        url: 'https://google.serper.dev/search',
        headers: { 
            'X-API-KEY': process.env.SERPER_API_KEY, 
            'Content-Type': 'application/json'
        },
        data : data
    };

    try {
        const response = await axios(config);
        return response.data.organic || [];
    } catch (error) {
        console.error('Error fetching search results:', error);
        return [];
    }
}

//reranker eval
async function rerankerEval(organicResults) {
    console.log("entered top 3");
    const data = {
        model: "jina-reranker-v1-turbo-en",
        query: originalQuery,
        top_n: 3,
        documents: organicResults.map(result => `${result.title} ${result.snippet}`)
      };
      
    try {
        const response = await axios.post('https://api.jina.ai/v1/rerank', data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.JINA_API_KEY}`
            }
        });

        console.log(response.data.results[0].relevance_score);

        const rerankedIndices = response.data.results.map(item => item.index);

        console.log("reranked");

        return [organicResults[rerankedIndices[0]], organicResults[rerankedIndices[1]], organicResults[rerankedIndices[2]]];

    } catch (error) {
        console.error('Error in reranking:', error);
        return results;
    }
}

//llm eval


//evaluate relevance of top 8 results, are there at least 2 highly relevant sources?

//get keywords from top research papers and redo search to get even more relevant results

//if inital results are not relevant, then split up query into smaller parts

//return 5 highly relevant sources

async function autoSearch(query) {
    originalQuery = query;

    firstQuery = await initialPass();

    results = await resultsRetrieval(firstQuery);

    //top_3_results = rerankerEval(results);

    return {
        searchPlan: "filler for now",
        firstQuery: firstQuery
    };
/*
    const chatCompletion = await openai.chat.completions.create({
        model: "gpt-4o-2024-08-06",
        messages: [
        {
            role: "system",
            content: AUTO_SYSTEM_INSTRUCTION
        },
        {
            role: "user",
            content: `Create a search plan and initial query for the following search task: ${query}`
        }
        ],
        response_format: {
        type: "json_schema",
        json_schema: {
            name: "search_plan_response",
            strict: true,
            schema: {
            type: "object",
            properties: {
                search_plan: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                    step: { type: "string" },
                    explanation: { type: "string" }
                    },
                    required: ["step", "explanation"],
                    additionalProperties: false
                }
                },
                initial_query: { type: "string" }
            },
            required: ["search_plan", "initial_query"],
            additionalProperties: false
            }
        }
        }
    });

    const result = JSON.parse(chatCompletion.choices[0].message.content);

    return {
        searchPlan: result.search_plan,
        firstQuery: result.initial_query
    };*/
}

module.exports = { autoSearch };