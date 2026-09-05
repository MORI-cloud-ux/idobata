import Problem from "../models/Problem.js";
import SharpQuestion from "../models/SharpQuestion.js";
import { DEFAULT_LLM_MODEL, callLLM } from "../services/llmService.js";
import { linkQuestionToAllItems } from "./linkingWorker.js";

async function generateSharpQuestions(themeId) {
  console.log(
    `[QuestionGenerator] Starting sharp question generation for theme ${themeId}...`
  );

  try {
    // 現行スキーマは content。
    // statement は旧データとの互換性のため残す。
    const problems = await Problem.find({ themeId })
      .select("content statement")
      .lean();

    if (!problems || problems.length === 0) {
      console.log(
        `[QuestionGenerator] No problems found for theme ${themeId}.`
      );
      return;
    }

    const problemStatements = problems
      .map((p) => p.content || p.statement || "")
      .filter(
        (text) => typeof text === "string" && text.trim().length > 0
      );

    if (problemStatements.length === 0) {
      console.log(
        `[QuestionGenerator] Problems found, but no usable content for theme ${themeId}.`
      );
      return;
    }

    console.log(
      `[QuestionGenerator] Found ${problemStatements.length} usable problem statements for theme ${themeId}.`
    );

    const messages = [
      {
        role: "system",
        content: `あなたは、市民から集められた課題を整理し、重要な論点となる問いを生成するAIです。

入力された課題を整理・統合し、日本語で6つの重要論点を生成してください。

1〜3番目：
現状と望ましい状態のギャップを明確にした問いにしてください。
具体的な解決方法を問いの中に含めないでください。

4〜6番目：
「現状は○○だが、それが○○になるのは望ましいだろうか？」
という形式を参考に、望ましい状態そのものについて議論できる問いにしてください。

一般の市民が理解できる平易な日本語を使用してください。

必ず有効なJSONのみを返してください。

形式：
{
  "questions": [
    {
      "question": "重要論点となる問い",
      "tagLine": "短い要約",
      "tags": ["タグ1", "タグ2"]
    }
  ]
}

questionsには6件を含めてください。`,
      },
      {
        role: "user",
        content: `以下は、このテーマについて参加者との対話から抽出された課題です。

${problemStatements
  .map((text, index) => `${index + 1}. ${text}`)
  .join("\n")}

これらを整理・統合して、重要論点を6件生成してください。
必ずJSONのみで回答してください。`,
      },
    ];

    console.log(
      "[QuestionGenerator] Calling LLM to generate questions..."
    );

    // ProではなくFlashを使用
    const llmResponse = await callLLM(
      messages,
      true,
      DEFAULT_LLM_MODEL
    );

    if (
      !llmResponse ||
      !Array.isArray(llmResponse.questions) ||
      llmResponse.questions.length === 0
    ) {
      console.error(
        "[QuestionGenerator] Invalid LLM response:",
        llmResponse
      );
      return;
    }

    console.log(
      `[QuestionGenerator] LLM generated ${llmResponse.questions.length} questions.`
    );

    let savedCount = 0;

    for (const questionObj of llmResponse.questions) {
      const questionText = questionObj.question;
      const tagLine = questionObj.tagLine || "";
      const tags = Array.isArray(questionObj.tags)
        ? questionObj.tags
        : [];

      if (!questionText || typeof questionText !== "string") {
        console.warn(
          "[QuestionGenerator] Skipping invalid question:",
          questionObj
        );
        continue;
      }

      try {
        // 現行SharpQuestionスキーマは content
        const result = await SharpQuestion.findOneAndUpdate(
          {
            content: questionText.trim(),
            themeId,
          },
          {
            $setOnInsert: {
              content: questionText.trim(),
              tagLine,
              tags,
              themeId,
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true,
          }
        );

        if (result?._id) {
          console.log(
            `[QuestionGenerator] Saved question ID: ${result._id}`
          );

          setTimeout(() => {
            linkQuestionToAllItems(result._id.toString()).catch(
              (error) => {
                console.error(
                  `[QuestionGenerator] Linking failed for ${result._id}:`,
                  error
                );
              }
            );
          }, 0);

          savedCount++;
        }
      } catch (dbError) {
        console.error(
          `[QuestionGenerator] Error saving question "${questionText}":`,
          dbError
        );
      }
    }

    console.log(
      `[QuestionGenerator] Successfully processed ${savedCount} questions.`
    );
  } catch (error) {
    console.error(
      "[QuestionGenerator] Error during sharp question generation:",
      error
    );
  }
}

export { generateSharpQuestions };
