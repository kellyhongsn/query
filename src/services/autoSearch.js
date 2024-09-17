const { openai } = require('../utils/config');
const { groq } = require('../utils/config');
const { axios } = require('../utils/config');
const { anthropic } = require('../utils/config');
const { performSearch } = require('./webScraping');
const { depthSearch } = require('./depthSearch');

let originalQuery = '';
let currentResults = new Set();
let queryCategory = 3;

//classify query: 0 = research paper, 1 = technical search, 2 = supportive evidence for argumentative paper, 3 = general search
async function classifyQuery(query) {
    console.log("entered classifyQuery function");

    data = {
        "inputs": query,
        "parameters": {}
    }
	const response = await fetch(
		"https://x8nqx5sqlkvqafjb.us-east-1.aws.endpoints.huggingface.cloud", //custom fine-tuned DistilBERT inference endpoint
		{
			headers: { 
				"Accept" : "application/json",
				"Authorization": "Bearer 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",
				"Content-Type": "application/json" 
			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);

	const result = await response.json();
	return parseInt(result.category);
}

//performs depth search on top 2 results
async function performDepthSearch(link, query) {
    //call depthSearch with link and query

    //with returned list of queries from depthSearch, perform results retrieval on them

    //similar to how we do it in rerankRetrieveUpdate:
    //call secondLLMEval on these to get reranked results
    //do something like: const uniqueResults = addUniqueResults(results.filter(result => structuredResult.relevantPositions.includes(result.position)));
    //and return these results

}

//retrieve top 7 results
async function resultsRetrieval(searchQuery) {
    console.log("entered results retrieval");
    
    try {
        const results = await performSearch(searchQuery);
        
        console.log(`Found ${results.length} results:\n`);

        return results || []; //contains position, title, link, snippet
    } catch (error) {
        console.error('Error fetching search results:', error);
        return [];
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

    const toolUseResponse = response.content.find(content => content.type === 'tool_use');

    if (!toolUseResponse) {
        throw new Error('No tool use response found');
    }

    const structuredResult = toolUseResponse.input;

    return structuredResult;

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
    `;

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

    console.log(`Time taken: ${(end_time - start_time) / 1000} seconds`); //testing latency

    const toolUseResponse = response.content.find(content => content.type === 'tool_use');

    if (!toolUseResponse) {
        throw new Error('No tool use response found');
    }

    const structuredResult = toolUseResponse.input;

    return structuredResult;

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

    queryCategory = await classifyQuery(originalQuery); 

    console.log(queryCategory);
    
    if (queryCategory == undefined) {
        queryCategory = 3;
    }

    const getSiteOperators = (queryCategory) => {
        switch (queryCategory) {
          case 0:
            return "site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi";
          case 1:
            return "site:arxiv.org | site:github.com | site:stackoverflow.com | site:medium.com | site:kaggle.com | site:towardsdatascience.com | site:paperswithcode.com | site:huggingface.co";
          case 2: 
            return "site:nytimes.com | site:wsj.com | site:reuters.com | site:bbc.com | site:economist.com | site:.edu | site:.gov | site:.org";
          default:
            return "";
        }
      };

    try {
        const siteOperators = getSiteOperators(queryCategory);
        const firstQuery = originalQuery + (siteOperators ? ` ${siteOperators}` : "");
        sendUpdate('firstQuery', { query: firstQuery });

        const initialResults = await resultsRetrieval(firstQuery);
        sendUpdate('initialResults', { initialResults: initialResults });

        const structuredResultInitial = await llmEval(initialResults);
        const relevantResults = initialResults.filter(result => structuredResultInitial.relevantPositions.includes(result.position));
        sendUpdate('topResults', { topResults: relevantResults });

        const topTwoResults = relevantResults.slice(0, 2);
        for (const result of topTwoResults) {
            const depthSearchResults = await performDepthSearch(result.link, originalQuery);
            sendUpdate('depthSearchResults', { depthSearchResults });
        }

        relevantResults.forEach(result => currentResults.add(result));

        const siteResults = await resultsRetrieval(firstQuery);
        
        const structuredResultSite = await llmEval(siteResults);
        const relevantResultsSite = siteResults.filter(result => structuredResultSite.relevantPositions.includes(result.position));
        relevantResultsSite.forEach(result => currentResults.add(result));
        sendUpdate('topResultsSite', { topResultsSite: relevantResultsSite }); //add to content
        sendUpdate('additionalQueries', { additionalQueries: structuredResultSite.additionalQueries });

        for (query of structuredResultSite.additionalQueries) {
            const { relevantResults } = await retrieveRerankUpdate(query, structuredResultSite.additionalInformationNeeded);
            sendUpdate('relevantResults', { relevantResults: relevantResults });
        }
        
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