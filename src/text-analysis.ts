import { clamp01, type EmojiSignal, type TextSignals } from "./signals.js";

const wordCount = (text: string): number => (text.trim().match(/[\p{L}\p{N}_'-]+/gu) ?? []).length;
const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;
const hitScore = (text: string, terms: readonly string[]): number => {
  const lower = text.toLocaleLowerCase("pt-BR");
  const hits = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
  return clamp01(hits / Math.max(1, Math.min(3, terms.length)));
};

const emojiLexicon: Readonly<Record<string, readonly string[]>> = {
  "😀": ["positive"], "😃": ["positive"], "😄": ["positive"], "😊": ["positive", "acceptance"],
  "😍": ["positive", "engagement"], "🥰": ["positive", "engagement"], "❤️": ["positive", "engagement"],
  "👍": ["acceptance", "positive"], "✅": ["acceptance"], "🙌": ["acceptance", "positive"],
  "🤔": ["uncertainty", "deliberation"], "😕": ["uncertainty"], "🤷": ["uncertainty"],
  "😬": ["anxiety", "uncertainty"], "😰": ["anxiety"], "😟": ["anxiety"], "😨": ["anxiety"],
  "😒": ["resistance", "negative"], "🙄": ["resistance", "negative"], "😠": ["resistance", "negative"],
  "🤨": ["resistance", "uncertainty"], "👎": ["negation", "resistance", "negative"], "❌": ["negation", "negative"],
  "😢": ["negative"], "😭": ["negative", "high-arousal"], "😡": ["negative", "resistance", "high-arousal"],
  "🔥": ["urgency", "high-arousal", "engagement"], "🚀": ["urgency", "engagement"], "⚡": ["urgency", "high-arousal"],
  "💥": ["high-arousal"], "⏰": ["urgency"], "⌛": ["urgency"], "🙏": ["validation", "acceptance"]
};

const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu;

export function analyzeEmoji(text: string): readonly EmojiSignal[] {
  const matches = text.match(EMOJI_RE) ?? [];
  return matches.map((emoji) => ({
    emoji,
    categories: emojiLexicon[emoji] ?? [],
    weight: (emojiLexicon[emoji]?.length ?? 0) > 0 ? 1 : 0.25
  }));
}

function categoryScore(emoji: readonly EmojiSignal[], category: string): number {
  const score = emoji.reduce((sum, item) => sum + (item.categories.includes(category) ? item.weight : 0), 0);
  return clamp01(score / 2);
}

export function analyzeText(text: string): TextSignals {
  const trimmed = text.trim();
  const emoji = analyzeEmoji(trimmed);
  const letters = trimmed.match(/\p{L}/gu) ?? [];
  const uppercase = trimmed.match(/\p{Lu}/gu) ?? [];
  const questions = count(trimmed, /\?/g);
  const exclamations = count(trimmed, /!/g);
  const ellipses = count(trimmed, /(?:\.\.\.|…)/g);
  const repeatedPunctuation = count(trimmed, /([!?.,])\1{1,}/g);
  const repeatedCharacters = count(trimmed.toLocaleLowerCase("pt-BR"), /(\p{L})\1{2,}/gu);
  const tokens = wordCount(trimmed);

  const interrogative = clamp01(Math.max(questions > 0 ? 0.7 : 0, hitScore(trimmed, ["como", "qual", "quais", "quando", "onde", "por que", "porque?", "será", "pode", "consegue"])));
  const negation = Math.max(hitScore(trimmed, ["não", "nao", "nunca", "nem", "jamais", "de jeito nenhum", "não quero", "nao quero"]), categoryScore(emoji, "negation"));
  const comparison = hitScore(trimmed, ["melhor", "pior", "versus", " vs ", "compar", "mais barato", "mais caro", "diferença", "diferenca", "opção", "opcao", "alternativa"]);
  const uncertainty = Math.max(hitScore(trimmed, ["acho", "talvez", "não sei", "nao sei", "será", "sera", "dúvida", "duvida", "não tenho certeza", "nao tenho certeza", "hmm", "hm"]), categoryScore(emoji, "uncertainty"));
  const acceptance = Math.max(hitScore(trimmed, ["sim", "beleza", "fechado", "aceito", "concordo", "perfeito", "ótimo", "otimo", "pode ser", "vamos", "quero"]), categoryScore(emoji, "acceptance"));
  const resistance = Math.max(hitScore(trimmed, ["mas", "porém", "porem", "discordo", "não faz sentido", "nao faz sentido", "não quero", "nao quero", "caro demais", "sem interesse", "não gostei", "nao gostei"]), categoryScore(emoji, "resistance"));
  const urgency = Math.max(hitScore(trimmed, ["agora", "urgente", "rápido", "rapido", "hoje", "já", "ja", "quanto antes", "imediato", "correndo"]), categoryScore(emoji, "urgency"));
  const validationSeeking = Math.max(hitScore(trimmed, ["certo?", "né?", "ne?", "está certo", "esta certo", "faz sentido?", "o que você acha", "o que voce acha", "confirma", "posso confiar"]), categoryScore(emoji, "validation"));
  const positiveAffect = Math.max(hitScore(trimmed, ["gostei", "adorei", "bom", "ótimo", "otimo", "legal", "perfeito", "feliz"]), categoryScore(emoji, "positive"));
  const negativeAffect = Math.max(hitScore(trimmed, ["ruim", "péssimo", "pessimo", "chato", "triste", "irritado", "problema", "ódio", "odio"]), categoryScore(emoji, "negative"));

  const lengthEngagement = clamp01(tokens / 35);
  const engagement = clamp01(Math.max(lengthEngagement, categoryScore(emoji, "engagement"), interrogative * 0.7));

  const semanticTags = [
    ["question", interrogative], ["negation", negation], ["comparison", comparison], ["uncertainty", uncertainty],
    ["acceptance", acceptance], ["resistance", resistance], ["urgency", urgency], ["validation-seeking", validationSeeking],
    ["positive-affect", positiveAffect], ["negative-affect", negativeAffect], ["emoji-high-arousal", categoryScore(emoji, "high-arousal")]
  ].filter(([, score]) => Number(score) >= 0.45).map(([tag]) => String(tag));

  return {
    emoji,
    tokens,
    questions,
    exclamations,
    ellipses,
    uppercaseRatio: letters.length === 0 ? 0 : clamp01(uppercase.length / letters.length),
    repeatedPunctuation,
    repeatedCharacters,
    interrogative,
    negation,
    comparison,
    uncertainty,
    acceptance,
    resistance,
    urgency,
    validationSeeking,
    positiveAffect,
    negativeAffect,
    engagement,
    semanticTags
  };
}
