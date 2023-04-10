import { AxiosError, AxiosRequestConfig } from "axios";
import { memoize } from "lodash";
import {
  Configuration,
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
  OpenAIApi,
} from "openai";
import TaskQueue from "./task-queue";
import { sleep } from "./util";

export const GPT_3_5_TURBO = "gpt-3.5-turbo";
export const GPT_4 = "gpt-4";

export const contextWindowSize = {
  [GPT_3_5_TURBO]: 4000,
  [GPT_4]: 8000,
};

export type Model = typeof GPT_3_5_TURBO | typeof GPT_4;

const GPT4_DELAY = 10 * 1000;

const taskQueue = new TaskQueue();

export function createChatCompletion(
  request: CreateChatCompletionRequest,
  options?: AxiosRequestConfig
): Promise<CreateChatCompletionResponse> {
  const decisionPromise = taskQueue.run(
    async (): Promise<CreateChatCompletionResponse> => {
      try {
        const response = await openai().createChatCompletion(request, options);
        return response.data;
      } catch (e) {
        const { response } = e as AxiosError;
        switch (response?.status) {
          case 400:
            console.error(`ERROR: context window is full.`);
            break;
          case 429:
            console.error(`ERROR: rate limited.`);
            break;
          default:
            console.error(e);
            break;
        }
        throw e;
      }
    }
  );

  // avoid rate limits
  if (request.model === "gpt-4")
    decisionPromise.finally(() => taskQueue.run(() => sleep(GPT4_DELAY)));

  return decisionPromise;
}

// lazy load to avoid accessing OPENAI_API_KEY before env has been loaded
const openai = memoize(() => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Error("OPENAI_API_KEY is not configured!");

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  return new OpenAIApi(configuration);
});