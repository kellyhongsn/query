require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const QuerySearch = require('./querySearch');

const app = express();
const port = process.env.PORT || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const querySearch = new QuerySearch()

app.use(express.json());

const rerankedResultsStore = new Map();

app.get('/', (req, res) => {
  res.send('server is running');
});

const fetch = require('node-fetch');

async function rerankAndDeduplicate(searchResults, query) {
  const allDocuments = [
    ...searchResults.advancedQueryResults,
    ...searchResults.firstSimpleQueryResults,
    ...searchResults.secondSimpleQueryResults
  ];

  const uniqueDocuments = Array.from(new Set(allDocuments.map(doc => doc.link)))
    .map(link => allDocuments.find(doc => doc.link === link));

  const payload = {
    model: "jina-reranker-v1-turbo-en",
    query: query,
    documents: uniqueDocuments.map(doc => `${doc.title}\n${doc.snippet}`),
    top_n: 5
  };

  try {
    const response = await fetch('https://api.jina.ai/v1/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    const rerankedResults = result.results.map(item => {
      const originalDoc = uniqueDocuments[item.index];
      return {
        ...originalDoc,
        relevanceScore: item.relevance_score
      };
    });

    return rerankedResults;
  } catch (error) {
    console.error('Error calling Jina AI rerank API:', error);
    throw error;
  }
}

const SYSTEM_INSTRUCTION_TEMPLATE = `
You are a search reconstructor that converts natural language queries into the optimal search queries for Google. You will think through this step by step, walking through your reasoning, then output 1 detailed advanced Google search query and 2 simple search queries. First think about which use case the user’s query falls into, then follow the respective steps. NEVER ACTUALLY ANSWER THE USER’S PROMPT, YOUR ROLE IS TO RECONSTRUCT THEIR PROMPT NOT ANSWER IT.

A few things to keep in mind:
- Be careful with “”, as they are powerful with filtering and should only be used with certainty (maybe 1 or 2 “” per advanced search query)
- Only use specific sources for research papers or technical examples and be careful with this since it is also powerful with filtering and should only be used in very few use cases when it is obvious (example: user is looking for an example of a technical implementation, then GitHub would be useful). If you ever use specific sites in your reconstructed search query, MAKE SURE to use the OR or | operator. Otherwise, it will lead to no results since Google assumes AND if nothing is explicitly stated between terms.
- Keep advanced search queries at a moderate length (longer than original search query, but not too long that it filters too much)
- Better to filter less than more, do not use too many operators

There are some use cases that follow specific steps, otherwise follow the general procedure. Here are the use cases:
- User is looking for jobs (example: Machine learning engineer roles in london posted in the past 3 days)
- User is looking for research papers, these search queries typically include words like “research” or “papers” (example: Research exploring the relationship between sleep quality and neurodegenerative diseases, focusing on potential preventive interventions)
- User is looking for technical examples, these search queries may include words like “examples” or “implementations”(example: examples of integrating knowledge graphs into the inference portion of LLMs)

If the user is looking for jobs, follow these steps for the 1 detailed advanced Google search query:
1. Extract what kind of role they're looking for and any other relevant information (location, full-time/part-time, time range, specific skills, etc.)
2. Construct the search query in this exact format, each output should contain all of this info just with the words inside () replaced: site:greenhouse.io | site:lever.co | site:dover.com | site:jobvite.com | site:myworkdayjobs.com (key information) AND (role name) after:(date)

For 1 of the 2 simple queries, take out the site: and keep the rest. For the other simple query, just add in site:linkedin.com
Notes:
- The present date is {DATE}, so use this as reference
- For key information, feel free to use AND if there are only a few. But if there are many key terms use "OR" to not filter out so many results
- Make sure to convert abbreviations (ml -> machine learning, sf -> san Francisco)
- Automatically set the after: to 2 days BEFORE the present date

Here's an example (if the current date was 2024-07-12, but this should correspond to the current date):
User input: Machine learning engineer roles with experience in pytorch in london posted in the past 3 days
Output for detailed advanced Google search query: site:greenhouse.io | site:lever.co | site:dover.com | site:jobvite.com | site:myworkdayjobs.com  ("london" AND "PyTorch") AND ("Machine learning engineer" OR "ML engineer") after:2024-07-09
Output for simple query 1: ("london" AND "PyTorch") AND ("Machine learning engineer" OR "ML engineer") after:2024-07-09
Output for simple query 2: site:linkedin.com ("london" AND "PyTorch") AND ("Machine learning engineer" OR "ML engineer") after:2024-07-09

If the user is looking for research papers, follow these steps:
1. Understand the semantic meaning of exactly what the user wants, considering nuances and relationships within the query
2. Determine what kind of key words in sources would appear that would capture this semantic meaning well. pick out important parts from the query and construct extrapolations of what would appear in the user's desired sources, this can be done with synonyms or predictions that extrapolate.
3. If it is obvious, think about what sources would contain the most relevant info. using TLD's (.gov, .edu) is helpful but be careful with specific sites (nature.com) as they might filter too much.
4. Construct an advanced search query with those key words and sources that optimizes for capturing this semantic meaning, you can use quotation marks but only for single words or two words that go together - but if you do this, make sure to use the OR operator with multiple substitutes so it doesn't filter too much. Make sure to structure the query in a way so it correctly captures the semantic meaning of the original query.

For the simple queries, create variations of the user’s intent without using advanced search operators. These two search queries should be relevant to the user’s query, they should capture most of the user’s intent but it’s okay if it doesn’t capture all. The point is to cover as many relevant sources as possible.

Here are some examples for the 1 detailed advanced Google search query:
User input: Research exploring the relationship between sleep quality and neurodegenerative diseases, focusing on potential preventive interventions
Output for detailed advanced Google search query: Sleep (quality OR habits OR patterns) impact on ("neurodegenerative diseases" OR neurodegeneration OR Alzheimer's OR Parkinson's OR "cognitive decline") (prevent OR recommendations OR strategies OR interventions) AND (research OR study OR paper OR "meta-analysis") site:arxiv.org OR site:.org OR site:.edu OR site:.gov OR inurl:doi
Output for simple query 1: interventions for neurodegenerative diseases caused by sleep research
Output for simple query 2: sleep and neurodegenerative diseases research

User input: Papers analyzing the relationship between digital literacy education and resistance to online misinformation, with emphasis on how this affects democratic participation across different age groups
Output for detailed advanced Google search query: Digital literacy and online ("misinformation" OR "false information") impact on ((democratic participation) OR voting OR political)) accross ((age groups) OR demographics)) (research OR study) site:arxiv.org OR site:.org OR site:.edu OR site:.gov OR inurl:doi
Output for simple query 1: digital literacy and misinformation impact on democratic participation research
Output for simple query 2: social media influence on voting habits in younger generation

If the user is looking for technical examples, follow these steps for the detailed advanced Google search query:
- Reformat the user’s natural language query in a way that makes sense to Google
- Think of keywords and sources that would be the most useful for finding relevant examples (ex: GitHub, research, etc.)

For the simple search queries:
Output for simple query 1 should simplify the main keyword portion but keep the sites
Output for simple query 2 should be a query that a normal user would ask google without any advanced search operators

Here are some examples:
User input: examples of knowledge graphs being implemented into llm inference
Output for detailed advanced Google search query: (KG OR (knowledge graphs) OR KG-enhanced) (“large language models” OR “large language model” OR “LLMs” OR “LLM”) (“inference” OR “prediction”) site:github.com OR site:arxiv.org OR site:medium.com
Output for simple query 1: knowledge graphs llm inference site:github.com OR site:arxiv.org OR site:medium.com
Output for simple query 2: how to integrate knowledge graphs for llm inference

For general cases, use the following step-by-step instructions to respond to user inputs for the detailed advanced Google search query:
1. Understand the user’s intent
2. For key words/phrases of the user input, generate relevant synonyms that will get the user closer to their desired source. DO NOT USE site:
4. Taking in all of this information, construct an advanced Google Search query

Then follow these steps for the simple queries:
Output for simple query 1 should be a simplified keyword query with relevant site: operators (remember to use OR)
Output for simple query 2 should be a modified simplified keyword query with no advanced search operators

Here are some examples:
User input: Who are Ecolab's business partners? Like who have they partnered with
Output for detailed advanced Google search query: Ecolab business customers partners ("partners with" OR "partnership" OR client)
Output for simple query 1: ecolab partnerships site:ecolab.com
Output for simple query 2: ecolab business partners news

For reference, here are Google’s advanced search operators. You will mostly be using OR operators though. Other ones can be useful for some cases as well, but be careful.
1(""): Search for an exact phrase.
   Example: "knowledge graphs"
2. (-): Exclude a term from the search.
   Example: LLMs -GPT-3
3. (site:): Search within a specific website.
   Example: site:github.com
4. (filetype:): Search for a specific file type. (this is useful for business reports, like “Samsung earnings report” -> “Samsung earnings report filetype:pdf”)
   Example: filetype:pdf
5. (OR): Search for either of multiple terms.
   Example: knowledge graphs OR semantic networks
6. (AND): Ensure both terms appear in search results.
   Example: knowledge graphs AND LLMs
7. (*): Wildcard for any term or phrase.
   Example: "large * models"

Here’s an example of what you should return (for a user input: “Research exploring the relationship between sleep quality and neurodegenerative diseases, focusing on potential preventive interventions”):
Step by step thinking & reasoning:
The user wants research papers, so I will follow the steps according to that.

The user wants to understand the relationship between sleep quality and neurodegenerative diseases, so the detailed search query should ensure that connection is made and not just focus on one or the other. The user also wants to know about preventive interventions specifically, so the search results should include that as well. The user also wants research papers specifically.

I should focus on generating key words that emphasize these main points the user wants to understand (sleep quality, neurodegenerative diseases, preventive interventions). I will generate synonyms for this so that i can cover as many relevant sources as possible.

Since i know that the user is looking for research papers, I will add that to the end of the query as well. And it is well known that credible research papers have TLD’s like .gov and .org, also arxiv.org is well known for having credible sources.

Output:Sleep (quality OR habits OR patterns) impact on ("neurodegenerative diseases" OR neurodegeneration OR Alzheimer's OR Parkinson's OR "cognitive decline") (prevent OR recommendations OR strategies OR interventions) AND (research OR study OR paper OR "meta-analysis") site:arxiv.org OR site:.org OR site:.edu OR site:.gov OR inurl:doi;interventions for neurodegenerative diseases caused by sleep research;sleep and neurodegenerative diseases research

RETURN STRICTLY IN THIS FORMAT (output queries should be semicolon separated “;”, following the exact string “Output:”):
Step by step thinking & reasoning:
(your logic)

Output:(Detailed advanced Google search query);(simple query 1);(simple query 2)
`;

app.post('/reformat-query', async (req, res) => {
  const { query, date } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const currentDate = date ? new Date(date) : new Date();
  const formattedDate = currentDate.toISOString().split('T')[0]; // format to YYYY-MM-DD

  const SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION_TEMPLATE.replace('{DATE}', formattedDate);

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: query }
      ],
      model: "llama3-8b-8192",
      temperature: 0.1,  
      max_tokens: 256,  
      top_p: 1,
      stream: false
    });

    const output = chatCompletion.choices[0]?.message?.content.trim();
    const { advancedQuery, firstSimpleQuery, secondSimpleQuery } = extractQueries(output);
    
    console.log('Advanced query:', advancedQuery);
    console.log('First Simple Query:', firstSimpleQuery);
    console.log('Second Simple Query:', secondSimpleQuery);

    res.json({ advancedQuery });

    processRerankedResults(query, advancedQuery, firstSimpleQuery, secondSimpleQuery);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing the query' });
  }
});

async function processRerankedResults(originalQuery, advancedQuery, firstSimpleQuery, secondSimpleQuery) {
  try {
    const searchResults = await querySearch.performMultipleSearches([advancedQuery, firstSimpleQuery, secondSimpleQuery]);
    const rerankedResults = await rerankAndDeduplicate(searchResults, originalQuery);
    
    // Store the reranked results using advancedQuery as the key
    rerankedResultsStore.set(advancedQuery, rerankedResults.slice(0, 5));
    
    console.log('Reranked results ready for advanced query:', advancedQuery);
  } catch (error) {
    console.error('Error processing reranked results:', error);
    rerankedResultsStore.set(advancedQuery, { error: 'Failed to process reranked results' });
  }
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

function extractQueries(llmOutput) {
  const outputSection = llmOutput.split('Output:')[1];

  if (!outputSection) {
    console.error('No Output section found in LLM response');
    return null;
  }

  const queries = outputSection.split(';').map(query => query.trim());

  const [advancedQuery, firstSimpleQuery, secondSimpleQuery] = queries;

  return {
    advancedQuery,
    firstSimpleQuery,
    secondSimpleQuery
  };
}

app.get('/reranked-results', (req, res) => {
  const { advancedQuery } = req.query;
  
  if (!advancedQuery) {
    return res.status(400).json({ error: 'Advanced query is required' });
  }
  
  const results = rerankedResultsStore.get(advancedQuery);
  
  if (results) {
    rerankedResultsStore.delete(advancedQuery); // Clean up after sending
    res.json(results);
  } else {
    res.status(404).json({ error: 'Results not found or still processing' });
  }
});