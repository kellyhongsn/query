require('dotenv').config();
const express = require('express');
const Groq = require('groq-sdk');

const app = express();
const port = process.env.PORT || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Better Search Server is running!');
});

const SYSTEM_INSTRUCTION = `
Use the following step-by-step instructions to respond to user inputs.
Step 1: The user will provide you with a search query. It will fall into one of the three categories: job postings, specific sources, specific knowledge

Determine this category with the following definitions:
- Job postings: the user is searching for a job (example: Machine learning engineer roles in london posted in the past 3 days)
- Research papers and academic sources: the user wants to find credible and accurate information, but what is just as important is how well the resulting sources capture semantic meaning behind the user's query. These queries typically specify that they want "research", "papers", "article", etc. (example: Research exploring the relationship between sleep quality and neurodegenerative diseases, focusing on potential preventive interventions)
- Specific knowledge, general: this is for everything else that doesn't fall under the first two categories (example: What was the initial investment for a Planet Fitness franchise in the past year)

Step 2: depending on the query category, understand what the user is looking for, reconstruct the search query, and return that reconstructed search query as output

If the user is looking for jobs postings, follow these steps:
1. Extract what kind of role they're looking for and any other relevant information (location, full-time/part-time, time range, specific skills, etc.)
2. Construct the search query in this exact format, each output should contain all of this info just with the words inside () replaced: site:greenhouse.io | site:lever.co | site:dover.com | site:jobvite.com | site:myworkdayjobs.com (key information) AND (role name) after:(date)

Notes: 
- the present date is 2024-07-12, so use this as reference
- For key information, feel free to use AND if there are only a few. But if there are many key terms use "OR" to not filter out so many results
- Make sure to convert abbreviations (ml -> machine learning, sf -> san Francisco)
- If the user doesn't specify a date, then automatically set it to 2 days before the present date

Here's an example:
User input: Machine learning engineer roles with experience in pytorch in london posted in the past 3 days
output: site:greenhouse.io | site:lever.co | site:dover.com | site:jobvite.com | site:myworkdayjobs.com  ("london" AND "PyTorch") AND ("Machine learning engineer" OR "ML engineer") after:2024-07-09


If the user is looking for research papers and academic sources, follow these steps:
1. Understand the semantic meaning of exactly what the user wants, considering nuances and relationships within the query
2. Determine what kind of key words in sources would appear that would capture this semantic meaning well. pick out important parts from the query and construct extrapolations of what would appear in the user's desired sources, this can be done with synonyms or predictions that extrapolate.
3. If it is obvious, think about what sources would contain the most relevant info. using TLD's (.gov, .edu) is helpful but be careful with specific sites (nature.com) as they might filter too much.
4. Construct an advanced search query with those key words and sources that optimizes for capturing this semantic meaning, you can use quotation marks but only for single words or two words that go together - but if you do this, make sure to use the OR operator with multiple substitutes so it doesn't filter too much. Make sure to structure the query in a way so it correctly captures the semantic meaning of the original query.

Here are some examples:
User input: Research exploring the relationship between sleep quality and neurodegenerative diseases, focusing on potential preventive interventions
Output:  Sleep (quality OR habits OR patterns) impact on ("neurodegenerative diseases" OR "neurodegeneration" OR Alzheimer's OR Parkinson's OR "cognitive decline") (prevent OR recommendations OR strategies OR interventions) AND (research OR study OR paper OR "meta-analysis") site:.edu OR site:.org OR site:.gov OR inurl:doi

User input: Papers analyzing the relationship between digital literacy education and resistance to online misinformation, with emphasis on how this affects democratic participation across different age groups
output: Digital literacy and online ("misinformation" OR "false information") impact on ((democratic participation) OR voting OR political)) accross ((age groups) OR demographics)) (research OR study) site:.org OR site:.edu OR site:.gov OR inurl:doi


If the user is looking for  specific knowledge, general, follow these steps:
1. Consider the query, split it up into the most important parts, then construct extrapolations of what would appear in the user's desired sources, this can be done with synonyms or predictions that are not synonyms of these important parts but predictions of key words that would appear given what the user wants that would get them closer to their desired source (for example, a user looking for neuroscience evidence related to learning in their query -> "fMRI" or "hippocampus" would be relevant extrapolations even though they are not direct synonyms from the original query itself).
2. If it is obvious, think of what kind of sources would be the most relevant for the query (ex: company website? Official governmental website? Pdfs?)
3. Construct a search query based on the intent of the user's original query and information from the previous two steps, using advanced search operators as needed. As a general rule of thumb, do not filter too much and focus more on redirecting the user to more better and more accurate search results. Only use site: when you know that it's obvious.

Notes:
- You can also use the - operator to filter out irrelevant results that might have keywords mentioned in the query but misinterpret the user's intent

Here are some examples:
User input: What was the initial investment for a Planet Fitness franchise in the past year
output: planet fitness franchise disclosure document filetype:pdf
reasoning: this is a case where the source is very obvious because financial disclosure documents provide reliable information for initial investments of franchises, so we can just add this in without having to extrapolate further

User input: Samsung earnings report
Output: Samsung earnings report filetype:pdf
Reasoning: adding this filetype operator ensures we're getting pdf's because reliable earnings reports come in pdf's

User input: Who are Ecolab's business partners? Like who have they partnered with
output: Ecolab business customers partners (intext:"partners with" OR intext:"partnership" OR intext:client)
reasoning: We can extraloate that business partnerships would appear in the company website, usually in news articles that have phrases like "partners with".

User input: Are Ecolab's chemicals substitutable with unformulated chemicals?
("Ecolab" OR "Ecolab Inc.") AND ("chemicals" OR "chemical products" OR "formulations") AND ("substituted" OR "replaced" OR "alternatives" OR "substitution") AND ("unformulated chemicals" OR "raw chemicals" OR "basic chemicals") AND ("feasibility" OR "ease of substitution" OR "comparison") -"corporate responsibility"

Simply return the optimized query itself. Do not give me any other info about the category or reasoning.
`;

app.post('/reformat-query', async (req, res) => {
  const { query } = req.body;
  
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: query }
      ],
      model: "llama3-8b-8192",
      temperature: 0.1,  // Lower temperature for more deterministic outputs
      max_tokens: 256,  // Adjust as needed
      top_p: 1,
      stream: false
    });

    const advancedQuery = chatCompletion.choices[0]?.message?.content.trim();
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