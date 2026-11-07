import {ApiError, DataService, RoundsService, TasksService} from '../../api-generated/index.js';
import type {DataSnapshot} from '../../api-generated/index.js';
import type {EditableItem, EntityName} from './model';

export const api = {
  getData: () => DataService.getData(),
  saveEntity: (name: EntityName, item: EditableItem, expected: string): Promise<DataSnapshot> =>
    DataService.saveEntity({requestBody: {name, item, expected} as Parameters<typeof DataService.saveEntity>[0]['requestBody']}),
  closeRound: (roundId: string, destinations: Record<string, string>, expected: string, activateRoundId?: string): Promise<DataSnapshot> =>
    RoundsService.closeRound({requestBody: {roundId, destinations, expected, activateRoundId}}),
  deleteTask: (taskId: string, expected: string): Promise<DataSnapshot> =>
    TasksService.deleteTask({taskId, requestBody: {expected}}),
  reorderTask: (taskId: string, beforeTaskId: string, groupId: string, expectedOrder: string[]): Promise<DataSnapshot> =>
    TasksService.reorderTask({requestBody: {taskId, beforeTaskId, group: 'Categories', groupId, expectedOrder} as Parameters<typeof TasksService.reorderTask>[0]['requestBody']})
};

export function errorMessage(value: unknown): string {
  if (value instanceof ApiError) {
    const body = value.body as {error?: string} | undefined;
    return body?.error || value.message;
  }
  return value instanceof Error ? value.message : String(value);
}

export function isConflict(value: unknown): boolean {
  return value instanceof ApiError && value.status === 409;
}
