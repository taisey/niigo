/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SheetDate } from './SheetDate.js';
/**
 * 終了済みへの変更は /rounds/close で行う。
 */
export type RoundInput = {
    /**
     * 追加時は省略するか空文字列にする。
     */
    id?: string;
    name: string;
    description?: string;
    start_date?: SheetDate;
    end_date?: SheetDate;
    status: RoundInput.status;
};
export namespace RoundInput {
    export enum status {
        PLANNED = 'Planned',
        ACTIVE = 'Active',
        CLOSED = 'Closed',
    }
}
