const { openai } = require('../utils/config');
const { groq } = require('../utils/config');
const { axios } = require('../utils/config');
const { anthropic } = require('../utils/config');
let originalQuery = '';
let currentResults = new Set();
let queryCategory = 1;
  
async function classifyQuery(query) {
    const CLASSIFICATION_INSTRUCTION = `
    You are an AI assistant specialized in classifying user queries into one of three categories: research paper, technical example, or other general search.
    Your task is to analyze the user's query and determine which category it belongs to, giving a number (0, 1, 2) as output.
    Use the classify_query tool to classify the query.
    `;

    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        tools: [
            {
                name: "classify_query",
                description: "Classify the query into one of three categories",
                input_schema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "integer",
                            description: "Number corresponding to query category: research paper (0), technical example (1), or some other general search (2)"
                        }
                    },
                    required: ["category"]
                }
            }
        ],
        system: [
            { type: "text", text: CLASSIFICATION_INSTRUCTION }
        ],
        messages: [
            {
                role: "user",
                content: `Given this query: "${query}", determine whether the user is looking for a research paper (0), technical example (1), or some other general search (2). Give the corresponding number (0, 1, 2) as your output.`
            }
        ],
        max_tokens: 100
    });

    // Extract the tool use response
    const toolUseResponse = response.content.find(content => content.type === 'tool_use');

    if (!toolUseResponse) {
        throw new Error('No tool use response found');
    }

    const category = toolUseResponse.input.category;

    console.log(category);

    return category;
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
        return organicResults;
    }
}

function jsonToString(results) {
    console.log("entered json to string function");
    console.log(results);
    console.log(typeof results);

    if (results instanceof Set) {
        results = Array.from(results);
    }

    return results.map(result => 
        `-
        "title": "${result.title}",
        "link": "${result.link}",
        "snippet": "${result.snippet}",
        "position": ${result.position}
        -`
    ).join('\n');
}

async function llmEval(organicResults) {
    const LLM_EVAL_INSTRUCTION = `
    You are an AI assistant specialized in evaluating search results for relevance and credibility.
    Your task is to analyze queries and search results, then provide structured evaluations to guide further research.
    Use the provided tool to output your analysis. Be thorough and detailed in your evaluation.
    `;

    const USER_PROMPT_RESEARCH = `
    Analyze the following query and search results, then provide a structured evaluation using the evaluate_search_results tool:

    1. Query:
    <query>
    ${originalQuery}
    </query>

    2. Search Results:
    <search_results>
    ${jsonToString(organicResults)}
    </search_results>

    Follow these steps:
    1. Analyze the query:
    - Identify the main topic and key concepts
    - Consider the level of depth or expertise required to answer the query adequately

    2. Evaluate the search results for relevance and credibility
    - Assess the relevance of each result to the query
    - Consider the credibility of the sources (publishing journal, citations, etc.)
    - Look for indicators of accuracy and up-to-date information

    3. Identify the 3-5 most relevant sources that best address the user's query
    - Extract the positions of the most relevant sources

    4. Determine what additional information is needed, and provide additional queries to search on Google with that could fill the missing information
    - Identify any gaps in the information provided by the current search results
    - Consider what follow-up questions or searches might be necessary to fully address the user's query
    - List up to 2-3 additional queries that would be most helpful in addressing the gaps in the current search results
    - These queries should be designed for research papers specifically, so something along the lines of "research papers on _" or "findings on _"
    - These queries should be different enough from each other and from the initial search query to produce different results than the initial search

    Provide your analysis using the evaluate_search_results tool. Be thorough and detailed in each section of your analysis.
    `;

    const USER_PROMPT_TECHNICAL = `
    Analyze the following query and search results, then provide a structured evaluation using the evaluate_search_results tool:

    1. Query:
    <query>
    ${originalQuery}
    </query>

    2. Search Results:
    <search_results>
    ${jsonToString(organicResults)}
    </search_results>

    Follow these steps:
    1. Analyze the query:
    - Identify the main topic, specific implementation or technique, and any contextual keywords.
    - Consider the level of technical detail or expertise required to adequately address the query.

    2. Evaluate the search results for relevance and credibility:
    - Assess the relevance of each result based on how directly it addresses the technical implementation requested in the query.
    - Consider the credibility of the sources (e.g., recognized technical blogs, official documentation, reputable forums, and academic publications).
    - Look for clear explanations, code examples, or step-by-step guides that indicate practical usability.
    - Prioritize up-to-date information, especially for rapidly evolving fields.

    3. Identify the 3-5 most relevant sources that best address the user's query:
    - Extract the positions of the most relevant sources.

    4. Determine what additional information is needed and provide additional queries to search on Google with that could fill the missing information:
    - Identify any gaps in the information provided by the current search results.
    - Consider what follow-up questions or searches might be necessary to fully address the user's query.
    - List up to 2-3 additional queries that would be most helpful in addressing the gaps in the current search results.
    - These queries should be designed to find more detailed technical guides or examples, such as "how to implement x for (more specific subtopic)" or "example code for _".

    Provide your analysis using the evaluate_search_results tool. Be thorough and detailed in each section of your analysis.
    `;

    const USER_PROMPT_GENERAL = `
    Analyze the following query and search results, then provide a structured evaluation using the evaluate_search_results tool:

    1. Query:
    <query>
    ${originalQuery}
    </query>

    2. Search Results:
    <search_results>
    ${jsonToString(organicResults)}
    </search_results>

    Follow these steps:
    1. Analyze the query:
    - Identify the main topic and the intent behind the query
    - Consider the level of detail or specificity required to answer the query adequately.

    2. Evaluate the search results for relevance and credibility:
    - Assess the relevance of each result to the query, considering how well it addresses the user's intent.
    - Consider the credibility of the sources (e.g., well-known websites, expert authors, official pages).
    - Look for clear, accurate, and up-to-date information that meets the user's needs.
    - Consider the trustworthiness of the domain and the authority of the content creator.

    3. Identify the 3-5 most relevant sources that best address the user's query:
    - Extract the positions of the most relevant sources.

    4. Determine what additional information is needed and provide additional queries to search on Google with that could fill the missing information:
    - Identify any gaps in the information provided by the current search results.
    - Consider what follow-up questions or searches might be necessary to fully address the user's query.
    - List up to 2-3 additional queries that would be most helpful in addressing the gaps in the current search results.
    - These queries should be designed to produce complementary information or alternative perspectives on the topic.

    Provide your analysis using the evaluate_search_results tool. Be thorough and detailed in each section of your analysis.
    `;

    let USER_PROMPT = USER_PROMPT_GENERAL;

    if (queryCategory === 0) {
        USER_PROMPT = USER_PROMPT_RESEARCH;
    } else if (queryCategory === 1) {
        USER_PROMPT = USER_PROMPT_TECHNICAL;
    }

    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        tools: [
            {
                name: "evaluate_search_results",
                description: "Evaluate search results and provide structured output",
                input_schema: {
                    type: "object",
                    properties: {
                        relevantPositions: {
                            type: "array",
                            items: { type: "integer" },
                            description: "Array of positions corresponding to highly relevant and credible sources"
                        },
                        additionalQueries: {
                            type: "array",
                            items: { type: "string" },
                            description: "Additional queries to search on Google with that could fill the missing information"
                        }
                    },
                    required: ["relevantPositions", "additionalQueries"]
                }
            }
        ],
        system: [
            { type: "text", text: LLM_EVAL_INSTRUCTION }
        ],
        messages: [
            { 
                role: "user", 
                content: USER_PROMPT
            }
        ],
        max_tokens: 1400
    });

    // Extract the tool use response
    const toolUseResponse = response.content.find(content => content.type === 'tool_use');

    if (!toolUseResponse) {
        throw new Error('No tool use response found');
    }

    const structuredResult = toolUseResponse.input; // JSON object of relevantPositions, reasoningForChosenSources, additionalInformationNeeded, additionalQueries

    return structuredResult;

    /*
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
    });*/

}

async function secondLlmEval(results, missingInformation) {
    console.log("entered second llm eval function");
    const SECOND_LLM_EVAL_INSTRUCTION = `
    You are an AI assistant specialized in evaluating search results for relevance and credibility, with the aim to best fulfill the user's query.
    Use the provided tool to output your analysis. Be thorough and detailed in your evaluation.

    Given a user's original query, new search results, missing information we want to fill, your task is to:
    1. Determine what kind of sources would be most relevant, considering relevancy, accuracy, link credibility, and what missing information we want to fill with these sources.
    2. Identify the most relevant sources from the provided results.
    
    Provide your analysis in a structured format using the provided tools.
    `;//helpful to cache this?

    const INFO_INSTRUCTION = `
    Your task is to consider the user's original query, the current results we have collected so far, and which information we want to fulfill in order to evaluate a new set of search results.

    We have done one search so far, now you will be give a second iteration of results which are the search results of queries designd to fulfill the parts we are missing.

    You are optimizing to fulfill this original query from the user: ${originalQuery}

    We currently have: ${jsonToString(currentResults)}

    And we are missing: ${missingInformation}

    Follow these steps:
    1. Analyze the original query, current results, and missing information:
    - Identify the main topic and key concepts
    - Consider the level of depth or expertise required to answer the query adequately
    - Determine what kind of results would best fulfill the user's query, specifically targeting missing information

    2. Identify the 3-5 most relevant sources that best address the user's query and satisfies parts of the missing information
    - Assess the relevance of each result to the query
    - Consider the credibility of the sources
    - Look for indicators of accuracy and up-to-date information
    - Extract the positions of the most relevant sources

    Provide your analysis using the evaluate_second_results tool.
    `;

    // Format the organic results as specified
    const SEARCH_RESULTS = jsonToString(results);

    const start_time = performance.now();

    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        tools: [
            {
                name: "evaluate_second_results",
                description: "Evaluate search results and provide structured output",
                input_schema: {
                    type: "object",
                    properties: {
                        relevantPositions: {
                            type: "array",
                            items: { type: "integer" },
                            description: "Array of positions corresponding to highly relevant and credible sources"
                        }
                    },
                    required: ["relevantPositions"]
                }
            }
        ],
        system: [
            { 
                type: "text", 
                text: SECOND_LLM_EVAL_INSTRUCTION 
            },
            {
                type: "text",
                text: INFO_INSTRUCTION
            }
        ],
        messages: [
            { 
                role: "user", 
                content: `Here are the new search results to evaluate:\n${SEARCH_RESULTS}`
            }
        ],
        max_tokens: 1400
        }
    );

    const end_time = performance.now();

    console.log(`Time taken: ${(end_time - start_time) / 1000} seconds`);

    // Extract the tool use response
    const toolUseResponse = response.content.find(content => content.type === 'tool_use');

    if (!toolUseResponse) {
        throw new Error('No tool use response found');
    }

    const structuredResult = toolUseResponse.input; // JSON object of relevantPositions, reasoningForChosenSources

    return structuredResult;

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
            return false; 
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

    const specificQuery = chatCompletion.choices[0].message.content

    if (queryCategory === 0) {
        specificQuery = specificQuery + " site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi";
    }

    console.log(specificQuery);

    return specificQuery;
}


async function finalLLMEval() {
    const FINAL_LLM_EVAL_INSTRUCTION = `
    You are an AI assistant tasked with evaluating search results for relevance, accuracy, and credibility, mimicking how a human would select sources based on their search intent. 
    Your goal is to identify the most relevant search results that a user would likely click on.
    `;

    const USER_PROMPT = `
    Here is the user's original query: ${originalQuery}

    Here is the set of results to evaluate: ${jsonToString(currentResults)}

    Your task is to:
    1. Analyze the search query to understand the user's intent.
    2. Evaluate each search result for:
        a) Relevance to the search query
        b) Accuracy of information (based on your knowledge and the source's reputation)
        c) Credibility of the link (consider domain authority, source type, etc.)
    3. Consider which results a human user would be most likely to click on, given their probable intent.
        - get at least 10 results, and the position numbers that correspond to each
    4. Rank the most relevant results (their corresponding position numbers) in order of relevance.

    Remember, your goal is to mimic human behavior in selecting search results.

    Provide your analysis using the evaluate_final_results tool. Be thorough and thoughtful, thinking from the perspective of the user.
    `;

    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        tools: [
            {
                name: "evaluate_final_results",
                description: "Evaluate search results and provide structured output",
                input_schema: {
                    type: "object",
                    properties: {
                        relevantPositions: {
                            type: "array",
                            items: { type: "integer" },
                            description: "Array of positions corresponding to highly relevant and credible sources"
                        }
                    },
                    required: ["relevantPositions"]
                }
            }
        ],
        system: [
            { type: "text", text: FINAL_LLM_EVAL_INSTRUCTION }
        ],
        messages: [
            { 
                role: "user", 
                content: USER_PROMPT
            }
        ],
        max_tokens: 1400
    });

    // Extract the tool use response
    const toolUseResponse = response.content.find(content => content.type === 'tool_use');

    if (!toolUseResponse) {
        throw new Error('No tool use response found');
    }

    const structuredResult = toolUseResponse.input; // JSON object of relevantPositions, reasoningForChosenSources, additionalInformationNeeded
    
    const currentResultsArray = Array.from(currentResults);

    const finalResults = currentResultsArray.filter(result => structuredResult.relevantPositions.includes(result.position));

    console.log(finalResults);

    return finalResults;

}

function addUniqueResults(results) {
    const uniqueResults = [];
    results.forEach(result => {
        const identifier = `${result.title.toLowerCase()}|${result.link.toLowerCase()}`;
        if (!currentResults.has(identifier)) {
            currentResults.add(identifier);
            uniqueResults.push(result);
        }
    });
    return uniqueResults;
}

async function retrieveRerankUpdate(query, additionalInformationNeeded) {
    console.log("entered retrieve rerank update function");
    const results = await resultsRetrieval(query);
    console.log(results);
    console.log(typeof results);
    const structuredResult = await secondLlmEval(results, additionalInformationNeeded);
    const uniqueResults = addUniqueResults(results.filter(result => structuredResult.relevantPositions.includes(result.position)));
    
    return {
        relevantResults: uniqueResults
    };
}

async function autoSearch(query, res) {

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const sendUpdate = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    
    originalQuery = query;

    queryCategory = await classifyQuery(originalQuery); // 0 = research paper, 1 = technical example, 2 = general search

    try {
        if (queryCategory === 0) {
            // performing first search and evaluating results
            const firstQuery = originalQuery + " site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi";
            sendUpdate('firstQuery', { query: firstQuery });
    
            
            const results = await resultsRetrieval(firstQuery);
            sendUpdate('initialResults', { initialResults: results });
    
            const structuredResult = await llmEval(results);
            //sendUpdate('additionalInformationNeeded', { additionalInformationNeeded: structuredResult.additionalInformationNeeded });
            //sendUpdate('reasoningForChosenSources', { reasoningForChosenSources: structuredResult.reasoningForChosenSources });
            sendUpdate('additionalQueries', { additionalQueries: structuredResult.additionalQueries });
    
            const relevantResults = results.filter(result => structuredResult.relevantPositions.includes(result.position));
            sendUpdate('topResults', { topResults: relevantResults });
    
            
            relevantResults.forEach(result => currentResults.add(result));
    
            // performing second iteration of searches, evaluating those, then updating currentResults
            for (query of structuredResult.additionalQueries) {
                query = query + " site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi";
                const { relevantResults } = await retrieveRerankUpdate(query, structuredResult.additionalInformationNeeded);
                //sendUpdate('additionalQuery', {additionalQuery: query});
                //sendUpdate('allResults', { allResults: allResults });
                sendUpdate('relevantResults', { relevantResults: relevantResults });
            }
    /*
            //await Promise.all(additionalQueries.map(query => retrieveRerankUpdate(query, additionalInformationNeeded)));
    
            // final evaluation and sources to present to user
            const finalResults = await finalLLMEval();
            sendUpdate('finalResults', { finalResults: finalResults });;*/
    
    } else if (queryCategory === 1) {
        const initialResults = await resultsRetrieval(originalQuery);
        sendUpdate('initialResults', { initialResults: initialResults });

        const structuredResultInitial = await llmEval(initialResults);
        const relevantResults = initialResults.filter(result => structuredResultInitial.relevantPositions.includes(result.position));
        sendUpdate('topResults', { topResults: relevantResults });

        relevantResults.forEach(result => currentResults.add(result));

        const siteResults = await resultsRetrieval(originalQuery + " site:arxiv.org | site:github.com | site:stackoverflow.com | site:medium.com | site:kaggle.com | site:towardsdatascience.com | site:paperswithcode.com | site:huggingface.co");
        sendUpdate('firstQuery', { query: originalQuery + " site:arxiv.org | site:github.com | site:stackoverflow.com | site:medium.com | site:kaggle.com | site:towardsdatascience.com | site:paperswithcode.com | site:huggingface.co" });
        
        const structuredResultSite = await llmEval(siteResults);
        const relevantResultsSite = siteResults.filter(result => structuredResultSite.relevantPositions.includes(result.position));
        relevantResultsSite.forEach(result => currentResults.add(result));
        sendUpdate('topResultsSite', { topResultsSite: relevantResultsSite }); //add to content
        sendUpdate('additionalQueries', { additionalQueries: structuredResultSite.additionalQueries });

        for (query of structuredResultSite.additionalQueries) {
            const { relevantResults } = await retrieveRerankUpdate(query, structuredResultSite.additionalInformationNeeded);
            sendUpdate('relevantResults', { relevantResults: relevantResults });
        }

    } else {
        const initialResults = await resultsRetrieval(originalQuery);
        sendUpdate('initialResults', { initialResults: initialResults });

        const structuredResultInitial = await llmEval(initialResults);
        const relevantResults = initialResults.filter(result => structuredResultInitial.relevantPositions.includes(result.position));
        sendUpdate('topResults', { topResults: relevantResults });

        relevantResults.forEach(result => currentResults.add(result));

        for (query of structuredResultInitial.additionalQueries) {
            const { relevantResults } = await retrieveRerankUpdate(query, structuredResultInitial.additionalInformationNeeded);
            sendUpdate('relevantResults', { relevantResults: relevantResults });
        }

    }   
        // Clear currentResults for future searches
        currentResults.clear();
        console.log("Cleared currentResults for future searches")

        sendUpdate('done', { done: true });

        res.end();
    }
    catch (error) {
        console.error('Error in autoSearch:', error);
        sendUpdate('error', { message: 'An error occurred during search' });
        res.end();
    }
}

module.exports = { autoSearch };