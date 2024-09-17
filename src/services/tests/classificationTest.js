async function classifyQuery(query) {
    data = {
        "inputs": query,
        "parameters": {}
    }
	const response = await fetch(
		"https://x8nqx5sqlkvqafjb.us-east-1.aws.endpoints.huggingface.cloud",
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

classifyQuery("research papers on gpu optimization").then((response) => {
	console.log(response);
});