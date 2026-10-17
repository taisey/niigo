import type {IncomingMessage} from 'node:http';
import type {SheetStore} from '../sheets/store.js';
import type {OperationId} from './generated-routes.js';

type Handler = (request: IncomingMessage, params: Record<string, string>) => Promise<unknown>;

async function json(request: IncomingMessage): Promise<Record<string, any>> {
  let content = '';
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 1024 * 1024) throw new Error('送信データが大きすぎます。');
  }
  try { return JSON.parse(content); }
  catch { throw new Error('JSON を読み取れません。'); }
}

export function handlers(store: SheetStore): Record<OperationId, Handler> {
  return {
    getData: () => store.read(),
    saveEntity: async request => {
      const {name, item, expected} = await json(request);
      return store.save(name, item, expected);
    },
    closeRound: async request => {
      const {roundId, destinations, expected} = await json(request);
      return store.close(roundId, destinations, expected);
    },
    deleteTask: async (request, params) => {
      const taskId = params.taskId;
      if (!taskId) throw new Error('削除対象のタスクを指定してください。');
      const {expected} = await json(request);
      return store.deleteTask(taskId, expected);
    }
  };
}
