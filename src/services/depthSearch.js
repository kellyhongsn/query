const puppeteer = require('puppeteer');
const { openai } = require('../utils/config');
const cheerio = require('cheerio');

async function depthSearch(link, query) {
    if (link.includes("pdf")) {
        bodyText = await preprocesspdf(link);
        keywords = await getKeywords(bodyText);
        textChunks = extractFromKeywords(bodyText, keywords);
        queries = generateQueries(textChunk, query);

        return queries;
    } else {
        links, bodyText = await preprocess(link);
        keywords = await getKeywords(bodyText);
        screenshot = await getScreenshot(link);

        actionNeeded, action = await screenshotAnalysis(query, screenshot);

        if (!actionNeeded) {
            textChunks = extractFromKeywords(bodyText, keywords);
            queries = generateQueries(textChunk, query);
            return queries;
        } else {
            newLink = performAction(link, links, action);
            links, bodyText = await preprocess(link);
            keywords = await getKeywords(bodyText);
            textChunks = extractFromKeywords(bodyText, keywords);
            queries = generateQueries(textChunk, query);

            return queries;
        }
    }
}

async function preprocess(link) {
    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(link);
        if (!response.ok) {
            throw new Error(`Failed to fetch the URL: ${response.statusText}`);
        }

        const htmlText = await response.text();

        const $ = cheerio.load(htmlText);

        const linksArray = $('a')
            .map((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                if (href) {
                    const absoluteHref = new URL(href, link).href;
                    return {
                        text,
                        href: absoluteHref
                    };
                }
                return null;
            })
            .get()
            .filter(link => link);

        const links = linksArray
            .map(link => `(${link.text}, ${link.href})`)
            .join(' ');

        const bodyText = $('body')
            .text()
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase(); 

        return {
            links,
            bodyText
        };
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

async function preprocesspdf(originalUrl){
    try {
        const modifiedUrl = 'r.jina.ai/' + originalUrl;

        const fetch = (await import('node-fetch')).default;

        const response = await fetch(modifiedUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch the URL: ${response.statusText}`);
        }

        const htmlText = await response.text();

        const $ = cheerio.load(htmlText);

        const bodyText = $('body')
            .text()
            .replace(/\s+/g, ' ')
            .trim();

        return bodyText.toLowerCase();
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

async function getKeywords(textChunk, query) {
    SYSTEM_INSTRUCTION = `
    You are a search assistant specialized in identifying keywords of a webapge based on the user's query.
    `;

    MESSAGE_INPUT = `
    Given that the user's query is: ${query}
      
    And a text snippet from this website is: ${textChunk} 

    What are 3-5 keywords from the text snippet that would be most relevant to the user?

    Give your final answer in a comma-separated list, and that list only so I can perform simple String manipulation and simply get the keywords to do keyword search by."
    `;

    if (textChunk.length > 2500) {
        textChunk = textChunk.slice(200, 2000);
    }

    const chatCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: MESSAGE_INPUT }
        ],
        temperature: 0.2,
        max_tokens: 100,
    });

    let keywords = chatCompletion.choices[0].message.content;
    
    const keywordsArray = keywords.split(',').map(keyword => keyword.trim().toLowerCase());

    return keywordsArray;
}

async function getScreenshot(link) { 
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
  
    try {
      await page.setViewport({
        width: 1920,   
        height: 1080,
        deviceScaleFactor: 1,
      });
  
      await page.goto(link, { waitUntil: 'networkidle0', timeout: 30000 });
  
      const screenshotBase64 = await page.screenshot({
        fullPage: false,
        encoding: 'base64',
      });
  
      return screenshotBase64;
    } catch (error) {
      console.error(`Error capturing screenshot of ${link}:`, error);
      return null;
    } finally {
      await page.close();
      await browser.close();
    }
}

function extractFromKeywords(bodyText, keywords) {
    const maxChunks = 5;
    const chunkLength = 300;
    let textChunks = [];
    let usedIndices = [];
  
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'i');
      let match;
  
      while ((match = regex.exec(bodyText)) !== null && textChunks.length < maxChunks) {
        const keywordIndex = match.index;
        
        const start = Math.max(0, keywordIndex - Math.floor(chunkLength / 2));
        const end = Math.min(bodyText.length, keywordIndex + Math.floor(chunkLength / 2));
        
        const overlaps = usedIndices.some(([existingStart, existingEnd]) => {
          return (start <= existingEnd && end >= existingStart);
        });
  
        if (!overlaps) {
          const chunk = bodyText.slice(start, end).trim();
          textChunks.push(chunk);
          usedIndices.push([start, end]);
        }
  
        regex.lastIndex = keywordIndex + 1;
      }
    });
  
    return textChunks.slice(0, maxChunks).join('\n');
}

async function generateQueries(textChunk, query) {
    const SYSTEM_INSTRUCTION = `
    You are an advanced AI assistant specialized in crafting optimized Google search queries to go deeper into the topic. Given the user’s initial search query and a text chunk of the website they are currently on, your task is to create two new search queries:

    1. The first query should refine the user's original query by incorporating keywords and topics from the text chunk. This query should explore the original topic but be a bit more specific.
    
    2. The second query should focus on a deeper subtopic that you can infer from the text chunk. This query should dig into a more specific aspect of the text content that may be relevant but is not directly covered by the user's original query.

    Please return the two queries as a comma-separated list without any additional text or explanation, so string manipulation can directly applied and each element can just be put into Google.

    Example response format:
    query1, query2
    `;

    const MESSAGE_INPUT = `
    User query: ${query}
  
    Text chunk:
    ${textChunk}
    `;

    const chatCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: MESSAGE_INPUT }
        ],
        temperature: 0.2,
        max_tokens: 400,
    });

    let queriesString = chatCompletion.choices[0].message.content.trim();

    let queriesArray = queriesString.split(',').map(query => query.trim());

    return queriesArray;
}

async function screenshotAnalysis(userQuery, screenshotBase64) {
    const SYSTEM_INSTRUCTION = `
    You are an AI assistant that helps determine if a webpage shows the full content desired by the user or if additional actions are needed to access the full content. Based on the user's query and a screenshot of the webpage, provide an action if needed, such as "click on 'view more' button", or output "none" if the page already shows the full content.

    Instructions:
    - Analyze the screenshot provided (in Base64 encoding).
    - Compare it with the user's query.
    - If the full content is visible in the screenshot, respond with "none".
    - If additional action is needed to view the full content, specify the action (e.g., "click on 'view PDF' button").

    Respond with your conclusion without any additional text.
    `;

  try {
    const chatCompletion = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: [{
                type: 'text',
                text: userQuery
            },
            {
                type: 'image_url',
                image_url: {
                    url: `data:image/jpeg;base64, ${screenshotBase64}`
                }
            }
        ] },
      ],
      temperature: 0.2,
      max_tokens: 100,
    });

    const assistantResponse = chatCompletion.data.choices[0].message.content.trim();

    const lowerCaseResponse = assistantResponse.toLowerCase();

    if (lowerCaseResponse.includes('none')) {
      return { needsAction: false, action: 'none' };
    } else {
      return { needsAction: true, action: assistantResponse };
    }
  } catch (error) {
    console.error('Error during OpenAI API call:', error);

    return { needsAction: false, action: 'Error occurred' };
  }
}

async function performAction(originalLink, links, action) {
    const MESSAGE_INPUT = `
    You are an AI assistant that helps select the most appropriate link from a list based on a user's action.

    Given the following list of labels and links:
    ${links}

    And the user's action: "${action}"

    Select the link that best matches the action.

    Only output the link, nothing else.
    `;

    try {
        const completion = await openai.createChatCompletion({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: MESSAGE_INPUT }],
          temperature: 0.2,
          max_tokens: 300,
        });
    
        const url =
          completion.data.choices[0].message.content.trim();

        if (!isValidUrl(url)) {
            url = originalLink
        }
    
        return url;

    } catch (error) {
        console.error('Error during OpenAI API call:', error);
        return null;
    }
}

function isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
}

module.exports = { depthSearch };