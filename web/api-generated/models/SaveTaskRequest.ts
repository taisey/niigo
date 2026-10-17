/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TaskInput } from './TaskInput.js';
export type SaveTaskRequest = {
    name: SaveTaskRequest.name;
    item: TaskInput;
    expected: string;
};
export namespace SaveTaskRequest {
    export enum name {
        TASKS = 'Tasks',
    }
}
