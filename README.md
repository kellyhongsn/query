# Query
The server-side code for a search agent that reasons and browses the web like a human.

It understands user intent from a query and browses the web to deliver the most relevant and credible search results.

<br>

### 🚀 Features

- Query classification using a fine-tuned DistilBERT model
  
- Google search integration

- Web scraping for search results

- LLM-based evaluation for relevancy and credibility

- Depth search process for the most relevant sources
<br>

### 🔍 Depth Search Process

1. Preprocess HTML for links (buttons, hyperlinks) and body text (for PDFs, use r.jina.ai in the URL to get inspectable content)

2. Extract keywords from body text considering the original query

3. Take screenshots using Puppeteer

4. Use GPT Vision to determine if additional actions are needed to view full content

5. Perform necessary actions using preprocessed links

6. Extract most relevant text chunks using keywords

7. Generate more specific, relevant queries using text chunks and the original query

<br>

### Demo
[Try it out](https://querysearch.live/)
