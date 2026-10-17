/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReferenceIds } from './ReferenceIds.js';
import type { SheetDate } from './SheetDate.js';
export type Task = {
    /**
     * タスクの ID。
     */
    id: string;
    /**
     * タスク名。
     */
    title: string;
    /**
     * 詳細。
     */
    description: string;
    due_date: SheetDate;
    status: Task.status;
    /**
     * 担当者名。複数の場合はカンマ区切り。
     */
    assignees: string;
    /**
     * カテゴリ名。
     */
    category: string;
    /**
     * ラウンド名。
     */
    round: string;
    /**
     * シートの非表示列にあるカテゴリ ID。
     */
    categoryId: string;
    /**
     * シートの非表示列にある担当者 ID の JSON 配列文字列。未設定時は空文字列。
     */
    assigneeIds: string;
    /**
     * シートの非表示列にあるラウンド ID。
     */
    roundId: string;
    categoryIds: ReferenceIds;
    assigneesIds: ReferenceIds;
    roundIds: ReferenceIds;
};
export namespace Task {
    export enum status {
        TODO = 'Todo',
        IN_PROGRESS = 'In Progress',
        DONE = 'Done',
    }
}
