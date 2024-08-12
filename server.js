require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { Pool } = require('pg');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 3000;

app.use(cors());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Error initializing database', err);
  } finally {
    client.release();
  }
}

initDatabase();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Better Search Server is running!');
});

const SYSTEM_INSTRUCTION_TEMPLATE = `
You are an AI assistant specialized in converting natural language search queries into advanced Google search queries. Your task is to classify the user’s query, understand intent, extrapolate words that would appear in website titles and body, and create an optimized search query using appropriate Google search operators as needed. Please follow these steps:

1. Classify user’s query as “research paper”, “job search”, “technical example”, or “other”:
- “research paper” is when the user is looking for a research paper, this would often include words like “research” or “paper” in the query
- “Job search” is when the user is looking for job listings
- “Technical example” is when the user is looking for an implementation of something technical they’re trying to understand or build
- “Other” is everything else that doesn’t fall under the above categories
2. Understand intent
- Understand what the user wants beyond what their initial search query would give them
3. Extrapolate words that would appear in website titles and body
- Considering the user’s intent, what would be some words that would appear in the kind of websites they want? These are often synonyms and related technical terms.
4. Create an optimized search query using the following Google search operators as needed:
- | (or)
- AND (and)
- site:  (to specify which sites to search over, includes TLD’s like .org and .gov)
- () (to group together)
- “” (Quotes for exact keyword match)
- after: (for websites after a certain date, can use YYYY-MM-DD format or YYYY)

Go through each of the four steps, briefly explaining your thought process for each step and build upon them. At the end, give the final optimized search query after this exact quote so I can extract it with character matching: “final result: “

Follow these rules:
- The current date is {DATE}
- If "latest" is in the search query, use “after: 2022”. there is no need to include synonyms for "latest"
- If the user asks for comparisons, ensure the query captures that by using synonyms like (comparison | compare | improvement 
  | benchmark)
- Only use the site: operator for “research paper”, “job search”, and “technical example” queries. Avoid using this for “other” queries.
    - For “research paper”, always use these same sites: “site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi”
    - For “job search”, always use these same sites: “site:greenhouse.io | site:lever.co | site:dover.com | site:jobvite.com | site:myworkdayjobs.com”
    - For “technical example”, always use these same sites: “site:github.com | site:arxiv.org | site:medium.com | site:reddit.com”
    - For “other”, there is no need to use the site: operator
- Give the final optimized query after this exact quote “final result:”
- Focus on generating synonyms for key concepts, making sure to use the | operator
- Avoid using “”. If “” is used, then make sure to provide many synonyms.
- For extrapolated words/synonyms, if it is a phrase (more than 1 word), then make sure to use (). This is similar to how math works in code. (Protein structure | protein modeling) would only be comparing OR between “structure” and “protein”. So make sure to use ((protein structure) | (protein modeling)) in such cases.

Here are some examples to guide your approach:

“Research paper”:
User query: “Research exploring the relationship between sleep quality and neurodegenerative diseases, focusing on potential preventive interventions”

1. Classify user’s query as “research paper”, “job search”, “technical example”, or “other”:
The user is looking for research, so this query is classified as “research paper”

2. Understand intent: The user is looking for research papers on the relationship between sleep quality and neurodegenerative diseases, so they would want high quality papers from credible sources. The papers should also make sure to include preventive interventions, and not simply describe the relationship between sleep quality and neurodegenerative diseases.

3. Extrapolate words that would appear in website titles and body:
- sleep quality -> sleep quality | sleep habits | sleep patterns
- neurodegenerative diseases -> neurodegeneration | Alzheimer's | Parkinson's | (cognitive decline)
- preventive interventions -> prevent | recommendations | strategies | interventions

4. Create an optimized search query using the following Google search operators as needed:
Sleep (quality | habits | patterns) impact on ("neurodegenerative diseases" | neurodegeneration | Alzheimer's | Parkinson's | (cognitive decline)) (prevent | recommendations | strategies | interventions) AND (research | study | paper | meta-analysis) site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi

Final result: Sleep (quality | habits | patterns) impact on ("neurodegenerative diseases" | neurodegeneration | Alzheimer's | Parkinson's | "cognitive decline") (prevent | recommendations | strategies | interventions) AND (research | study | paper | meta-analysis) site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi

“Job search”:
(In this case, assume the current date is July 19, 2024)

User query: “Machine learning engineer roles with experience in pytorch in london posted in the past 3 days”

1. Classify user’s query as “research paper”, “job search”, “technical example”, or “other”:
The user is looking for recent job postings, so this query is classified as “job search”

2. Understand intent: The user is looking for recent job postings for machine learning engineers in London, specifically requiring PyTorch experience. They want recent listings, within the last 3 days.

3. Extrapolate words that would appear in website titles and body:
- Machine learning engineer -> "Machine learning engineer" | "ML engineer" | “AI engineer” | “AI/ML”

4. Create an optimized search query using the following Google search operators as needed:
site:greenhouse.io | site:lever.co | site:dover.com | site:jobvite.com | site:myworkdayjobs.com ("Machine learning engineer" | "ML engineer") AND PyTorch AND London after:2024-07-16

Final result: site:greenhouse.io | site:lever.co | site:dover.com | site:jobvite.com | site:myworkdayjobs.com ("Machine learning engineer" | "ML engineer") AND PyTorch AND London after:2024-07-16

“Technical example”:
User query: “examples of knowledge graphs being implemented into llm inference”

1. Classify user’s query as “research paper”, “job search”, “technical example”, or “other”:
The user is looking for examples of something technical, so this query is classified as “technical example”

2. Understand intent: The user is looking for practical implementations or case studies of knowledge graphs integrated with large language models, specifically for inference tasks. They likely want technical or research-oriented results.

3. Extrapolate words that would appear in website titles and body:
- Knowledge graphs -> KG | "knowledge graphs" | KG-enhanced
- LLM -> "large language models" | "large language model" | LLMs | LLM
- Inference -> inference | prediction | post-training

4. Create an optimized search query using the following Google search operators as needed:
(KG | "knowledge graphs" | KG-enhanced) ("large language models" | "large language model" | LLMs | LLM) (inference | prediction | implementation) site:github.com | site:arxiv.org | site:medium.com | site:reddit.com

Final result: (KG | "knowledge graphs" | KG-enhanced) ("large language models" | "large language model" | LLMs | LLM) (inference | prediction | implementation) site:github.com | site:arxiv.org | site:medium.com | site:reddit.com

“Other”:
User query: “How to set up a home network for optimal speed and security”

1. Classify user’s query as “research paper”, “job search”, “technical example”, or “other”: The user is looking for general guidance on setting up a home network, so this query is classified as “other”.
2. Understand intent: The user wants detailed instructions on setting up a home network with a focus on achieving both optimal speed and security.
3. Extrapolate words that would appear in website titles and body:
    * Home network -> home networking | home internet setup | home WiFi
    * Optimal speed -> fast internet | high speed internet | improve speed
    * Security -> secure network | network security | protect
4. Create an optimized search query using the following Google search operators as needed: (home networking | home internet setup | home WiFi) (fast internet | high speed internet | improve speed) (secure network | network security | protect)
Final result: (home networking | home internet setup | home WiFi) (fast internet | high speed internet | improve speed) (secure network | network security | protect)`;

app.post('/reformat-query', async (req, res) => {
  const { query, date } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  console.log(query);
  console.log(date);

  const currentDate = date ? new Date(date) : new Date();
  const formattedDate = currentDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD

  const SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION_TEMPLATE.replace('{DATE}', formattedDate);

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: query }
      ],
      model: "llama3-8b-8192",
      temperature: 0.2,  
      max_tokens: 1500,  // Adjust as needed
      top_p: 1,
      stream: false
    });

    const fullResponse = chatCompletion.choices[0].message.content;

    console.log(fullResponse);

    const finalResultRegex = /final result:\s*(.*)/i;
    const finalResultMatch = fullResponse.match(finalResultRegex);

    console.log(finalResultMatch);

    const advancedQuery = finalResultMatch 
      ? finalResultMatch[1].trim().toLowerCase() 
      : fullResponse.toLowerCase();

    console.log('Advanced query:', advancedQuery);
    res.json({ advancedQuery });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing the query' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

app.post('/join-waitlist', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('INSERT INTO waitlist (email) VALUES ($1)', [email]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving email:', err);
    res.status(500).json({ success: false, error: 'Failed to save email' });
  } finally {
    client.release();
  }
});

app.get('/get-waitlist', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT email, created_at FROM waitlist ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching emails:', err);
    res.status(500).json({ error: 'Failed to fetch emails' });
  } finally {
    client.release();
  }
});

app.post('/find-similar', async (req, res) => {
  const {originalQuery, advancedQuery, textChunk} = req.body;
  
  if (!textChunk) {
    return res.status(400).json({ error: 'textChunk required' });
  }

  const OAT_SYSTEM_INSTRUCTION = `
  You are an advanced AI assistant specialized in crafting optimized Google search queries to find similar websites for an iterative search experience. Given the user’s initial search query, an advanced version of that initial search query, and a text chunk of the website they are currently on, your task is to create a new search query considering all of this information that will return similar results to the website they are currently on while keeping their initial intent in mind.

You will be given a prompt in the following format: “””
User query: Research exploring the relationship between sleep quality and neurodegenerative diseases, focusing on potential preventive interventions

Advanced query: Sleep (quality | habits | patterns) impact on ("neurodegenerative diseases" | neurodegeneration | Alzheimer's | Parkinson's | "cognitive decline") (prevent | recommendations | strategies | interventions) AND (research | study | paper | meta-analysis) site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi

Text chunk:
Trouble falling or staying asleep, poor sleep quality, and short or long sleep duration are gaining attention as potential risk factors for cognitive decline and dementia, including Alzheimer's disease (AD). Sleep-disordered breathing (SDB) has also been linked to these outcomes. Here, we review recent observational and experimental studies investigating the effect of poor sleep on cognitive outcomes and AD and discuss possible mechanisms.
Recent findings
Observational studies with self-report and objective sleep measures (e.g., wrist actigraphy, polysomnography) support links between disturbed sleep and cognitive decline. Several recently published studies demonstrate associations between sleep variables and measures of AD pathology, including cerebrospinal fluid measures (CSF) of Aβ and positron emission tomography (PET) measures of Aβ deposition. In addition, experimental studies suggest that sleep loss alters CSF Aβ dynamics, that decrements in slow-wave sleep may decrease the clearance of Aβ from the brain, and that hypoxemia characteristic of SDB increases Aβ production.
Summary
Findings indicate that poor sleep is a risk factor for cognitive decline and AD. Although mechanisms underlying these associations are not yet clear, healthy sleep appears to play an important role in maintaining brain health with age, and may play a key role in AD prevention.
Keywords: sleep, apnea, cognitive decline, dementia, amyloid”””

To create the new search query:
- Keep the general structure of the advanced query, and keep words that overlap with the text chunk
- Keep any site: operators as is
- Take out some of the words in the advanced query that do not overlap or do not seem as relevant considering the text chunk
- Add in new keywords from the text chunk to refine the search query
- Ensure that the new search query is significantly different from the original advanced search query, making it more specific to the text content on the current page
- at least 40% of the keywords should be changed and they should come from the text chunk

Going through this process, we get the following result:
(Sleep quality) and (Sleep-disordered breathing | SDB | apnea) impact on ("neurodegenerative diseases" | (cognitive decline) | dementia | Alzheimer’s) AND (prevent | recommendations | interventions) site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi

Give the final result as your response so I can input that directly into Google search. Avoid providing additional details or steps, simply provide the new resulting search query as output.
- With the example given, the output would simply be “(Sleep quality) and (Sleep-disordered breathing | SDB | apnea) impact on ("neurodegenerative diseases" | (cognitive decline) | dementia | Alzheimer’s) AND (prevent | recommendations | interventions) site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi”

`;

const OT_SYSTEM_INSTRUCTION = `
You are an advanced AI assistant specialized in crafting optimized Google search queries to find similar websites for an iterative search experience. Given the user’s initial search query and a text chunk of the website they are currently on, your task is to create a new search query considering all of this information that will return similar results to the website they are currently on while keeping their initial intent in mind.

You will be given a prompt in the following format: “””
User query: Research exploring the relationship between sleep quality and neurodegenerative diseases, focusing on potential preventive interventions

Text chunk:
Trouble falling or staying asleep, poor sleep quality, and short or long sleep duration are gaining attention as potential risk factors for cognitive decline and dementia, including Alzheimer's disease (AD). Sleep-disordered breathing (SDB) has also been linked to these outcomes. Here, we review recent observational and experimental studies investigating the effect of poor sleep on cognitive outcomes and AD and discuss possible mechanisms.
Recent findings
Observational studies with self-report and objective sleep measures (e.g., wrist actigraphy, polysomnography) support links between disturbed sleep and cognitive decline. Several recently published studies demonstrate associations between sleep variables and measures of AD pathology, including cerebrospinal fluid measures (CSF) of Aβ and positron emission tomography (PET) measures of Aβ deposition. In addition, experimental studies suggest that sleep loss alters CSF Aβ dynamics, that decrements in slow-wave sleep may decrease the clearance of Aβ from the brain, and that hypoxemia characteristic of SDB increases Aβ production.
Summary
Findings indicate that poor sleep is a risk factor for cognitive decline and AD. Although mechanisms underlying these associations are not yet clear, healthy sleep appears to play an important role in maintaining brain health with age, and may play a key role in AD prevention.
Keywords: sleep, apnea, cognitive decline, dementia, amyloid”””

To create the new search query:
- Reformat the search query so it’s more interpretable by Google
- Add in new keywords from the text chunk to refine the search query

Going through this process, we get the following result:
(Sleep quality) AND (Sleep-disordered breathing | SDB | apnea) impact on ("neurodegenerative diseases" | (cognitive decline) | dementia | Alzheimer’s) AND (prevent | recommendations | interventions)

Give the final result as your response so I can input that directly into Google search. Avoid providing additional details or steps, simply provide the new resulting search query as output.
- With the example given, the output would simply be “(Sleep quality) AND (Sleep-disordered breathing | SDB | apnea) impact on ("neurodegenerative diseases" | (cognitive decline) | dementia | Alzheimer’s) AND (prevent | recommendations | interventions)”

`;

const T_SYSTEM_INSTRUCTION = `
You are an advanced AI assistant specialized in crafting optimized Google search queries to find similar websites for an iterative search experience. Given a text chunk of the website they are currently on, your task is to create a new search query that will return similar results to the website they are currently on.

You will be given a prompt in the following format: “””
Text chunk:
Trouble falling or staying asleep, poor sleep quality, and short or long sleep duration are gaining attention as potential risk factors for cognitive decline and dementia, including Alzheimer's disease (AD). Sleep-disordered breathing (SDB) has also been linked to these outcomes. Here, we review recent observational and experimental studies investigating the effect of poor sleep on cognitive outcomes and AD and discuss possible mechanisms.
Recent findings
Observational studies with self-report and objective sleep measures (e.g., wrist actigraphy, polysomnography) support links between disturbed sleep and cognitive decline. Several recently published studies demonstrate associations between sleep variables and measures of AD pathology, including cerebrospinal fluid measures (CSF) of Aβ and positron emission tomography (PET) measures of Aβ deposition. In addition, experimental studies suggest that sleep loss alters CSF Aβ dynamics, that decrements in slow-wave sleep may decrease the clearance of Aβ from the brain, and that hypoxemia characteristic of SDB increases Aβ production.
Summary
Findings indicate that poor sleep is a risk factor for cognitive decline and AD. Although mechanisms underlying these associations are not yet clear, healthy sleep appears to play an important role in maintaining brain health with age, and may play a key role in AD prevention.
Keywords: sleep, apnea, cognitive decline, dementia, amyloid”””

To create the new search query:
- Get a sense of what they are searching for
- Add in keywords from the text chunk to create a specific search query

Going through this process, we get the following result:
(Sleep quality) AND (Sleep-disordered breathing | SDB | apnea) impact on ("neurodegenerative diseases" | (cognitive decline) | dementia | Alzheimer’s) AND (prevent | recommendations | interventions)

Give the final result as your response so I can input that directly into Google search. Avoid providing additional details or steps, simply provide the new resulting search query as output.
- With the example given, the output would simply be “(Sleep quality) AND (Sleep-disordered breathing | SDB | apnea) impact on ("neurodegenerative diseases" | (cognitive decline) | dementia | Alzheimer’s) AND (prevent | recommendations | interventions)”
`;

SYSTEM_INSTRUCTION = '';
MESSAGE_INPUT = '';

if (!advancedQuery && !originalQuery) {
  SYSTEM_INSTRUCTION = T_SYSTEM_INSTRUCTION;
  MESSAGE_INPUT = `
  Text chunk:
  ${textChunk}
  `;
} else if (!advancedQuery && originalQuery) {
  SYSTEM_INSTRUCTION = OT_SYSTEM_INSTRUCTION;
  MESSAGE_INPUT = `
User query: ${originalQuery}

Text chunk:
${textChunk}
`;
} else if (advancedQuery && originalQuery) {
  SYSTEM_INSTRUCTION = OAT_SYSTEM_INSTRUCTION;

  MESSAGE_INPUT = `
User query: ${originalQuery}

Advanced query: ${advancedQuery}

Text chunk:
${textChunk}
`;
}
console.log(originalQuery);
console.log(advancedQuery);
console.log(textChunk);

  try {
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: MESSAGE_INPUT }
      ],
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 400,
      top_p: 1
    });

    const fullResponse = chatCompletion.choices[0].message.content;
    console.log('Advanced query for finding similar pages:', fullResponse);
    res.json({ fullResponse });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing the find similar request' });
  }
});