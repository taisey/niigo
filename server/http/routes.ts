import type {IncomingMessage} from 'node:http';
import type {SheetStore} from '../sheets/store.js';

type Route = {
  method: string;
  path: RegExp;
  handle: (request: IncomingMessage, match: RegExpMatchArray) => Promise<unknown>;
};

async function json(request: IncomingMessage): Promise<Record<string, any>> {
  let content = '';
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 1024 * 1024) throw new Error('送信データが大きすぎます。');
  }
  try { return JSON.parse(content); }
  catch { throw new Error('JSON を読み取れません。'); }
}

export function routes(store: SheetStore): Route[] {
  const handlers = {
    getData: () => store.read(),
    saveEntity: async (request: IncomingMessage) => {
      const {name, item, expected} = await json(request);
      return store.save(name, item, expected);
    },
    closeRound: async (request: IncomingMessage) => {
      const {roundId, destinations, expected} = await json(request);
      return store.close(roundId, destinations, expected);
    },
    deleteTask: async (request: IncomingMessage, match: RegExpMatchArray) => {
      const taskId = decodeURIComponent(match[1]);
      if (!taskId) throw new Error('削除対象のタスクを指定してください。');
      const {expected} = await json(request);
      return store.deleteTask(taskId, expected);
    }
  };
  return [
    {method: 'GET', path: /^\/data$/, handle: handlers.getData},
    {method: 'POST', path: /^\/save$/, handle: handlers.saveEntity},
    {method: 'POST', path: /^\/rounds\/close$/, handle: handlers.closeRound},
    {method: 'DELETE', path: /^\/tasks\/(.*)$/, handle: handlers.deleteTask}
  ];
}
