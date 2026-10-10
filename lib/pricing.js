// USD per 1M tokens [input, output]; fallbacks may answer with another model
const PRICES = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-fable-5-1": [10, 50],
};

export function usageCost(msg) {
  const [pin, pout] = PRICES[msg.model] ?? PRICES["claude-opus-5-5"];
  const { input_tokens, output_tokens } = msg.usage;
  return { model: msg.model, input_tokens, output_tokens, cost: (input_tokens * pin + output_tokens * pout) / 1e6 };
}
