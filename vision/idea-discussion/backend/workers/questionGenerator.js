import Problem from "../models/Problem.js";
import SharpQuestion from "../models/SharpQuestion.js";
import { DEFAULT_LLM_MODEL, callLLM } from "../services/llmService.js";
import { linkQuestionToAllItems } from "./linkingWorker.js";

async function generateSharpQuestions(themeId) {
  console.log(
    `[QuestionGenerator] Starting sharp question generation for theme ${themeId}...`
  );

  try {
    // 1. Fetch all problems for this theme
    // New schema uses "content".
    // "statement" is also read for backward compatibility with older data.
    const problems = await Problem.find({ themeId })
      .select("content statement")
      .lean();

    if (!problems || problems.length === 0) {
      console.log(
        `[QuestionGenerator] No problems found for theme ${themeId} to generate questions from.`
      );
      return;
    }

    const problemStatements = problems
      .map((p) => p.content || p.statement || "")
      .filter((text) => typeof text === "string" && text.trim().length > 0);

    if (problemStatements.length === 0) {
      console.log(
        `[QuestionGenerator] Problems were found for theme ${themeId}, but no usable content was available.`
      );
      return;
    }

    console.log(
      `[QuestionGenerator] Found ${problemStatements.length} usable problem statements for theme ${themeId}.`
    );

    // 2. Prepare prompt for LLM
    const messages = [
      {
        role: "system",
        content: `You are an AI assistant specialized in synthesizing problem statements into insightful "How Might We..." (HMW) questions based on Design Thinking principles.

Your goal is to generate concise, actionable, and thought-provoking questions that capture the essence of the underlying challenges presented in the input problem statements.

Consolidate similar problems into broader HMW questions where appropriate.

For question 1-3:
- Describe both the current state ("現状はこう") and the desired state ("それをこうしたい").
- Do NOT suggest or imply specific means, methods, or solutions.
- Keep the problem space open for discussion.

For question 4-6:
- Use a format similar to:
  「現状は○○だが、それが○○になるのは望ましいだろうか？」
- Use these questions especially where consensus about the ideal state may be uncertain.

Generate all questions in Japanese.
Use language understandable to people who have completed compulsory education in Japan.

Respond ONLY with a JSON object containing a single key: "questions".

The value of "questions" must be an array of exactly 6 objects.

Each object must contain:
1. "question": Japanese question, approximately 50-100 characters.
2. "tagLine": Short Japanese summary, approximately 20 characters.
3. "tags": Array containing exactly 2 short Japanese category words.

Return valid JSON only.`,
      },
      {
        role: "user",
        content: `以下は、このテーマについて参加者との対話から抽出された課題です。

${problemStatements.map((text, index) => `${index + 1}. ${text}`).join("\n")}

これらの課題を統合・整理し、重要論点となる問いを6件生成してください。

個別の発言を単純に言い換えるのではなく、複数の課題に共通する論点がある場合は統合してください。

出力は必ず以下の形式のJSONだけにしてください。

{
  "questions": [
    {
      "question": "...",
      "tagLine": "...",
      "tags": ["...", "..."]
    }
  ]
}`,
      },
    ];

    // 3. Call LLM
    console.log("[QuestionGenerator] Calling LLM to generate questions...");

    // Use the default Flash model rather than the Pro model.
    // This task does not require heavy reasoning and Flash is less likely
    // to consume the output token budget with reasoning tokens.
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
        "[QuestionGenerator] Failed to get valid questions array from LLM response:",
        llmResponse
      );
      return;
    }

    const generatedQuestionObjects = llmResponse.questions;

    console.log(
      `[QuestionGenerator] LLM generated ${generatedQuestionObjects.length} question objects.`
    );

    // 4. Save questions to DB
    let savedCount = 0;

    for (const questionObj of generatedQuestionObjects) {
      const questionText = questionObj.question;
      const tagLine = questionObj.tagLine || "";
      const tags = Array.isArray(questionObj.tags)
        ? questionObj.tags
        : [];

      if (!questionText || typeof questionText !== "string") {
        console.warn(
          "[QuestionGenerator] Skipping invalid question object:",
          questionObj
        );
        continue;
      }

      try {
        // New SharpQuestion schema uses "content"
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
              createdAt: new Date(),
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

          // Link problems/solutions to this generated question asynchronously
          setTimeout(
            () => linkQuestionToAllItems(result._id.toString()),
            0
          );

          savedCount++;
        } else {
          console.warn(
            `[QuestionGenerator] Failed to save question: ${questionText}`
          );
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
}

export { generateSharpQuestions };
