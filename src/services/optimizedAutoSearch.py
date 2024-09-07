import dspy
import requests
import json
import os
from typing import List, Dict, Set
from dspy.teleprompt import BootstrapFewShot
from io import StringIO

omni = dspy.OpenAI(model='gpt-4o', api_key=os.environ.get('OPENAI_API_KEY'), max_tokens = 3000)
dspy.settings.configure(lm=omni)

# signatures
class Classify(dspy.Signature):
    """Classify the query into one of three categories: research paper (0), technical example (1), or general search (2)."""
    query = dspy.InputField()
    category = dspy.OutputField(desc="Number corresponding to query category (0, 1, or 2), simply returning the number so output can be directly used as integer input for another function")

class Evaluate(dspy.Signature):
    """Evaluate search results for relevancy and credibilty based on the input query and suggest additional queries."""
    query = dspy.InputField()
    results = dspy.InputField()
    reasoning = dspy.OutputField(desc="Concise step-by-step reasoning for evaluating the results")
    relevant_positions = dspy.OutputField(desc="List of integer positions of top 3-5 most relevant results in comma-separated form, simply providing list so it can be parsed by string.split(\", \") and inputted into function")
    additional_queries = dspy.OutputField(desc="List of 3 additional queries to perform based on what information is still missing, simply in comma-separated form with no additional quotation marks")

# functions
def results_retrieval(search_query: str) -> List[Dict]:
    data = json.dumps({"q": search_query})
    headers = {
        'X-API-KEY': os.environ.get('SERPER_API_KEY'),
        'Content-Type': 'application/json'
    }
    try:
        print(os.environ.get('SERPER_API_KEY'))
        response = requests.post('https://google.serper.dev/search', headers=headers, data=data)
        response.raise_for_status()
        return response.json().get('organic', [])
    except requests.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")  # Added for more detailed error logging
    except requests.RequestException as error:
        print(f"Error fetching search results: {error}")
    return []


def add_unique_results(results: List[Dict], current_results: Set[str]) -> List[Dict]:
    unique_results = []
    for result in results:
        identifier = f"{result['title'].lower()}|{result['link'].lower()}"
        if identifier not in current_results:
            current_results.add(identifier)
            unique_results.append(result)
    return unique_results

# module
class AutoSearch(dspy.Module):
    def __init__(self):
        super().__init__()
        self.classify = dspy.Predict(Classify)
        self.evaluate = dspy.ChainOfThought(Evaluate)

    def forward(self, query: str, send_update):
        current_results = set()

        # Step 1: Classify query
        category = int(self.classify(query=query).category)
        send_update('queryCategory', {'category': int(category)})

        # Step 2: Retrieve initial search results
        if category == 0:  # Research paper
            initial_query = f"{query} site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi"
        elif category == 1:  # Technical example
            initial_query = f"{query} site:github.com | site:stackoverflow.com | site:medium.com | site:kaggle.com | site:towardsdatascience.com | site:paperswithcode.com | site:huggingface.co"
        else:
            initial_query = query

        send_update('firstQuery', {'query': initial_query})
        initial_results = json.dumps(results_retrieval(initial_query))
        send_update('initialResults', {'initialResults': initial_results})

        # Step 3: Evaluate results and get additional queries
        evaluation = self.evaluate(query=query, results=initial_results)
        send_update('additionalQueries', {'additionalQueries': evaluation.additional_queries})
        send_update('evaluationReasoning', {'reasoning': evaluation.reasoning})
        send_update('relevant positions', {'relevant positions': evaluation.relevant_positions})

        queries = evaluation.additional_queries.split(", ")

        print(queries)

        separated = evaluation.relevant_positions.split(", ")
        relevant_results = []

        for item in separated:
            print(item)
            relevant_results.append(initial_results[int(item)])

        relevant_results = [initial_results[i] for i in evaluation.relevant_positions]
        send_update('topResults', {'topResults': relevant_results})

        current_results.update(add_unique_results(relevant_results, current_results))

        # Step 4: Perform additional queries
        for additional_query in queries:
            if category == 0:
                additional_query += " site:arxiv.org | site:nature.com | site:.org | site:.edu | site:.gov | inurl:doi"
            results = results_retrieval(additional_query)
            structured_result = self.evaluate(query=query, results=results)
            unique_results = add_unique_results([results[i] for i in structured_result.relevant_positions], current_results)
            send_update('relevantResults', {'relevantResults': unique_results})
            send_update('additionalEvaluationReasoning', {'reasoning': structured_result.reasoning})

        return dspy.Prediction(category=category, results=list(current_results))

# compile
# teleprompter = BootstrapFewShot(metric=lambda ex, pred: True)  # Simple metric, replace with a proper one
# compiled_auto_search = teleprompter.compile(AutoSearch(), trainset=[])  # Empty trainset, replace with actual examples

# use compiled model
def auto_search(query: str, res):
    def send_update(event, data):
        res.write(f"event: {event}\ndata: {json.dumps(data)}\n\n")
        res.flush()

    try:
        result = compiled_auto_search(query=query, send_update=send_update)
        send_update('done', {'done': True})
    except Exception as e:
        print(f"Error in autoSearch: {str(e)}")
        send_update('error', {'message': 'An error occurred during search'})
    finally:
        res.close()

# for testing functionality without compiling
def non_compiled_auto_search(query: str, res):
    def send_update(event, data):
        res.write(f"event: {event}\ndata: {json.dumps(data)}\n\n")
        res.flush()

    try:
        auto_search_instance = AutoSearch()
        result = auto_search_instance(query=query, send_update=send_update)
        send_update('done', {'done': True})
        return result
    except Exception as e:
        print(f"Error in autoSearch: {str(e)}")
        send_update('error', {'message': 'An error occurred during search'})
    finally:
        res.close()

class MockResponse:
    def __init__(self):
        self.buffer = StringIO()

    def write(self, data):
        self.buffer.write(data)
        # Print each update as it's received
        print("Received update:", data.strip())

    def flush(self):
        pass

    def close(self):
        pass

    def get_output(self):
        return self.buffer.getvalue()
    
# test
if __name__ == "__main__":
    print("entered main function")
    mock_res = MockResponse()
    query = "research papers on llm optimization with programming and evaluative metrics"
    
    print("Starting search...")
    result = non_compiled_auto_search(query, mock_res)
    
    print("\nAll accumulated updates:")
    print(mock_res.get_output())
    
    print("\nFinal Result:")
    if result:
        print(f"Category: {result.category}")
        print(f"Number of results: {len(result.results)}")
        print("\nSample results:")
        for i, res in enumerate(result.results[:3], 1):  # Print first 3 results
            print(f"{i}. Title: {res['title']}")
            print(f"   Link: {res['link']}")
            print(f"   Snippet: {res['snippet'][:100]}...")  # First 100 characters of snippet
            print()
    else:
        print("No results returned.")
