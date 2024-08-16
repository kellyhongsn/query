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
    /*
    const INITIAL_INSTRUCTION = `
    You are a helpful assistant that can help the user find information on a topic.
    You will be given a query in natural language, and you will return a search query that is a simplified version that captures keywords.
    `;

    const INPUT = `
    Here is the user's query: ${originalQuery}
    Simplified version:
    `;

    const chatCompletion = await groq.chat.completions.create({
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: INITIAL_INSTRUCTION },
          { role: "user", content: INPUT }
        ],
        temperature: 0.2,
        max_tokens: 200,
    });
    let content = chatCompletion.choices[0].message.content.replace(/['"]/g, '');
*/
    const finalResult = originalQuery + " site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi";

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

//llm eval, are there at least 2 highly relevant sources?
async function llmEval(organicResults) {
    const LLM_EVAL_INSTRUCTION = `
    Given these search results, determine whether there are highly relevant sources that a human would click on.
    Consider the content of the results (title and snippet), as well as the source credibility.
    Think through this in steps, then provide a structured output indicating whether highly relevant and credible sources exist, and if so, their positions.
    `;

    // Format the organic results as specified
    const MESSAGE_INPUT = organicResults.map(result => 
        `-
        "title": "${result.title}",
        "link": "${result.link}",
        "snippet": "${result.snippet}",
        "position": ${result.position}
        -`
    ).join('\n');

    const chatCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: LLM_EVAL_INSTRUCTION },
            { role: "user", content: MESSAGE_INPUT }
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: {
            type: "json_object",
            schema: {
                type: "object",
                properties: {
                    relevantSourcesExist: {
                        type: "boolean",
                        description: "Indicates whether highly relevant and credible sources exist"
                    },
                    relevantPositions: {
                        type: "array",
                        items: {
                            type: "integer"
                        },
                        description: "Array of positions corresponding to highly relevant and credible sources"
                    }
                },
                required: ["relevantSourcesExist", "relevantPositions"]
            }
        }
    });

    const result = JSON.parse(chatCompletion.choices[0].message.content);

    if (!result.relevantSourcesExist) {
        //split up query and repeat process
    }

    return result;

}

//get keywords from top research papers and redo search to get even more relevant results
async function secondIteration(rerankedResults) {

    console.log("entered second iteration");

    //extract text chunk from each reranked result, 4000 characters
    async function extractTextFromResult(result) {
        console.log("extracting text from result function");

        try {
            const response = await axios.get(`https://r.jina.ai/${result.link}`);
            const html = response.data;
    
            const startIndex = html.indexOf("Markdown Content:") + "Markdown Content:".length;
    
            if (startIndex === -1) {
                throw new Error('Markdown Content not found');
            }
    
            const markdownContent = html.substring(startIndex).trim();
    
            const first4000Chars = markdownContent.substring(0, 4000);
    
            console.log(first4000Chars.substring(0,100));
            return first4000Chars;
    
        } catch (error) {
            console.error('Error extracting content:', error);
            return `${result.title} ${result.snippet}`;
        }
    }

    function removeResults(resultsArray) {
        const uniqueIdentifiers = new Set();
        
        const uniqueResults = resultsArray.flatMap(innerArray => {
            if (Array.isArray(innerArray.organic)) {
                return innerArray.organic;
            } else if (Array.isArray(innerArray)) {
                return innerArray;
            }
            return []; 
        }).filter(item => {
            if (item && typeof item === 'object' && item.title && item.link) {
                const identifier = `${item.title.toLowerCase()}|${item.link.toLowerCase()}`;
                
                if (uniqueIdentifiers.has(identifier)) {
                    return false;
                } else {
                    uniqueIdentifiers.add(identifier); 
                    return true; 
                }
            }
            return false; // Filter out items without title or link
        });
    
        return uniqueResults;
    }

    console.log('rerankedResults:', rerankedResults);

    const textChunks = await Promise.all(rerankedResults.map(extractTextFromResult));

    const specificQueries = await Promise.all(textChunks.map(constructSpecificQuery));

    console.log(specificQueries);

    const specificResults = await Promise.all(specificQueries.map(resultsRetrieval));

    console.log(specificResults);

    const cleanedResults = removeResults(specificResults);

    console.log(cleanedResults);

    return rerankerEval(cleanedResults);
}

async function constructSpecificQuery(textChunk) {
    console.log("entered construct specific query function");

    SPECIFIC_INSTRUCTION = `
    Given that the user wants to find ${originalQuery}, and they have found a relevant source, construct a more specific search query that will retrieve more relevant and specific results.
    The user's input will be a text chunk from the source they deem as relevent.
    Ensure that the new search query maintains the user's intent, but makes it more specific so it will return different results than the initial general search.

    Simply return the search query that can be inputted into Google search.
    `;

    const chatCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
        { role: "system", content: SPECIFIC_INSTRUCTION },
        { role: "user", content: textChunk }
        ],
        temperature: 0.2,
        max_tokens: 200,
    });

    const specificQuery = chatCompletion.choices[0].message.content + " site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi";

    console.log(specificQuery);

    return specificQuery;
}

//if inital results are not relevant, then split up query into smaller parts

//return 5 highly relevant sources

async function autoSearch(query, res) {
    
    originalQuery = query;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const sendUpdate = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const firstQuery = await initialPass(query);
        sendUpdate('firstQuery', { query: firstQuery });

        const results = await resultsRetrieval(firstQuery);
        sendUpdate('initialResults', { initialResults: results });

        const top_3_results = await rerankerEval(results);
        sendUpdate('topResults', { topResults: top_3_results });

        const more_results = await secondIteration(top_3_results);
        sendUpdate('finalResults', { finalResults: more_results });

        res.write('event: close\ndata: done\n\n');
        res.end();
    } catch (error) {
        console.error('Error in autoSearch:', error);
        sendUpdate('error', { message: 'An error occurred during search' });
        res.end();
    }
}
/*
    firstQuery = await initialPass();

    results = await resultsRetrieval(firstQuery);

    top_3_results = await rerankerEval(results);

    more_results = await secondIteration(top_3_results);

    return {
        searchPlan: "filler for now",
        firstQuery: firstQuery
    };
}*/

module.exports = { autoSearch };