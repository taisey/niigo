/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReferenceIds } from './ReferenceIds.js';
import type { SheetDate } from './SheetDate.js';
export type TaskInput = {
    /**
     * 追加時は省略するか空文字列にする。
     */
    id?: string;
    title: string;
    description?: string;
    due_date?: SheetDate;
    status: TaskInput.status;
    assigneesIds?: ReferenceIds;
    categoryIds?: ReferenceIds;
    roundIds?: ReferenceIds;
};
export namespace TaskInput {
    export enum status {
        TODO = 'Todo',
        IN_PROGRESS = 'In Progress',
        DONE = 'Done',
    }
}
