import pLimit from "p-limit";
import Problem from "../models/Problem.js";
import QuestionLink from "../models/QuestionLink.js";
import SharpQuestion from "../models/SharpQuestion.js";
import Solution from "../models/Solution.js";
import { callLLM } from "../services/llmService.js";
import { emitExtractionUpdate } from "../services/socketService.js";

const DEFAULT_CONCURRENCY_LIMIT = 10;

/**
 * 新仕様・旧仕様の両方からProblem/Solution本文を取得する。
 * 新仕様: content
 * 旧仕様: statement
 */
function getItemText(item) {
  if (!item) return "";

  return (
    item.content ??
    item.statement ??
    ""
  ).trim();
}

/**
 * 新仕様・旧仕様の両方からSharpQuestion本文を取得する。
 * 新仕様: content
 * 旧仕様: questionText
 */
function getQuestionText(question) {
  if (!question) return "";

  return (
    question.content ??
    question.questionText ??
    ""
  ).trim();
}

/**
 * LLM用プロンプトを作成する。
 */
function buildLinkPrompt(questionText, itemText, itemType) {
  return [
    {
      role: "system",
      content: `You are an AI assistant that determines the relationship between a "Sharp Question" and a "Statement" that can be either a Problem or a Solution.

Your task is to determine whether the Statement is relevant to the Sharp Question.

Possible relationships:

1. "prompts_question"
   The Problem directly motivates, illustrates, or raises the issue addressed by the Sharp Question.

2. "answers_question"
   The Solution directly addresses or proposes a way to respond to the Sharp Question.

Respond ONLY in valid JSON using this exact structure:

{
  "is_relevant": boolean,
  "link_type": "prompts_question" | "answers_question" | null,
  "rationale": string,
  "relevanceScore": number
}

Rules:
- relevanceScore must be between 0.0 and 1.0.
- Use 1.0 for a strong and direct relationship.
- Use around 0.5 for a moderate relationship.
- Use 0.0 when there is no meaningful relationship.
- Keep rationale short, ideally 1-2 sentences.`,
    },
    {
      role: "user",
      content: `Sharp Question:
"${questionText}"

Statement type:
"${itemType}"

Statement:
"${itemText}"

Analyze the relationship and return JSON only.`,
    },
  ];
}

/**
 * QuestionLinkを作成・更新する。
 */
async function saveQuestionLink(
  questionId,
  itemId,
  itemType,
  llmResponse
) {
  if (!llmResponse?.is_relevant) {
    return null;
  }

  const linkType =
    llmResponse.link_type ||
    (itemType === "problem"
      ? "prompts_question"
      : "answers_question");

  const relevanceScore =
    typeof llmResponse.relevanceScore === "number"
      ? llmResponse.relevanceScore
      : 0.8;

  const rationale =
    typeof llmResponse.rationale === "string"
      ? llmResponse.rationale
      : "N/A";

  return QuestionLink.findOneAndUpdate(
    {
      questionId,
      linkedItemId: itemId,
    },
    {
      questionId,
      linkedItemId: itemId,
      linkedItemType: itemType,
      linkType,
      relevanceScore,
      rationale,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
}

/**
 * 特定のProblem / Solutionを、
 * 同じテーマ内のSharpQuestionへ関連付ける。
 *
 * @param {string} itemId
 * @param {"problem" | "solution"} itemType
 */
async function linkItemToQuestions(itemId, itemType) {
  console.log(
    `[LinkingWorker] Starting linking for ${itemType} ID: ${itemId}`
  );

  try {
    let item;

    if (itemType === "problem") {
      item = await Problem.findById(itemId);
    } else if (itemType === "solution") {
      item = await Solution.findById(itemId);
    } else {
      console.error(
        `[LinkingWorker] Invalid itemType: ${itemType}`
      );
      return;
    }

    if (!item) {
      console.error(
        `[LinkingWorker] ${itemType} not found with ID: ${itemId}`
      );
      return;
    }

    const itemText = getItemText(item);

    if (!itemText) {
      console.warn(
        `[LinkingWorker] Content is empty for ${itemType} ID: ${itemId}. Skipping linking.`
      );
      return;
    }

    const itemThemeId = item.themeId;

    if (!itemThemeId) {
      console.error(
        `[LinkingWorker] ${itemType} ${itemId} does not have a themeId. Cannot proceed with linking.`
      );
      return;
    }

    const questions = await SharpQuestion.find({
      themeId: itemThemeId,
    });

    if (!questions || questions.length === 0) {
      console.log(
        `[LinkingWorker] No sharp questions found in theme ${itemThemeId} to link against.`
      );
      return;
    }

    console.log(
      `[LinkingWorker] Found ${questions.length} questions in theme ${itemThemeId}. Checking links for ${itemType} ID: ${itemId}`
    );

    for (const question of questions) {
      const questionText = getQuestionText(question);

      if (!questionText) {
        console.warn(
          `[LinkingWorker] Question text is empty for Question ID: ${question._id}. Skipping.`
        );
        continue;
      }

      const promptMessages = buildLinkPrompt(
        questionText,
        itemText,
        itemType
      );

      try {
        const llmResponse = await callLLM(
          promptMessages,
          true
        );

        if (llmResponse?.is_relevant) {
          console.log(
            `[LinkingWorker] Found relevant link: Question ${question._id} <-> ${itemType} ${itemId} (Type: ${llmResponse.link_type})`
          );

          const savedLink = await saveQuestionLink(
            question._id,
            item._id,
            itemType,
            llmResponse
          );

          if (savedLink?._id) {
            console.log(
              `[LinkingWorker] Saved QuestionLink ID: ${savedLink._id}`
            );
          }
        } else {
          console.log(
            `[LinkingWorker] No relevant link: Question ${question._id} <-> ${itemType} ${itemId}`
          );
        }
      } catch (llmError) {
        console.error(
          `[LinkingWorker] LLM call failed for Question ${question._id} and ${itemType} ${itemId}:`,
          llmError
        );
      }
    }

    console.log(
      `[LinkingWorker] Finished linking for ${itemType} ID: ${itemId}`
    );

    emitExtractionUpdate(
      itemThemeId,
      null,
      itemType,
      item
    );
  } catch (error) {
    console.error(
      `[LinkingWorker] Error processing linking for ${itemType} ID ${itemId}:`,
      error
    );
  }
}

/**
 * 特定のSharpQuestionと、
 * 特定のProblem / Solutionを関連付ける。
 *
 * @param {string} questionId
 * @param {string} itemId
 * @param {"problem" | "solution"} itemType
 */
async function linkSpecificQuestionToItem(
  questionId,
  itemId,
  itemType
) {
  try {
    const question =
      await SharpQuestion.findById(questionId);

    if (!question) {
      console.error(
        `[LinkingWorker] SharpQuestion not found with ID: ${questionId}`
      );
      return;
    }

    const questionText =
      getQuestionText(question);

    if (!questionText) {
      console.warn(
        `[LinkingWorker] Question content is empty for Question ID: ${questionId}. Skipping linking.`
      );
      return;
    }

    let item;

    if (itemType === "problem") {
      item = await Problem.findById(itemId);
    } else if (itemType === "solution") {
      item = await Solution.findById(itemId);
    } else {
      console.error(
        `[LinkingWorker] Invalid itemType: ${itemType}`
      );
      return;
    }

    if (!item) {
      console.error(
        `[LinkingWorker] ${itemType} not found with ID: ${itemId}`
      );
      return;
    }

    const itemText = getItemText(item);

    if (!itemText) {
      console.warn(
        `[LinkingWorker] Content is empty for ${itemType} ID: ${itemId}. Skipping linking.`
      );
      return;
    }

    const promptMessages = buildLinkPrompt(
      questionText,
      itemText,
      itemType
    );

    try {
      const llmResponse = await callLLM(
        promptMessages,
        true
      );

      if (llmResponse?.is_relevant) {
        console.log(
          `[LinkingWorker] Found relevant link: Question ${questionId} <-> ${itemType} ${itemId} (Type: ${llmResponse.link_type})`
        );

        const savedLink = await saveQuestionLink(
          questionId,
          itemId,
          itemType,
          llmResponse
        );

        if (savedLink?._id) {
          console.log(
            `[LinkingWorker] Saved QuestionLink ID: ${savedLink._id}`
          );
        }
      } else {
        console.log(
          `[LinkingWorker] No relevant link: Question ${questionId} <-> ${itemType} ${itemId}`
        );
      }
    } catch (llmError) {
      console.error(
        `[LinkingWorker] LLM call failed for Question ${questionId} and ${itemType} ${itemId}:`,
        llmError
      );
    }
  } catch (error) {
    console.error(
      `[LinkingWorker] Error processing specific linking for Question ${questionId} and ${itemType} ${itemId}:`,
      error
    );
  }
}

/**
 * 既存の全Problem / Solutionを、
 * 新しく作成されたSharpQuestionへ関連付ける。
 *
 * @param {string} questionId
 */
async function linkQuestionToAllItems(questionId) {
  const concurrencyLimit =
    DEFAULT_CONCURRENCY_LIMIT;

  console.log(
    `[LinkingWorker] Starting linking for new Question ID: ${questionId} with concurrency ${concurrencyLimit}`
  );

  const limit = pLimit(concurrencyLimit);

  let completedTasks = 0;
  let totalTasks = 0;

  try {
    const question =
      await SharpQuestion.findById(questionId);

    if (!question) {
      console.error(
        `[LinkingWorker] SharpQuestion not found with ID: ${questionId}`
      );
      return;
    }

    const questionText =
      getQuestionText(question);

    if (!questionText) {
      console.warn(
        `[LinkingWorker] Question content is empty for Question ID: ${questionId}. Cannot proceed with linking.`
      );
      return;
    }

    const themeId = question.themeId;

    if (!themeId) {
      console.error(
        `[LinkingWorker] Question ${questionId} does not have a themeId. Cannot proceed with linking.`
      );
      return;
    }

    const problems = await Problem.find({
      themeId,
    });

    const solutions = await Solution.find({
      themeId,
    });

    totalTasks =
      problems.length + solutions.length;

    console.log(
      `[LinkingWorker] Linking Question ${questionId} to ${problems.length} problems and ${solutions.length} solutions from theme ${themeId}. Total tasks: ${totalTasks}`
    );

    if (totalTasks === 0) {
      console.log(
        `[LinkingWorker] No Problems or Solutions found for theme ${themeId}.`
      );
      return;
    }

    const tasks = [];

    for (const problem of problems) {
      tasks.push(
        limit(async () => {
          try {
            await linkSpecificQuestionToItem(
              questionId,
              problem._id.toString(),
              "problem"
            );
          } finally {
            completedTasks++;

            const progress =
              totalTasks > 0
                ? Math.round(
                    (completedTasks /
                      totalTasks) *
                      100
                  )
                : 100;

            console.log(
              `[LinkingWorker] Progress for Q ${questionId}: ${completedTasks}/${totalTasks} (${progress}%)`
            );
          }
        })
      );
    }

    for (const solution of solutions) {
      tasks.push(
        limit(async () => {
          try {
            await linkSpecificQuestionToItem(
              questionId,
              solution._id.toString(),
              "solution"
            );
          } finally {
            completedTasks++;

            const progress =
              totalTasks > 0
                ? Math.round(
                    (completedTasks /
                      totalTasks) *
                      100
                  )
                : 100;

            console.log(
              `[LinkingWorker] Progress for Q ${questionId}: ${completedTasks}/${totalTasks} (${progress}%)`
            );
          }
        })
      );
    }

    await Promise.all(tasks);

    console.log(
      `[LinkingWorker] Finished linking for new Question ID: ${questionId}`
    );
  } catch (error) {
    console.error(
      `[LinkingWorker] Error processing linking for Question ID ${questionId}:`,
      error
    );
  }
}

export {
  linkItemToQuestions,
  linkQuestionToAllItems,
  linkSpecificQuestionToItem,
};
