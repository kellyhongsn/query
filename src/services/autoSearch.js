const { openai } = require('../utils/config');

async function autoSearchPlan(query) {
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

  const result = JSON.parse(completion.choices[0].message.content);

  return {
    searchPlan: result.search_plan,
    firstQuery: result.initial_query
  };
}

module.exports = { autoSearchPlan };