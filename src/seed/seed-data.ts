// Plain request bodies, exactly as a client would POST them. The seed runs
// each one through the same ValidationPipe as the HTTP API.

export const SEED_USERS = [
  { email: 'ada@example.com', name: 'Ada Lovelace' },
  { email: 'alan@example.com', name: 'Alan Turing' },
] as const;

/** Email of the seeded user who authors the seeded quizzes. */
export const SEED_AUTHOR_EMAIL = SEED_USERS[0].email;

export interface SeedQuiz {
  title: string;
  description: string;
  topic: string;
  questions: {
    text: string;
    explanation: string;
    options: { text: string; isCorrect: boolean }[];
  }[];
}

export const SEED_QUIZZES: SeedQuiz[] = [
  {
    title: 'Prompt Engineering Fundamentals',
    description: 'Core techniques for getting reliable output from large language models.',
    topic: 'prompting',
    questions: [
      {
        text: 'What is few-shot prompting?',
        explanation:
          'Few-shot prompting puts a handful of worked input/output examples in the prompt so the model can infer the pattern. The model weights do not change.',
        options: [
          { text: 'Fine-tuning the model on a small dataset', isCorrect: false },
          { text: 'Including a few worked examples in the prompt', isCorrect: true },
          { text: 'Limiting the response to a few sentences', isCorrect: false },
          { text: 'Sending several prompts in parallel', isCorrect: false },
        ],
      },
      {
        text: 'What does lowering the temperature parameter usually do?',
        explanation:
          'Temperature scales the randomness of token sampling. Lower values make the model pick high-probability tokens, so output is more focused and repeatable.',
        options: [
          { text: 'Makes output more deterministic and focused', isCorrect: true },
          { text: 'Makes output more creative and varied', isCorrect: false },
          { text: 'Makes responses longer', isCorrect: false },
          { text: 'Makes the model respond faster', isCorrect: false },
        ],
      },
      {
        text: 'What is the main purpose of a system prompt?',
        explanation:
          "A system prompt sets the model's role, rules and context for the whole conversation, separately from individual user messages.",
        options: [
          { text: "Storing the user's chat history", isCorrect: false },
          { text: 'Authenticating requests to the API', isCorrect: false },
          { text: "Setting the model's role, rules and context for the conversation", isCorrect: true },
          { text: 'Capping the number of output tokens', isCorrect: false },
        ],
      },
      {
        text: 'What does chain-of-thought prompting ask the model to do?',
        explanation:
          'Chain-of-thought prompting asks the model to work through intermediate reasoning steps before answering, which tends to improve multi-step problems.',
        options: [
          { text: 'Pass its answer to a second model', isCorrect: false },
          { text: 'Call several tools in a fixed order', isCorrect: false },
          { text: 'Answer with a single word', isCorrect: false },
          { text: 'Reason step by step before giving the final answer', isCorrect: true },
        ],
      },
      {
        text: 'What is the most reliable way to get output your code can parse?',
        explanation:
          'Stating the exact format (for example a JSON schema) and showing an example gives the model a precise target; many APIs can also enforce a schema with structured outputs.',
        options: [
          { text: 'Ask the model to be concise', isCorrect: false },
          { text: 'Specify the exact format, such as a JSON schema, and show an example', isCorrect: true },
          { text: 'Raise the temperature', isCorrect: false },
        ],
      },
    ],
  },
  {
    title: 'Retrieval-Augmented Generation (RAG)',
    description: 'Grounding model answers in your own documents with embeddings and retrieval.',
    topic: 'rag',
    questions: [
      {
        text: 'What does retrieval-augmented generation add to an LLM call?',
        explanation:
          'RAG retrieves documents relevant to the query at request time and adds them to the prompt, so the model can answer from data it was not trained on.',
        options: [
          { text: 'Relevant documents retrieved at query time, added to the prompt', isCorrect: true },
          { text: 'Retraining the model on your documents', isCorrect: false },
          { text: 'A larger context window', isCorrect: false },
          { text: 'A cache of previous answers', isCorrect: false },
        ],
      },
      {
        text: 'What is a text embedding?',
        explanation:
          'An embedding is a vector of numbers that captures the meaning of a text, so texts with similar meaning end up close together in vector space.',
        options: [
          { text: 'A compressed copy of the model weights', isCorrect: false },
          { text: 'The token ID of a word', isCorrect: false },
          { text: 'A numeric vector that represents the meaning of a text', isCorrect: true },
          { text: 'A reusable prompt template', isCorrect: false },
        ],
      },
      {
        text: 'Why are documents split into chunks before indexing?',
        explanation:
          'Chunking lets retrieval return small, focused passages that match the query and fit in the context window, instead of whole documents.',
        options: [
          { text: 'To encrypt them before storage', isCorrect: false },
          { text: 'To return small, focused passages that fit in the context window', isCorrect: true },
          { text: 'To reduce the number of embeddings', isCorrect: false },
          { text: 'Because models cannot read paragraphs', isCorrect: false },
        ],
      },
      {
        text: 'Which measure is commonly used to compare two embedding vectors?',
        explanation:
          'Cosine similarity measures the angle between two vectors; it is the usual way to score how semantically close two embeddings are.',
        options: [
          { text: 'Levenshtein distance', isCorrect: false },
          { text: 'BLEU score', isCorrect: false },
          { text: 'Perplexity', isCorrect: false },
          { text: 'Cosine similarity', isCorrect: true },
        ],
      },
      {
        text: 'A RAG answer states facts that are not in the retrieved documents. What is this called?',
        explanation:
          'Content that is not supported by the provided sources is a hallucination, or ungrounded generation. Evaluations for RAG often measure groundedness to catch it.',
        options: [
          { text: 'Hallucination (ungrounded generation)', isCorrect: true },
          { text: 'Overfitting', isCorrect: false },
          { text: 'Prompt injection', isCorrect: false },
        ],
      },
    ],
  },
];
