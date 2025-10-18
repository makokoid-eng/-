export type AiInput = {
  type: 'text' | 'image';
  text?: string;
  imageMessageId?: string;
};

/**
 * Dummy AI pipeline placeholder that will be replaced by a real model later.
 * Always resolves with a safe fallback message to keep the worker stable.
 */
export async function runAiPipeline(input: AiInput): Promise<string> {
  if (input.type === 'image') {
    return '画像を受け取りました。現在解析中です。分析結果は後ほどお送りします。';
  }

  const text = input.text?.trim();
  if (!text) {
    return 'メッセージを受け取りました。詳細が分かり次第お知らせします。';
  }

  return `「${text}」について調査しています。結果を少しお待ちください。`;
}
