import type {Category, DataSnapshot, Task} from '../../api-generated/index.js';

export type EntityName = keyof DataSnapshot;
export type View = 'dashboard' | 'tasks' | 'Categories' | 'Rounds' | 'Members';
export type EditableItem = Record<string, unknown>;
export const emptyData: DataSnapshot = {Tasks: [], Categories: [], Rounds: [], Members: []};
export const unsetFilter = '__unset__';
export const taskStatus: Record<string, string> = {Todo: '未着手', 'In Progress': '進行中', Done: '完了'};
export const roundStatus: Record<string, string> = {Planned: '計画中', Active: '進行中', Closed: '終了'};
export const labels: Record<EntityName, string> = {Tasks: 'タスク', Categories: 'カテゴリ', Rounds: 'ラウンド', Members: 'メンバー'};
export const listLabels: Record<EntityName, string> = {Tasks: 'タスク一覧', Categories: 'カテゴリ一覧', Rounds: 'ラウンド一覧', Members: 'メンバー一覧'};
export const listDescriptions: Record<EntityName, string> = {
  Tasks: 'タスクは、具体的にやることを一つずつ記録する項目です。',
  Categories: 'カテゴリをクリックするとタスク一覧が開きます。⠿ をドラッグして順番を変更できます。',
  Rounds: 'ラウンドをクリックすると、タスクをカテゴリ別に確認できます。',
  Members: 'メンバーは、タスクの担当者として設定できます。'
};

export function tasksByCategory(tasks: Task[], categories: Category[]) {
  const groups = categories.map(category => ({
    id: category.id,
    name: category.name,
    tasks: tasks.filter(task => task.categoryIds.includes(category.id))
  })).filter(group => group.tasks.length);
  const uncategorized = tasks.filter(task => !task.categoryIds.some(id => categories.some(category => category.id === id)));
  if (uncategorized.length) groups.push({id: '', name: 'カテゴリ未設定', tasks: uncategorized});
  return groups;
}

export function taskPayload(task: Task, status: string = task.status) {
  return {
    id: task.id, title: task.title, description: task.description, due_date: task.due_date,
    status, assigneesIds: task.assigneesIds, categoryIds: task.categoryIds, roundIds: task.roundIds
  };
}

export function validLinkedIds(ids: string[], values: Array<{id: string}>) {
  return ids.some(id => values.some(value => value.id === id));
}
